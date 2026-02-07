import { useState, useEffect, useCallback, useRef } from 'react';
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
import type { FolderNode } from '@/lib/folder-tree';
import { FolderTreeItem } from '@/components/FolderTreeItem';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ChevronDown, Folder, Check, Trash2, Search } from 'lucide-react';
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

  // Recent folders dropdown
  const [recentFolders, setRecentFolders] = useState<RecentFolder[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownSearch, setDropdownSearch] = useState('');
  const [searchedFolders, setSearchedFolders] = useState<RecentFolder[]>([]);
  const dropdownSearchRef = useRef<HTMLInputElement>(null);

  // Tree view (expanded "更多")
  const [view, setView] = useState<View>('compact');
  const [folderTree, setFolderTree] = useState<FolderNode[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Folder tree inline editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [contextMenuId, setContextMenuId] = useState<string | null>(null);
  const [treeSearch, setTreeSearch] = useState('');

  // ─── Init: load current tab bookmark ───
  useEffect(() => {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url === 'about:blank') {
          closingRef.current = true;
          window.close();
          return;
        }

        setUrl(tab.url);
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

          // Save as last used folder
          try {
            await setLastFolderId(targetFolderId);
          } catch { /* ignore */ }
        } else {
          bm = results[0];
        }

        setBookmarkId(bm.id);
        setTitle(bm.title);
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
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setDropdownSearch('');
        setSearchedFolders([]);
      }
    };
    if (dropdownOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  // ─── Handlers ───
  const handleSelectFolder = useCallback(async (folder: RecentFolder) => {
    if (!(await folderExists(folder.id))) return;
    setFolderId(folder.id);
    setFolderName(folder.title);
    setDropdownOpen(false);
    setDropdownSearch('');
    setSearchedFolders([]);
  }, []);

  const saveChanges = useCallback(async () => {
    if (!bookmarkId) return;
    try {
      // Verify bookmark still exists before saving
      const [existing] = await chrome.bookmarks.get(bookmarkId).catch(() => [null]);
      if (!existing) return;

      await updateBookmark(bookmarkId, { title });
      if (folderId && folderId !== existing.parentId) {
        await moveBookmark(bookmarkId, { parentId: folderId });
      }
      if (folderId) {
        await setLastFolderId(folderId);
      }
    } catch (err) {
      console.error('[Bookmark Pro Popup] save error:', err);
    }
  }, [bookmarkId, title, folderId]);

  const handleDone = useCallback(async () => {
    closingRef.current = true;
    await saveChanges();
    window.close();
  }, [saveChanges]);

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
  const handleTreeDoneRef = useRef<() => Promise<void>>();
  const viewRef = useRef(view);
  viewRef.current = view;
  const editingIdRef = useRef(editingId);
  editingIdRef.current = editingId;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || editingIdRef.current) return;
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
  const loadFolderTree = useCallback(async () => {
    const tree = await getBookmarkTree();
    const root = tree[0];
    if (!root) return;
    const built = buildFolderTree(root);
    setFolderTree(built);

    // Expand to current folder
    const ancestors = getAncestorIds(built, folderId);
    setExpandedIds(new Set([...ancestors, folderId]));
    setSelectedId(folderId);
  }, [folderId]);

  const handleShowTree = useCallback(async () => {
    await loadFolderTree();
    setTreeSearch('');
    setView('tree');
  }, [loadFolderTree]);

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
    // Update folderId so auto-save won't revert the move
    setFolderId(selectedId);
    closingRef.current = true;
    try {
      await updateBookmark(bookmarkId, { title });
      await moveBookmark(bookmarkId, { parentId: selectedId });
      await setLastFolderId(selectedId);
    } catch (err) {
      console.error('[Bookmark Pro Popup] tree-move error:', err);
    }
    window.close();
  }, [selectedId, bookmarkId, title]);
  handleTreeDoneRef.current = handleTreeDone;

  // ─── Folder tree inline editing (create / rename / delete) ───
  const refreshTree = useCallback(async () => {
    const tree = await getBookmarkTree();
    const root = tree[0];
    if (!root) return;
    setFolderTree(buildFolderTree(root));
  }, []);

  const handleCreateFolder = useCallback(async (parentId: string) => {
    try {
      const result = await createBookmark(parentId, '新建文件夹');
      // Expand parent and start editing new folder
      setExpandedIds((prev) => new Set([...prev, parentId]));
      await refreshTree();
      setEditingId(result.id);
      setEditingTitle('新建文件夹');
    } catch (err) {
      console.error('[Bookmark Pro Popup] create folder error:', err);
    }
  }, [refreshTree]);

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
      await removeBookmarkTree(id);
      await refreshTree();
      if (selectedId === id) setSelectedId(null);
    } catch (err) {
      console.error('[Bookmark Pro Popup] delete folder error:', err);
    }
  }, [selectedId, refreshTree]);

  // ─── Render ───
  if (loading) {
    return (
      <div className="w-[360px] p-4 flex items-center justify-center">
        <span className="text-xs text-muted-foreground">加载中…</span>
      </div>
    );
  }

  // ─── Tree view ───
  if (view === 'tree') {
    const trimmedSearch = treeSearch.trim();
    const displayTree = trimmedSearch ? filterFolderTree(folderTree, trimmedSearch) : folderTree;
    const displayExpandedIds = trimmedSearch ? collectAllIds(displayTree) : expandedIds;

    return (
      <div className="w-[360px] flex flex-col">
        <div className="px-3 pt-3 pb-2">
          <h2 className="text-sm font-medium">选择文件夹</h2>
        </div>
        <div className="px-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="书签名称"
            className="h-8 text-xs"
          />
        </div>
        <div className="px-3 pt-2 flex flex-col gap-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={treeSearch}
              onChange={(e) => setTreeSearch(e.target.value)}
              placeholder="搜索文件夹…"
              className="h-7 text-xs pl-7 pr-2"
            />
          </div>
          <ScrollArea className="h-[360px] border rounded-md min-w-0 overflow-hidden">
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
          </ScrollArea>
        </div>
        <div className="flex items-center gap-2 px-3 py-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setView('compact')}
          >
            返回
          </Button>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs text-destructive hover:text-destructive"
            onClick={handleRemove}
          >
            <Trash2 className="size-3.5 mr-1" />
            移除
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={handleTreeDone}
            disabled={!selectedId}
          >
            <Check className="size-3.5 mr-1" />
            完成
          </Button>
        </div>
      </div>
    );
  }

  // ─── Compact view ───
  return (
    <div className={cn('w-[360px] flex flex-col gap-2.5 p-3', dropdownOpen && 'min-h-[470px]')}>
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
            onClick={() => setDropdownOpen((v) => !v)}
            className={cn(
              'flex items-center w-full h-8 px-2 text-xs border rounded-md bg-background',
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
                  placeholder="搜索文件夹..."
                  className="flex-1 min-w-0 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
                  autoFocus
                />
              </div>
              {/* Folder list */}
              <div className="max-h-[360px] overflow-y-auto thin-scrollbar">
                {dropdownSearch.trim() ? (
                  searchedFolders.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground text-center">未找到匹配的文件夹</div>
                  ) : (
                    searchedFolders.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className={cn(
                          'flex items-start w-full px-2 py-1.5 text-xs hover:bg-accent/60 transition-colors gap-1.5',
                          f.id === folderId && 'bg-primary/10'
                        )}
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
                      className={cn(
                        'flex items-start w-full px-2 py-1.5 text-xs hover:bg-accent/60 transition-colors gap-1.5',
                        f.id === folderId && 'bg-primary/10'
                      )}
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
          className="h-7 text-xs"
          onClick={handleShowTree}
        >
          更多
        </Button>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs text-destructive hover:text-destructive"
          onClick={handleRemove}
        >
          <Trash2 className="size-3.5 mr-1" />
          移除
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={handleDone}
        >
          <Check className="size-3.5 mr-1" />
          完成
        </Button>
      </div>
    </div>
  );
}
