import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useBookmarkStore } from '@/hooks/useBookmarkStore';
import {
  getBookmarkTree,
  isFolder,
  moveBookmark as apiMoveBookmark,
  createBookmark,
  removeBookmarkTree,
  updateBookmark,
} from '@/lib/bookmark-api';
import { useSettings, type InsertPosition } from '@/hooks/useSettings';
import { toast } from '@/components/ui/toast';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import { InsertPositionField } from '@/components/InsertPositionField';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FolderTreeItem } from '@/components/FolderTreeItem';
import {
  buildFolderTree,
  getAncestorIds,
  getDescendantIds,
  findFolderNode,
  filterFolderTree,
  collectAllIds,
} from '@/lib/folder-tree';
import type { FolderNode } from '@/lib/folder-tree';
import { Search } from 'lucide-react';

export function MoveDialog() {
  const {
    moveDialogOpen,
    moveTargetNode,
    moveTargetNodes,
    closeMoveDialog,
    finishCloseMoveDialog,
    loadTree,
    clearSelection,
    undoDeleteFolder,
  } = useBookmarkStore();
  const settingsFolderPos = useSettings((s) => s.folderInsertPosition);
  const settingsBookmarkPos = useSettings((s) => s.bookmarkInsertPosition);
  const [folderTree, setFolderTree] = useState<FolderNode[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [folderPosition, setFolderPosition] =
    useState<InsertPosition>(settingsFolderPos);
  const [bookmarkPosition, setBookmarkPosition] =
    useState<InsertPosition>(settingsBookmarkPos);

  // Inline editing state for context-menu rename / create
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  // Track which node has context menu open (for highlight)
  const [contextMenuId, setContextMenuId] = useState<string | null>(null);
  // Search
  const [treeSearch, setTreeSearch] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const didAutoRevealSelectionRef = useRef(false);

  // --- New-folder dialog state ---
  const [nfOpen, setNfOpen] = useState(false);
  const [nfParentId, setNfParentId] = useState<string | null>(null);
  const [nfTitle, setNfTitle] = useState('');
  const [nfPosition, setNfPosition] =
    useState<InsertPosition>(settingsFolderPos);
  const nfInputRef = useRef<HTMLInputElement>(null);

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
    let active = true;
    (async () => {
      const tree = await getBookmarkTree();
      if (!active) return;
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
      didAutoRevealSelectionRef.current = false;
    })();
    return () => {
      active = false;
    };
  }, [moveDialogOpen, moveTargetNodes]);

  useEffect(() => {
    if (!moveDialogOpen) {
      didAutoRevealSelectionRef.current = false;
    }
  }, [moveDialogOpen]);

  // 打开面板时将初始选中项居中，后续点击不重复定位。
  useEffect(() => {
    if (!moveDialogOpen || !selectedId || didAutoRevealSelectionRef.current)
      return;
    const frame = requestAnimationFrame(() => {
      const container = scrollAreaRef.current;
      if (!container) return;
      const viewport = container.querySelector<HTMLElement>(
        '[data-slot="scroll-area-viewport"]'
      );
      const target = container.querySelector<HTMLElement>(
        `[data-folder-id="${selectedId}"]`
      );
      if (viewport && target) {
        target.scrollIntoView({ block: 'center', behavior: 'instant' });
        didAutoRevealSelectionRef.current = true;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [moveDialogOpen, selectedId, folderTree, expandedIds]);

  // --- Context menu handlers ---

  const handleCreateFolder = useCallback(
    (parentId: string) => {
      setNfParentId(parentId);
      setNfTitle('新建文件夹');
      setNfPosition(settingsFolderPos);
      setNfOpen(true);
    },
    [settingsFolderPos]
  );

  const handleNewFolderCreate = useCallback(async () => {
    if (!nfParentId || !nfTitle.trim()) return;
    try {
      const children = await chrome.bookmarks.getChildren(nfParentId);
      const folders = children.filter((c) => !c.url);
      const insertIndex = nfPosition === 'top' ? 0 : folders.length;
      const newFolder = await createBookmark(
        nfParentId,
        nfTitle.trim(),
        undefined,
        insertIndex
      );
      setNfOpen(false);
      setExpandedIds((prev) => new Set(prev).add(nfParentId));
      await refreshTree();
      await loadTree();
      setSelectedId(newFolder.id);
    } catch (err) {
      console.error('[Bookmark Pro] create folder in MoveDialog error:', err);
    }
  }, [nfParentId, nfTitle, nfPosition, refreshTree, loadTree]);

  const handleStartRename = useCallback((id: string, title: string) => {
    setEditingId(id);
    setEditingTitle(title);
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

  const handleDeleteFolder = useCallback(
    async (folderId: string) => {
      try {
        // Read full subtree before deleting (for undo)
        const [nodeInfo] = await chrome.bookmarks.getSubTree(folderId);
        if (!nodeInfo) return;
        const deepClone = (
          n: chrome.bookmarks.BookmarkTreeNode
        ): chrome.bookmarks.BookmarkTreeNode => ({
          ...n,
          children: n.children?.map(deepClone),
        });
        const saved = deepClone(nodeInfo);

        await removeBookmarkTree(folderId);

        // If the deleted folder was selected, clear selection
        if (selectedId === folderId) setSelectedId(null);

        await refreshTree();
        await loadTree();

        const undoToastId = toast.add({
          title: '已删除文件夹',
          description: saved.title || '(无标题)',
          actionProps: {
            children: '撤销',
            onClick: async () => {
              toast.close(undoToastId);

              await undoDeleteFolder(
                saved.title,
                saved.parentId ?? '1',
                saved.children ?? [],
                saved.index
              );
              await refreshTree();
            },
          },
          timeout: 5000,
        });
      } catch (err) {
        console.error('[Bookmark Pro] delete folder in MoveDialog error:', err);
      }
    },
    [selectedId, refreshTree, loadTree, undoDeleteFolder]
  );

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
    return {
      displayTree: filtered,
      displayExpandedIds: collectAllIds(filtered),
    };
  }, [treeSearch, folderTree, expandedIds]);

  const handleMove = async () => {
    if (moveTargetNodes.length === 0 || !selectedId) return;

    try {
      useBookmarkStore.setState({ _suppressReload: true });
      for (const targetNode of moveTargetNodes) {
        const currentParentId = targetNode.parentId;
        const isTargetFolder = isFolder(targetNode);
        // In batch mode with both types, use separate positions; otherwise use the applicable one
        const position =
          isBatchMode && hasFolders && hasBookmarks
            ? isTargetFolder
              ? folderPosition
              : bookmarkPosition
            : hasFolders
              ? folderPosition
              : bookmarkPosition;

        if (position === 'top') {
          // Get children of target folder
          const children = await chrome.bookmarks.getChildren(selectedId);
          if (isTargetFolder) {
            // Move folder to top (index 0)
            await apiMoveBookmark(targetNode.id, {
              parentId: selectedId,
              index: 0,
            });
          } else {
            // Move bookmark to right after last folder
            const folders = children.filter((c) => !c.url);
            const idx = folders.length;
            if (currentParentId === selectedId) {
              const currentIdx = targetNode.index ?? 0;
              await apiMoveBookmark(targetNode.id, {
                parentId: selectedId,
                index: currentIdx < idx ? idx - 1 : idx,
              });
            } else {
              await apiMoveBookmark(targetNode.id, {
                parentId: selectedId,
                index: idx,
              });
            }
          }
        } else {
          // Bottom: just move without index (appends to end)
          await apiMoveBookmark(targetNode.id, { parentId: selectedId });
        }
      }
      useBookmarkStore.setState({ _suppressReload: false });
      await loadTree();
      if (isBatchMode) clearSelection();
      closeMoveDialog();
    } catch (err) {
      useBookmarkStore.setState({ _suppressReload: false });
      await loadTree();
      console.error('[Bookmark Pro] move error:', err);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) closeMoveDialog();
  };

  const isSameLocation =
    !isBatchMode && moveTargetNode?.parentId === selectedId;

  const dialogTitle = isBatchMode
    ? `移动 ${moveTargetNodes.length} 个项目`
    : `移动 ${moveTargetNode?.title || '(无标题)'}`;

  return (
    <Dialog
      open={moveDialogOpen}
      onOpenChange={(open, details) => {
        if (!open && details.reason === 'escape-key' && editingId) {
          details.cancel();
          handleCancelRename();
          return;
        }
        handleOpenChange(open);
      }}
      onOpenChangeComplete={(open) => {
        if (!open) finishCloseMoveDialog();
      }}
    >
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto">
        <DialogHeader className="pb-0 pr-6 overflow-hidden">
          <DialogTitle className="truncate min-w-0" title={dialogTitle}>
            {dialogTitle}
          </DialogTitle>
          <DialogDescription className="sr-only">
            选择目标文件夹，并决定移动后项目插入到顶部还是底部。
          </DialogDescription>
        </DialogHeader>
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            value={treeSearch}
            onChange={(e) => setTreeSearch(e.target.value)}
            aria-label="搜索文件夹"
            placeholder="搜索文件夹…"
          />
        </InputGroup>
        <ScrollArea
          ref={scrollAreaRef}
          className="h-[360px] max-h-[calc(100vh-300px)] border rounded-md min-w-0 overflow-hidden"
        >
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
        <FieldGroup>
          {isBatchMode && hasFolders && hasBookmarks ? (
            <>
              <InsertPositionField
                label="文件夹插入位置"
                value={folderPosition}
                onChange={setFolderPosition}
              />
              <InsertPositionField
                label="书签插入位置"
                value={bookmarkPosition}
                onChange={setBookmarkPosition}
              />
            </>
          ) : (
            <InsertPositionField
              value={hasFolders ? folderPosition : bookmarkPosition}
              onChange={(value) => {
                setFolderPosition(value);
                setBookmarkPosition(value);
              }}
            />
          )}
        </FieldGroup>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenChange(false)}
          >
            取消
          </Button>
          <Button
            size="sm"
            onClick={handleMove}
            disabled={!selectedId || disabledIds.has(selectedId)}
          >
            {isSameLocation ? '移动' : '移动到此'}
          </Button>
        </DialogFooter>
      </DialogContent>
      <Dialog open={nfOpen} onOpenChange={setNfOpen}>
        <DialogContent
          initialFocus={() => {
            nfInputRef.current?.select();
            return nfInputRef.current;
          }}
        >
          <DialogHeader>
            <DialogTitle>新建文件夹</DialogTitle>
            <DialogDescription className="sr-only">
              在选中文件夹下创建文件夹
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="move-new-folder-title">名称</FieldLabel>
              <Input
                id="move-new-folder-title"
                ref={nfInputRef}
                value={nfTitle}
                onChange={(e) => setNfTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    handleNewFolderCreate();
                  }
                }}
              />
            </Field>
            <InsertPositionField value={nfPosition} onChange={setNfPosition} />
          </FieldGroup>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNfOpen(false)}
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleNewFolderCreate}
              disabled={!nfTitle.trim()}
            >
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
