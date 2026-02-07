import { useState, useEffect, useCallback, useMemo } from 'react';
import { useBookmarkStore } from '@/hooks/useBookmarkStore';
import { getBookmarkTree, isFolder, moveBookmark as apiMoveBookmark, createBookmark, removeBookmarkTree, updateBookmark } from '@/lib/bookmark-api';
import { useSettings, type InsertPosition } from '@/hooks/useSettings';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FolderTreeItem } from '@/components/FolderTreeItem';
import { buildFolderTree, getAncestorIds, getDescendantIds, findFolderNode, filterFolderTree, collectAllIds } from '@/lib/folder-tree';
import type { FolderNode } from '@/lib/folder-tree';
import { Search } from 'lucide-react';

export function MoveDialog() {
  const { moveDialogOpen, moveTargetNode, moveTargetNodes, closeMoveDialog, loadTree, clearSelection, undoDeleteFolder } = useBookmarkStore();
  const settingsFolderPos = useSettings((s) => s.folderInsertPosition);
  const settingsBookmarkPos = useSettings((s) => s.bookmarkInsertPosition);
  const [folderTree, setFolderTree] = useState<FolderNode[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [folderPosition, setFolderPosition] = useState<InsertPosition>(settingsFolderPos);
  const [bookmarkPosition, setBookmarkPosition] = useState<InsertPosition>(settingsBookmarkPos);

  // Inline editing state for context-menu rename / create
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  // Track which node has context menu open (for highlight)
  const [contextMenuId, setContextMenuId] = useState<string | null>(null);
  // Search
  const [treeSearch, setTreeSearch] = useState('');

  const isBatchMode = moveTargetNodes.length > 1;
  const hasFolders = isBatchMode && moveTargetNodes.some((n) => isFolder(n));
  const hasBookmarks = isBatchMode && moveTargetNodes.some((n) => !isFolder(n));

  // Refresh the folder tree while keeping expandedIds & selectedId
  const refreshTree = useCallback(async () => {
    const tree = await getBookmarkTree();
    const root = tree[0];
    if (!root) return;
    setFolderTree(buildFolderTree(root));
  }, []);

  // Load folder tree and expand to current location when dialog opens
  useEffect(() => {
    if (!moveDialogOpen || moveTargetNodes.length === 0) return;
    (async () => {
      const tree = await getBookmarkTree();
      const root = tree[0];
      if (!root) return;
      const folders = buildFolderTree(root);
      setFolderTree(folders);

      // Expand ancestors of the first item's parent
      const firstNode = moveTargetNodes[0];
      const parentId = firstNode.parentId ?? '1';
      const ancestors = getAncestorIds(folders, parentId);
      ancestors.add(parentId); // also expand the parent itself
      setExpandedIds(ancestors);
      setSelectedId(parentId);
      setFolderPosition(settingsFolderPos);
      setBookmarkPosition(settingsBookmarkPos);
      setEditingId(null);
      setTreeSearch('');
    })();
  }, [moveDialogOpen, moveTargetNodes]);

  // --- Context menu handlers ---

  const handleCreateFolder = useCallback(async (parentId: string) => {
    try {
      const newFolder = await createBookmark(parentId, '新文件夹');
      // Expand the parent so the new folder is visible
      setExpandedIds((prev) => new Set(prev).add(parentId));
      await refreshTree();
      await loadTree();
      // Start inline rename on the new folder
      setEditingId(newFolder.id);
      setEditingTitle('新文件夹');
    } catch (err) {
      console.error('[Bookmark Pro] create folder in MoveDialog error:', err);
    }
  }, [refreshTree, loadTree]);

  const handleStartRename = useCallback((id: string, title: string) => {
    // Delay so ContextMenu fully unmounts before entering edit mode
    setTimeout(() => {
      setEditingId(id);
      setEditingTitle(title);
    }, 80);
  }, []);

  const handleCommitRename = useCallback(async () => {
    if (!editingId) return;
    const trimmed = editingTitle.trim();
    if (trimmed) {
      try {
        await updateBookmark(editingId, { title: trimmed });
        await refreshTree();
        await loadTree();
      } catch (err) {
        console.error('[Bookmark Pro] rename in MoveDialog error:', err);
      }
    }
    setEditingId(null);
    setEditingTitle('');
  }, [editingId, editingTitle, refreshTree, loadTree]);

  const handleCancelRename = useCallback(() => {
    setEditingId(null);
    setEditingTitle('');
  }, []);

  const handleDeleteFolder = useCallback(async (folderId: string) => {
    try {
      // Read full subtree before deleting (for undo)
      const [nodeInfo] = await chrome.bookmarks.getSubTree(folderId);
      if (!nodeInfo) return;
      const deepClone = (n: chrome.bookmarks.BookmarkTreeNode): chrome.bookmarks.BookmarkTreeNode => ({
        ...n,
        children: n.children?.map(deepClone),
      });
      const saved = deepClone(nodeInfo);

      await removeBookmarkTree(folderId);

      // If the deleted folder was selected, clear selection
      if (selectedId === folderId) setSelectedId(null);

      await refreshTree();
      await loadTree();

      toast('已删除文件夹', {
        description: saved.title || '(无标题)',
        action: {
          label: '撤销',
          onClick: async () => {
            await undoDeleteFolder(
              saved.title,
              saved.parentId ?? '1',
              saved.children ?? [],
              saved.index
            );
            await refreshTree();
          },
        },
        duration: 5000,
      });
    } catch (err) {
      console.error('[Bookmark Pro] delete folder in MoveDialog error:', err);
    }
  }, [selectedId, refreshTree, loadTree, undoDeleteFolder]);

  // IDs that should be disabled (self + descendants for all selected folders)
  const disabledIds = useMemo(() => {
    const ids = new Set<string>();
    for (const node of moveTargetNodes) {
      if (isFolder(node)) {
        ids.add(node.id);
        const selfNode = findFolderNode(folderTree, node.id);
        if (selfNode) {
          const descIds = getDescendantIds(selfNode.children);
          descIds.forEach((id) => ids.add(id));
        }
      }
    }
    return ids;
  }, [moveTargetNodes, folderTree]);

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Filtered tree and expanded IDs for search
  const { displayTree, displayExpandedIds } = useMemo(() => {
    const q = treeSearch.trim();
    if (!q) return { displayTree: folderTree, displayExpandedIds: expandedIds };
    const filtered = filterFolderTree(folderTree, q);
    return { displayTree: filtered, displayExpandedIds: collectAllIds(filtered) };
  }, [treeSearch, folderTree, expandedIds]);

  const handleMove = async () => {
    if (moveTargetNodes.length === 0 || !selectedId) return;

    try {
      for (const targetNode of moveTargetNodes) {
        const currentParentId = targetNode.parentId;
        const isTargetFolder = isFolder(targetNode);
        // In batch mode with both types, use separate positions; otherwise use the applicable one
        const position = isBatchMode && hasFolders && hasBookmarks
          ? (isTargetFolder ? folderPosition : bookmarkPosition)
          : (hasFolders ? folderPosition : bookmarkPosition);

        if (position === 'top') {
          // Get children of target folder
          const children = await chrome.bookmarks.getChildren(selectedId);
          if (isTargetFolder) {
            // Move folder to top (index 0)
            await apiMoveBookmark(targetNode.id, { parentId: selectedId, index: 0 });
          } else {
            // Move bookmark to right after last folder
            const folders = children.filter(c => !c.url);
            const idx = folders.length;
            if (currentParentId === selectedId) {
              const currentIdx = targetNode.index ?? 0;
              await apiMoveBookmark(targetNode.id, {
                parentId: selectedId,
                index: currentIdx < idx ? idx - 1 : idx,
              });
            } else {
              await apiMoveBookmark(targetNode.id, { parentId: selectedId, index: idx });
            }
          }
        } else {
          // Bottom: just move without index (appends to end)
          await apiMoveBookmark(targetNode.id, { parentId: selectedId });
        }
      }
      await loadTree();
      if (isBatchMode) clearSelection();
      closeMoveDialog();
    } catch (err) {
      console.error('[Bookmark Pro] move error:', err);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) closeMoveDialog();
  };

  const isSameLocation = !isBatchMode && moveTargetNode?.parentId === selectedId;

  const dialogTitle = isBatchMode
    ? `移动 ${moveTargetNodes.length} 个项目`
    : `移动 ${moveTargetNode?.title || '(无标题)'}`;

  return (
    <Dialog open={moveDialogOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[340px] p-4 gap-3" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader className="pb-0 pr-6 overflow-hidden">
          <DialogTitle className="text-sm truncate min-w-0" title={dialogTitle}>
            {dialogTitle}
          </DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={treeSearch}
            onChange={(e) => setTreeSearch(e.target.value)}
            placeholder="搜索文件夹…"
            className="h-7 text-xs pl-7 pr-2"
          />
        </div>
        <ScrollArea className="h-[360px] max-h-[calc(100vh-240px)] border rounded-md min-w-0 overflow-hidden">
          {displayTree.map((node) => (
            <FolderTreeItem
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedId}
              expandedIds={displayExpandedIds}
              disabledIds={disabledIds}
              editingId={editingId}
              editingTitle={editingTitle}
              contextMenuId={contextMenuId}
              onSelect={setSelectedId}
              onToggle={handleToggle}
              onCreateFolder={handleCreateFolder}
              onStartRename={handleStartRename}
              onCommitRename={handleCommitRename}
              onCancelRename={handleCancelRename}
              onEditingTitleChange={setEditingTitle}
              onDelete={handleDeleteFolder}
              onContextMenuChange={setContextMenuId}
            />
          ))}
        </ScrollArea>
        {/* Position toggles: show separate toggles when batch has both types */}
        {isBatchMode && hasFolders && hasBookmarks ? (
          <div className="space-y-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">文件夹插入位置</label>
              <div className="flex gap-1">
                <Button
                  variant={folderPosition === 'top' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFolderPosition('top')}
                  className="h-7 text-xs flex-1"
                >
                  顶部
                </Button>
                <Button
                  variant={folderPosition === 'bottom' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFolderPosition('bottom')}
                  className="h-7 text-xs flex-1"
                >
                  底部
                </Button>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">书签插入位置</label>
              <div className="flex gap-1">
                <Button
                  variant={bookmarkPosition === 'top' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setBookmarkPosition('top')}
                  className="h-7 text-xs flex-1"
                >
                  顶部
                </Button>
                <Button
                  variant={bookmarkPosition === 'bottom' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setBookmarkPosition('bottom')}
                  className="h-7 text-xs flex-1"
                >
                  底部
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">插入位置</label>
            <div className="flex gap-1">
              <Button
                variant={(hasFolders ? folderPosition : bookmarkPosition) === 'top' ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setFolderPosition('top'); setBookmarkPosition('top'); }}
                className="h-7 text-xs flex-1"
              >
                顶部
              </Button>
              <Button
                variant={(hasFolders ? folderPosition : bookmarkPosition) === 'bottom' ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setFolderPosition('bottom'); setBookmarkPosition('bottom'); }}
                className="h-7 text-xs flex-1"
              >
                底部
              </Button>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-0">
          <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)} className="h-7 text-xs">
            取消
          </Button>
          <Button
            size="sm"
            onClick={handleMove}
            disabled={!selectedId || disabledIds.has(selectedId)}
            className="h-7 text-xs"
          >
            {isSameLocation ? '移动' : '移动到此'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
