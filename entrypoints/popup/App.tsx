import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import {
  getLastFolderId,
  getRecentBookmarkFolders,
  setLastFolderId,
  buildFolderPath,
  folderExists,
  type RecentFolder,
} from '@/lib/bookmark-storage';
import {
  getBookmarkTree,
  createBookmark,
  removeBookmarkTree,
  updateBookmark,
  moveBookmark,
  isProtectedNode,
  searchBookmarks,
} from '@/lib/bookmark-api';
import { buildFolderTree, getAncestorIds, findFolderNode, filterFolderTree, collectAllIds } from '@/lib/folder-tree';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import type { FolderNode } from '@/lib/folder-tree';
import { FolderTreeItem } from '@/components/FolderTreeItem';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSettings, type InsertPosition } from '@/hooks/useSettings';
import { ChevronDown, Folder, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

type View = 'compact' | 'tree';

const ROOT_NAMES: Record<string, string> = {
  '1': '书签栏',
  '2': '其他书签',
  '3': '移动设备书签',
};

export default function App() {
  // Current bookmark info
  const [bookmarkId, setBookmarkId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [folderId, setFolderId] = useState('1');
  const [folderName, setFolderName] = useState('书签栏');
  const [loading, setLoading] = useState(true);
  const [isNewBookmark, setIsNewBookmark] = useState(false);

  // Recent folders dropdown
  const [recentFolders, setRecentFolders] = useState<RecentFolder[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownOpenRef = useRef(dropdownOpen);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownListRef = useRef<HTMLDivElement>(null);
  const [dropdownSearch, setDropdownSearch] = useState('');
  const [searchedFolders, setSearchedFolders] = useState<RecentFolder[]>([]);
  const [dropdownHighlightedId, setDropdownHighlightedId] = useState<string | null>(null);
  const dropdownSearchRef = useRef<HTMLInputElement>(null);

  // Tree view (expanded "更多")
  const [view, setView] = useState<View>('compact');
  const [folderTree, setFolderTree] = useState<FolderNode[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [treeListReady, setTreeListReady] = useState(false);
  const [autoRevealTargetId, setAutoRevealTargetId] = useState<string | null>(null);

  // Folder tree inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [contextMenuId, setContextMenuId] = useState<string | null>(null);
  const [treeSearch, setTreeSearch] = useState('');
  const treeSearchRef = useRef<HTMLInputElement>(null);
  const treeScrollRef = useRef<HTMLDivElement>(null);

  // Create folder dialog (popup tree view)
  const folderInsertPosition = useSettings((s) => s.folderInsertPosition);
  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null);
  const [createFolderDialogTitle, setCreateFolderDialogTitle] = useState('新建文件夹');
  const [createFolderPosition, setCreateFolderPosition] = useState<InsertPosition>('bottom');
  const createFolderInputRef = useRef<HTMLInputElement>(null);


  // ─── Init: load current tab bookmark ───
  useEffect(() => {
    (async () => {
      try {
        // Load persisted settings so folderInsertPosition is up to date
        await useSettings.getState().load();

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url === 'about:blank') {
          closingRef.current = true;
          window.close();
          return;
        }

        const results = await chrome.bookmarks.search({ url: tab.url });

        let bm: chrome.bookmarks.BookmarkTreeNode;

        if (results.length === 0) {
          // Not bookmarked → quick-add to last-used folder
          let targetFolderId = '1';
          try {
            const lastId = await getLastFolderId();
            if (await folderExists(lastId)) targetFolderId = lastId;
          } catch { /* fallback to 书签栏 */ }

          bm = await chrome.bookmarks.create({
            parentId: targetFolderId,
            title: tab.title || '',
            url: tab.url,
          });
          setIsNewBookmark(true);

          // Save as last used folder
          try {
            await setLastFolderId(targetFolderId);
          } catch { /* ignore */ }
        } else {
          bm = results[0];
        }

        setBookmarkId(bm.id);
        setTitle(bm.title);
        setUrl(bm.url || tab.url);
        setFolderId(bm.parentId || '1');

        // Resolve folder name
        const parentId = bm.parentId || '1';
        if (ROOT_NAMES[parentId]) {
          setFolderName(ROOT_NAMES[parentId]);
        } else {
          try {
            const [parent] = await chrome.bookmarks.get(parentId);
            setFolderName(parent?.title || '未知文件夹');
          } catch {
            setFolderName('未知文件夹');
          }
        }

        // Load recent folders from actual Chrome bookmarks data
        const recent = await getRecentBookmarkFolders();
        setRecentFolders(recent);
      } catch (err) {
        console.error('[Bookmark Pro Popup] init error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    dropdownOpenRef.current = dropdownOpen;
  }, [dropdownOpen]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setDropdownSearch('');
        setSearchedFolders([]);
        setDropdownHighlightedId(null);
      }
    };
    if (dropdownOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  const dropdownOptions = dropdownSearch.trim() ? searchedFolders : recentFolders;

  useEffect(() => {
    if (!dropdownOpen) return;
    const nextHighlightedId =
      dropdownOptions.find((folder) => folder.id === folderId)?.id ??
      dropdownOptions[0]?.id ??
      null;
    setDropdownHighlightedId((prev) => (
      prev && dropdownOptions.some((folder) => folder.id === prev)
        ? prev
        : nextHighlightedId
    ));
  }, [dropdownOpen, dropdownOptions, folderId]);

  useEffect(() => {
    if (!dropdownOpen || !dropdownHighlightedId) return;
    const list = dropdownListRef.current;
    const target = list?.querySelector<HTMLElement>(`[data-folder-option-id="${dropdownHighlightedId}"]`);
    target?.scrollIntoView({ block: 'nearest' });
  }, [dropdownOpen, dropdownHighlightedId]);

  // ─── Handlers ───
  const handleSelectFolder = useCallback(async (folder: RecentFolder) => {
    if (!(await folderExists(folder.id))) return;
    setFolderId(folder.id);
    setFolderName(folder.title);
    setDropdownOpen(false);
    setDropdownSearch('');
    setSearchedFolders([]);
    setDropdownHighlightedId(null);
  }, []);

  const handleDropdownNavigate = useCallback((direction: 1 | -1) => {
    if (dropdownOptions.length === 0) return;
    const currentIndex = dropdownHighlightedId
      ? dropdownOptions.findIndex((folder) => folder.id === dropdownHighlightedId)
      : -1;
    const fallbackIndex = dropdownOptions.findIndex((folder) => folder.id === folderId);
    const startIndex = currentIndex >= 0 ? currentIndex : Math.max(fallbackIndex, 0);
    const nextIndex = (startIndex + direction + dropdownOptions.length) % dropdownOptions.length;
    setDropdownHighlightedId(dropdownOptions[nextIndex]?.id ?? null);
  }, [dropdownOptions, dropdownHighlightedId, folderId]);

  const handleDropdownSelectHighlighted = useCallback(() => {
    const targetFolder =
      dropdownOptions.find((folder) => folder.id === dropdownHighlightedId) ??
      dropdownOptions.find((folder) => folder.id === folderId);
    if (targetFolder) {
      void handleSelectFolder(targetFolder);
    }
  }, [dropdownOptions, dropdownHighlightedId, folderId, handleSelectFolder]);

  const persistBookmarkChanges = useCallback(async (nextFolderId?: string) => {
    if (!bookmarkId) return;
    const targetFolderId = nextFolderId ?? folderId;
    try {
      // Verify bookmark still exists before saving
      const [existing] = await chrome.bookmarks.get(bookmarkId).catch(() => [null]);
      if (!existing) return;

      const changes: { title?: string; url?: string } = {};
      if (title !== existing.title) changes.title = title;
      if (url !== existing.url) changes.url = url;
      if (Object.keys(changes).length > 0) {
        await updateBookmark(bookmarkId, changes);
      }
      if (targetFolderId && targetFolderId !== existing.parentId) {
        await moveBookmark(bookmarkId, { parentId: targetFolderId });
      }
      if (targetFolderId) {
        await setLastFolderId(targetFolderId);
      }
    } catch (err) {
      console.error('[Bookmark Pro Popup] save error:', err);
    }
  }, [bookmarkId, title, url, folderId]);

  const saveChanges = useCallback(async () => {
    await persistBookmarkChanges();
  }, [persistBookmarkChanges]);

  const handleDone = useCallback(async () => {
    closingRef.current = true;
    await saveChanges();
    window.close();
  }, [saveChanges]);

  const handleLocateInSidepanel = useCallback(async (nextFolderId?: string) => {
    if (!bookmarkId) return;

    try {
      const currentWindow = await chrome.windows.getCurrent();
      if (typeof currentWindow.id !== 'number') {
        throw new Error('Unable to resolve current window ID.');
      }

      closingRef.current = true;
      await chrome.runtime.sendMessage({
        type: 'PREPARE_LOCATE_BOOKMARK_FROM_POPUP',
        windowId: currentWindow.id,
      });
      await persistBookmarkChanges(nextFolderId);
      await chrome.runtime.sendMessage({
        type: 'LOCATE_BOOKMARK_FROM_POPUP',
        nodeId: bookmarkId,
      });
      window.close();
    } catch (err) {
      closingRef.current = false;
      console.error('[Bookmark Pro Popup] locate in sidepanel error:', err);
      toast('无法在侧栏中定位该书签', {
        description: '请稍后重试。',
        duration: 3000,
      });
    }
  }, [bookmarkId, persistBookmarkChanges]);

  // Auto-save when popup loses focus / closes (matches browser native behavior)
  const saveRef = useRef(saveChanges);
  saveRef.current = saveChanges;
  const closingRef = useRef(false);
  useEffect(() => {
    const handleUnload = () => { if (!closingRef.current) saveRef.current(); };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && !closingRef.current) saveRef.current();
    };
    window.addEventListener('beforeunload', handleUnload);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Enter key confirms and closes (skip when renaming a tree node)
  const handleDoneRef = useRef(handleDone);
  handleDoneRef.current = handleDone;
  const handleTreeDoneRef = useRef<(() => Promise<void>) | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const editingIdRef = useRef(editingId);
  editingIdRef.current = editingId;
  const createFolderDialogOpenRef = useRef(createFolderDialogOpen);
  createFolderDialogOpenRef.current = createFolderDialogOpen;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (
        e.key !== 'Enter' ||
        editingIdRef.current ||
        createFolderDialogOpenRef.current ||
        (dropdownOpenRef.current && !!target && dropdownRef.current?.contains(target)) ||
        target?.closest('[data-slot="dialog-content"]')
      ) {
        return;
      }
      e.preventDefault();
      if (viewRef.current === 'tree') handleTreeDoneRef.current?.();
      else handleDoneRef.current();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleRemove = useCallback(async () => {
    if (!bookmarkId) return;
    closingRef.current = true;
    try {
      await chrome.bookmarks.remove(bookmarkId);
    } catch (err) {
      console.error('[Bookmark Pro Popup] remove error:', err);
    }
    window.close();
  }, [bookmarkId]);

  // ─── Tree view logic ───
  const loadFolderTree = useCallback(async (targetFolderId: string) => {
    const tree = await getBookmarkTree();
    const root = tree[0];
    if (!root) return;
    const built = buildFolderTree(root);
    setFolderTree(built);

    // Expand to current folder
    const ancestors = getAncestorIds(built, targetFolderId);
    setExpandedIds(new Set([...ancestors, targetFolderId]));
    setSelectedId(targetFolderId);
  }, []);

  const handleShowTree = useCallback(async () => {
    setTreeSearch('');
    setTreeListReady(false);
    setAutoRevealTargetId(folderId);
    await loadFolderTree(folderId);
    setView('tree');
  }, [folderId, loadFolderTree]);

  // Auto-focus search and auto-scroll selected item when tree view mounts
  useEffect(() => {
    if (view !== 'tree') return;
    treeSearchRef.current?.focus();
  }, [view]);

  useLayoutEffect(() => {
    if (view !== 'tree' || !autoRevealTargetId) return;
    const container = treeScrollRef.current;
    if (!container) return;
    const viewport = container.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    const target = container.querySelector<HTMLElement>(`[data-folder-id="${autoRevealTargetId}"]`);
    if (!viewport || !target) return;

    const viewportRect = viewport.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const nextScrollTop =
      viewport.scrollTop +
      (targetRect.top - viewportRect.top) -
      (viewport.clientHeight / 2) +
      (targetRect.height / 2);

    viewport.scrollTop = Math.max(0, nextScrollTop);
    setAutoRevealTargetId(null);
    setTreeListReady(true);
  }, [view, autoRevealTargetId, folderTree, expandedIds, treeSearch]);

  useEffect(() => {
    if (view !== 'tree') return;
    if (autoRevealTargetId) return;
    setTreeListReady(true);
  }, [view, autoRevealTargetId]);

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleTreeSelect = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const handleTreeDone = useCallback(async () => {
    if (!selectedId || !bookmarkId) return;
    closingRef.current = true;
    try {
      await persistBookmarkChanges(selectedId);
    } catch (err) {
      console.error('[Bookmark Pro Popup] tree-move error:', err);
    }
    window.close();
  }, [selectedId, bookmarkId, persistBookmarkChanges]);
  handleTreeDoneRef.current = handleTreeDone;

  // ─── Folder tree inline editing (create / rename / delete) ───
  const refreshTree = useCallback(async () => {
    const tree = await getBookmarkTree();
    const root = tree[0];
    if (!root) return;
    setFolderTree(buildFolderTree(root));
  }, []);

  const handleCreateFolder = useCallback((parentId: string) => {
    setCreateFolderParentId(parentId);
    setCreateFolderDialogTitle('新建文件夹');
    setCreateFolderPosition(folderInsertPosition);
    setCreateFolderDialogOpen(true);
  }, [folderInsertPosition]);

  const handleConfirmCreateFolder = useCallback(async () => {
    if (!createFolderParentId || !createFolderDialogTitle.trim()) return;
    setCreateFolderDialogOpen(false);
    try {
      const children = await chrome.bookmarks.getChildren(createFolderParentId);
      const folders = children.filter((c) => !c.url);
      const insertIndex = createFolderPosition === 'top' ? 0 : folders.length;
      const result = await createBookmark(
        createFolderParentId,
        createFolderDialogTitle.trim(),
        undefined,
        insertIndex
      );
      setExpandedIds((prev) => new Set([...prev, createFolderParentId!]));
      await refreshTree();
      setSelectedId(result.id);
    } catch (err) {
      console.error('[Bookmark Pro Popup] create folder error:', err);
    }
  }, [createFolderParentId, createFolderDialogTitle, createFolderPosition, refreshTree]);

  // Auto-focus the input when create folder dialog opens
  useEffect(() => {
    if (createFolderDialogOpen) {
      const timer = setTimeout(() => {
        createFolderInputRef.current?.focus();
        createFolderInputRef.current?.select();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [createFolderDialogOpen]);

  const handleStartRename = useCallback((id: string, currentTitle: string) => {
    // Delay so ContextMenu fully unmounts before entering edit mode
    setTimeout(() => {
      setEditingId(id);
      setEditingTitle(currentTitle);
    }, 0);
  }, []);

  const handleCommitRename = useCallback(async () => {
    if (!editingId) return;
    const trimmed = editingTitle.trim();
    if (trimmed) {
      try {
        await updateBookmark(editingId, { title: trimmed });
        await refreshTree();
      } catch (err) {
        console.error('[Bookmark Pro Popup] rename error:', err);
      }
    }
    setEditingId(null);
    setEditingTitle('');
  }, [editingId, editingTitle, refreshTree]);

  const handleCancelRename = useCallback(() => {
    setEditingId(null);
    setEditingTitle('');
  }, []);

  const handleDeleteFolder = useCallback(async (id: string) => {
    if (isProtectedNode(id)) return;
    try {
      // Snapshot full subtree for undo
      const [nodeInfo] = await chrome.bookmarks.getSubTree(id);
      if (!nodeInfo) return;
      const deepClone = (n: chrome.bookmarks.BookmarkTreeNode): chrome.bookmarks.BookmarkTreeNode => ({
        ...n,
        children: n.children?.map(deepClone),
      });
      const saved = deepClone(nodeInfo);

      await removeBookmarkTree(id);
      if (selectedId === id) setSelectedId(null);
      await refreshTree();

      const recreate = async (parentId: string, nodes: chrome.bookmarks.BookmarkTreeNode[]) => {
        for (const child of nodes) {
          if (child.url) {
            await createBookmark(parentId, child.title, child.url);
          } else {
            const newFolder = await createBookmark(parentId, child.title);
            if (child.children?.length) await recreate(newFolder.id, child.children);
          }
        }
      };

      toast('已删除文件夹', {
        description: saved.title || '(无标题)',
        action: {
          label: '撤销',
          onClick: async () => {
            const folder = await createBookmark(saved.parentId ?? '1', saved.title, undefined, saved.index);
            if (saved.children?.length) await recreate(folder.id, saved.children);
            await refreshTree();
          },
        },
        duration: 5000,
      });
    } catch (err) {
      console.error('[Bookmark Pro Popup] delete folder error:', err);
    }
  }, [selectedId, refreshTree]);

  // ─── Render ───
  if (loading) {
    return <div className="w-[360px] min-h-[188px] bg-background" />;
  }

  // ─── Tree view ───
  if (view === 'tree') {
    const trimmedSearch = treeSearch.trim();
    const displayTree = trimmedSearch ? filterFolderTree(folderTree, trimmedSearch) : folderTree;
    const displayExpandedIds = trimmedSearch ? collectAllIds(displayTree) : expandedIds;

    return (
      <div className="w-[360px] flex flex-col">
        <div className="px-3 pt-3 pb-2">
          <h2 className="text-sm font-medium">{isNewBookmark ? '已添加书签' : '编辑书签'} — 更多</h2>
        </div>
        <div className="px-3 flex flex-col gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="书签名称"
            className="h-8 text-xs"
          />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="网址"
            className="h-8 text-xs"
          />
        </div>
        <div className="px-3 pt-2 flex flex-col gap-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              ref={treeSearchRef}
              value={treeSearch}
              onChange={(e) => setTreeSearch(e.target.value)}
              placeholder="搜索文件夹…"
              className="h-7 text-xs pl-7 pr-2"
            />
          </div>
          <ScrollArea ref={treeScrollRef} className="h-[360px] border rounded-md min-w-0 overflow-hidden">
            <div className={cn('min-h-full', !treeListReady && 'opacity-0 pointer-events-none')}>
              {displayTree.map((node) => (
                <FolderTreeItem
                  key={node.id}
                  node={node}
                  depth={0}
                  selectedId={selectedId}
                  expandedIds={displayExpandedIds}
                  disabledIds={new Set()}
                  editingId={editingId}
                  editingTitle={editingTitle}
                  contextMenuId={contextMenuId}
                  onSelect={handleTreeSelect}
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
            </div>
          </ScrollArea>
        </div>
        <div className="flex items-center gap-2 px-3 py-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs cursor-pointer"
            onClick={() => setView('compact')}
          >
            返回
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs cursor-pointer"
            onClick={() => void handleLocateInSidepanel(selectedId ?? folderId)}
            disabled={!bookmarkId}
          >
            侧栏定位
          </Button>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs text-destructive hover:text-destructive cursor-pointer"
            onClick={handleRemove}
          >
            移除
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs cursor-pointer"
            onClick={handleTreeDone}
            disabled={!selectedId}
          >
            完成
          </Button>
        </div>
        {/* New folder dialog */}
        <Dialog
          open={createFolderDialogOpen}
          onOpenChange={(open) => { if (!open) setCreateFolderDialogOpen(false); }}
        >
          <DialogContent className="max-w-[320px] p-4 gap-3">
            <DialogHeader className="pb-0">
              <DialogTitle className="text-sm">新建文件夹</DialogTitle>
              <DialogDescription className="sr-only">
                在当前选中的父文件夹下新建文件夹，并选择插入位置。
              </DialogDescription>
            </DialogHeader>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">名称</label>
              <Input
                ref={createFolderInputRef}
                value={createFolderDialogTitle}
                onChange={(e) => setCreateFolderDialogTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  e.stopPropagation();
                  handleConfirmCreateFolder();
                }}
                placeholder="文件夹名称"
                className="h-7 text-xs"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">插入位置</label>
              <div className="flex gap-1">
                <Button
                  variant={createFolderPosition === 'top' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCreateFolderPosition('top')}
                  className="h-7 text-xs flex-1"
                >
                  顶部
                </Button>
                <Button
                  variant={createFolderPosition === 'bottom' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCreateFolderPosition('bottom')}
                  className="h-7 text-xs flex-1"
                >
                  底部
                </Button>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateFolderDialogOpen(false)}
                className="h-7 text-xs"
              >
                取消
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmCreateFolder}
                disabled={!createFolderDialogTitle.trim()}
                className="h-7 text-xs"
              >
                创建
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Toaster />
      </div>
    );
  }

  // ─── Compact view ───
  return (
    <div className={cn('w-[360px] flex flex-col gap-2.5 p-3', dropdownOpen && 'min-h-[520px]')}>
      {/* Header */}
      <h2 className="text-sm font-medium">{isNewBookmark ? '已添加书签' : '编辑书签'}</h2>
      {/* Name */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground shrink-0 w-10">名称</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="书签名称"
          className="h-8 text-xs flex-1 min-w-0"
        />
      </div>

      {/* Folder select */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground shrink-0 w-10">文件夹</label>
        <div ref={dropdownRef} className="relative flex-1 min-w-0">
          <button
            type="button"
            onClick={() => {
              setDropdownOpen((v) => {
                const nextOpen = !v;
                if (!nextOpen) {
                  setDropdownSearch('');
                  setSearchedFolders([]);
                  setDropdownHighlightedId(null);
                }
                return nextOpen;
              });
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (!dropdownOpen) {
                  setDropdownOpen(true);
                } else {
                  handleDropdownNavigate(e.key === 'ArrowDown' ? 1 : -1);
                }
              }
              if (e.key === 'Enter' && dropdownOpen) {
                e.preventDefault();
                handleDropdownSelectHighlighted();
              }
              if (e.key === 'Escape' && dropdownOpen) {
                e.preventDefault();
                setDropdownOpen(false);
                setDropdownSearch('');
                setSearchedFolders([]);
                setDropdownHighlightedId(null);
              }
            }}
            className={cn(
              'flex items-center w-full h-8 px-2 text-xs border rounded-md bg-background cursor-pointer',
              'hover:bg-accent/50 transition-colors',
              dropdownOpen && 'ring-2 ring-ring ring-offset-1'
            )}
          >
            <Folder className="size-3.5 text-yellow-600 mr-1.5 shrink-0" />
            <span className="truncate flex-1 text-left">{folderName}</span>
            <ChevronDown className={cn('size-3.5 text-muted-foreground ml-1 shrink-0 transition-transform', dropdownOpen && 'rotate-180')} />
          </button>
          {dropdownOpen && (
            <div className="absolute z-50 left-0 right-0 top-full mt-1 rounded-md border bg-popover shadow-md">
              {/* Search box */}
              <div className="flex items-center gap-1.5 px-2 py-1.5 border-b">
                <Search className="size-3 text-muted-foreground shrink-0" />
                <input
                  ref={dropdownSearchRef}
                  type="text"
                  value={dropdownSearch}
                  onChange={(e) => {
                    const q = e.target.value;
                    setDropdownSearch(q);
                    if (!q.trim()) {
                      setSearchedFolders([]);
                      return;
                    }
                    searchBookmarks(q.trim()).then(async (results) => {
                      const folders = results.filter((n) => !n.url);
                      const mapped = await Promise.all(
                        folders.slice(0, 30).map(async (n) => ({
                          id: n.id,
                          title: n.title || '(无标题)',
                          path: n.parentId ? await buildFolderPath(n.parentId) : '',
                        }))
                      );
                      setSearchedFolders(mapped);
                    });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                      e.preventDefault();
                      handleDropdownNavigate(e.key === 'ArrowDown' ? 1 : -1);
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleDropdownSelectHighlighted();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setDropdownOpen(false);
                      setDropdownSearch('');
                      setSearchedFolders([]);
                      setDropdownHighlightedId(null);
                    }
                  }}
                  placeholder="搜索文件夹..."
                  className="flex-1 min-w-0 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
                  autoFocus
                />
              </div>
              {/* Folder list */}
              <div ref={dropdownListRef} className="h-[360px] overflow-y-auto thin-scrollbar">
                {dropdownSearch.trim() ? (
                  searchedFolders.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground text-center">未找到匹配的文件夹</div>
                  ) : (
                    searchedFolders.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        data-folder-option-id={f.id}
                        title={[f.title, f.path].filter(Boolean).join('\n')}
                        className={cn(
                          'flex items-start w-full px-2 py-1.5 text-xs hover:bg-accent/60 transition-colors gap-1.5 cursor-pointer',
                          f.id === folderId && 'bg-primary/10',
                          f.id === dropdownHighlightedId && 'bg-accent/60'
                        )}
                        onMouseEnter={() => setDropdownHighlightedId(f.id)}
                        onClick={() => handleSelectFolder(f)}
                      >
                        <Folder className="size-3 text-yellow-600 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0 text-left">
                          <div className="truncate">{f.title}</div>
                          <div className="text-[10px] text-muted-foreground truncate">{f.path}</div>
                        </div>
                        {f.id === folderId && <Check className="size-3 text-primary shrink-0 mt-0.5" />}
                      </button>
                    ))
                  )
                ) : recentFolders.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-muted-foreground text-center">暂无最近文件夹</div>
                ) : (
                  recentFolders.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      data-folder-option-id={f.id}
                      title={[f.title, f.path].filter(Boolean).join('\n')}
                      className={cn(
                        'flex items-start w-full px-2 py-1.5 text-xs hover:bg-accent/60 transition-colors gap-1.5 cursor-pointer',
                        f.id === folderId && 'bg-primary/10',
                        f.id === dropdownHighlightedId && 'bg-accent/60'
                      )}
                      onMouseEnter={() => setDropdownHighlightedId(f.id)}
                      onClick={() => handleSelectFolder(f)}
                    >
                      <Folder className="size-3 text-yellow-600 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0 text-left">
                        <div className="truncate">{f.title}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{f.path}</div>
                      </div>
                      {f.id === folderId && <Check className="size-3 text-primary shrink-0 mt-0.5" />}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-0.5">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs cursor-pointer"
          onClick={handleShowTree}
        >
          更多
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs cursor-pointer"
          onClick={() => void handleLocateInSidepanel()}
          disabled={!bookmarkId}
        >
          侧栏定位
        </Button>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs text-destructive hover:text-destructive cursor-pointer"
          onClick={handleRemove}
        >
          移除
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs cursor-pointer"
          onClick={handleDone}
        >
          完成
        </Button>
      </div>
      <Toaster />
    </div>
  );
}
