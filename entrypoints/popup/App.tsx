import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
  useMemo,
} from 'react';
import {
  getLastFolderId,
  getRecentBookmarkFolders,
  setLastFolderId,
  buildFolderPath,
  folderExists,
  MAX_FOLDER_OPTIONS,
  type RecentFolder,
} from '@/lib/bookmark-storage';
import {
  getBookmarkTree,
  createBookmark,
  getBookmarkInsertIndex,
  removeBookmarkTree,
  updateBookmark,
  moveBookmark,
  isProtectedNode,
} from '@/lib/bookmark-api';
import {
  buildFolderTree,
  getAncestorIds,
  findFolderNode,
  filterFolderTree,
  collectAllIds,
} from '@/lib/folder-tree';
import { toast } from '@/components/ui/toast';
import { Toaster } from '@/components/ui/toast';
import type { FolderNode } from '@/lib/folder-tree';
import { FolderTreeItem } from '@/components/FolderTreeItem';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSettings, type InsertPosition } from '@/hooks/useSettings';
import { Folder, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { InsertPositionField } from '@/components/InsertPositionField';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import {
  Combobox,
  ComboboxTrigger,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from '@/components/ui/combobox';

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
  const [dropdownExpanded, setDropdownExpanded] = useState(false);
  const dropdownOpenRef = useRef(dropdownOpen);
  const [dropdownSearch, setDropdownSearch] = useState('');

  // Tree view (expanded "更多")
  const [view, setView] = useState<View>('compact');
  const [folderTree, setFolderTree] = useState<FolderNode[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [treeListReady, setTreeListReady] = useState(false);
  const [autoRevealTargetId, setAutoRevealTargetId] = useState<string | null>(
    null
  );

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
  const [createFolderParentId, setCreateFolderParentId] = useState<
    string | null
  >(null);
  const [createFolderDialogTitle, setCreateFolderDialogTitle] =
    useState('新建文件夹');
  const [createFolderPosition, setCreateFolderPosition] =
    useState<InsertPosition>('bottom');
  const createFolderInputRef = useRef<HTMLInputElement>(null);

  // ─── Init: load current tab bookmark ───
  useEffect(() => {
    (async () => {
      try {
        // 创建书签前读取持久化的插入位置设置。
        await useSettings.getState().load();

        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (
          !tab?.url ||
          tab.url.startsWith('chrome://') ||
          tab.url.startsWith('chrome-extension://') ||
          tab.url === 'about:blank'
        ) {
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
          } catch {
            /* fallback to 书签栏 */
          }

          const index = await getBookmarkInsertIndex(
            targetFolderId,
            useSettings.getState().bookmarkInsertPosition
          );
          bm = await createBookmark(
            targetFolderId,
            tab.title || '',
            tab.url,
            index
          );
          setIsNewBookmark(true);

          // Save as last used folder
          try {
            await setLastFolderId(targetFolderId);
          } catch {
            /* ignore */
          }
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

  dropdownOpenRef.current = dropdownOpen;
  const dropdownOptions = useMemo(() => {
    const query = dropdownSearch.trim().toLocaleLowerCase();
    if (!query) return recentFolders;
    const options: RecentFolder[] = [];
    const visit = (nodes: FolderNode[], parentPath: string) => {
      for (const node of nodes) {
        const title = node.title || ROOT_NAMES[node.id] || '(无标题)';
        if (title.toLocaleLowerCase().includes(query)) {
          options.push({ id: node.id, title, path: parentPath });
        }
        visit(node.children, [parentPath, title].filter(Boolean).join(' / '));
      }
    };
    visit(folderTree, '');
    return options.slice(0, MAX_FOLDER_OPTIONS);
  }, [dropdownSearch, recentFolders, folderTree]);

  // ─── Handlers ───
  const handleSelectFolder = useCallback(async (folder: RecentFolder) => {
    if (!(await folderExists(folder.id))) return;
    setFolderId(folder.id);
    setFolderName(folder.title);
    setDropdownOpen(false);
  }, []);

  const persistBookmarkChanges = useCallback(
    async (nextFolderId?: string) => {
      if (!bookmarkId) return;
      const targetFolderId = nextFolderId ?? folderId;
      try {
        // Verify bookmark still exists before saving
        const [existing] = await chrome.bookmarks
          .get(bookmarkId)
          .catch(() => [null]);
        if (!existing) return;

        const changes: { title?: string; url?: string } = {};
        if (title !== existing.title) changes.title = title;
        if (url !== existing.url) changes.url = url;
        if (Object.keys(changes).length > 0) {
          await updateBookmark(bookmarkId, changes);
        }
        if (targetFolderId && targetFolderId !== existing.parentId) {
          const index = isNewBookmark
            ? await getBookmarkInsertIndex(
                targetFolderId,
                useSettings.getState().bookmarkInsertPosition
              )
            : undefined;
          await moveBookmark(bookmarkId, { parentId: targetFolderId, index });
        }
        if (targetFolderId) {
          await setLastFolderId(targetFolderId);
        }
      } catch (err) {
        console.error('[Bookmark Pro Popup] save error:', err);
      }
    },
    [bookmarkId, title, url, folderId, isNewBookmark]
  );

  const saveChanges = useCallback(async () => {
    await persistBookmarkChanges();
  }, [persistBookmarkChanges]);

  const handleDone = useCallback(async () => {
    closingRef.current = true;
    await saveChanges();
    window.close();
  }, [saveChanges]);

  const handleLocateInSidepanel = useCallback(
    async (nextFolderId?: string) => {
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
        toast.add({
          title: '无法在侧栏中定位该书签',
          description: '请稍后重试。',
          timeout: 3000,
        });
      }
    },
    [bookmarkId, persistBookmarkChanges]
  );

  // Auto-save when popup loses focus / closes (matches browser native behavior)
  const saveRef = useRef(saveChanges);
  saveRef.current = saveChanges;
  const closingRef = useRef(false);
  useEffect(() => {
    const handleUnload = () => {
      if (!closingRef.current) saveRef.current();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && !closingRef.current)
        saveRef.current();
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
        dropdownOpenRef.current ||
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
    const viewport = container.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]'
    );
    const target = container.querySelector<HTMLElement>(
      `[data-folder-id="${autoRevealTargetId}"]`
    );
    if (!viewport || !target) return;

    const viewportRect = viewport.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const nextScrollTop =
      viewport.scrollTop +
      (targetRect.top - viewportRect.top) -
      viewport.clientHeight / 2 +
      targetRect.height / 2;

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

  const handleCreateFolder = useCallback(
    (parentId: string) => {
      setCreateFolderParentId(parentId);
      setCreateFolderDialogTitle('新建文件夹');
      setCreateFolderPosition(folderInsertPosition);
      setCreateFolderDialogOpen(true);
    },
    [folderInsertPosition]
  );

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
  }, [
    createFolderParentId,
    createFolderDialogTitle,
    createFolderPosition,
    refreshTree,
  ]);

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

  const handleDeleteFolder = useCallback(
    async (id: string) => {
      if (isProtectedNode(id)) return;
      try {
        // Snapshot full subtree for undo
        const [nodeInfo] = await chrome.bookmarks.getSubTree(id);
        if (!nodeInfo) return;
        const deepClone = (
          n: chrome.bookmarks.BookmarkTreeNode
        ): chrome.bookmarks.BookmarkTreeNode => ({
          ...n,
          children: n.children?.map(deepClone),
        });
        const saved = deepClone(nodeInfo);

        await removeBookmarkTree(id);
        if (selectedId === id) setSelectedId(null);
        await refreshTree();

        const recreate = async (
          parentId: string,
          nodes: chrome.bookmarks.BookmarkTreeNode[]
        ) => {
          for (const child of nodes) {
            if (child.url) {
              await createBookmark(parentId, child.title, child.url);
            } else {
              const newFolder = await createBookmark(parentId, child.title);
              if (child.children?.length)
                await recreate(newFolder.id, child.children);
            }
          }
        };

        const undoToastId = toast.add({
          title: '已删除文件夹',
          description: saved.title || '(无标题)',
          actionProps: {
            children: '撤销',
            onClick: async () => {
              toast.close(undoToastId);

              const folder = await createBookmark(
                saved.parentId ?? '1',
                saved.title,
                undefined,
                saved.index
              );
              if (saved.children?.length)
                await recreate(folder.id, saved.children);
              await refreshTree();
            },
          },
          timeout: 5000,
        });
      } catch (err) {
        console.error('[Bookmark Pro Popup] delete folder error:', err);
      }
    },
    [selectedId, refreshTree]
  );

  // ─── Render ───
  if (loading) {
    return <div className="w-[360px] min-h-[188px] bg-background" />;
  }

  // ─── Tree view ───
  if (view === 'tree') {
    const trimmedSearch = treeSearch.trim();
    const displayTree = trimmedSearch
      ? filterFolderTree(folderTree, trimmedSearch)
      : folderTree;
    const displayExpandedIds = trimmedSearch
      ? collectAllIds(displayTree)
      : expandedIds;

    return (
      <div className="w-[360px] flex flex-col">
        <div className="px-3 pt-3 pb-2">
          <h2 className="text-sm font-medium">
            {isNewBookmark ? '已添加书签' : '编辑书签'} — 更多
          </h2>
        </div>
        <FieldGroup className="px-3">
          <Field>
            <FieldLabel htmlFor="popup-tree-title">名称</FieldLabel>
            <Input
              id="popup-tree-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="popup-tree-url">网址</FieldLabel>
            <Input
              id="popup-tree-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </Field>
        </FieldGroup>
        <div className="px-3 pt-2 flex flex-col gap-1.5">
          <InputGroup>
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              ref={treeSearchRef}
              value={treeSearch}
              onChange={(e) => setTreeSearch(e.target.value)}
              aria-label="搜索文件夹"
              placeholder="搜索文件夹…"
            />
          </InputGroup>
          <ScrollArea
            ref={treeScrollRef}
            className="h-[360px] border rounded-md min-w-0 overflow-hidden"
          >
            <div
              className={cn(
                'min-h-full',
                !treeListReady && 'opacity-0 pointer-events-none'
              )}
            >
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

            onClick={() => setView('compact')}
          >
            返回
          </Button>
          <Button
            variant="outline"
            size="sm"

            onClick={() => void handleLocateInSidepanel(selectedId ?? folderId)}
            disabled={!bookmarkId}
          >
            侧栏定位
          </Button>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"

            onClick={handleRemove}
          >
            移除
          </Button>
          <Button
            size="sm"

            onClick={handleTreeDone}
            disabled={!selectedId}
          >
            完成
          </Button>
        </div>
        <Dialog
          open={createFolderDialogOpen}
          onOpenChange={setCreateFolderDialogOpen}
        >
          <DialogContent
            initialFocus={() => {
              createFolderInputRef.current?.select();
              return createFolderInputRef.current;
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
                <FieldLabel htmlFor="popup-folder-title">名称</FieldLabel>
                <Input
                  id="popup-folder-title"
                  ref={createFolderInputRef}
                  value={createFolderDialogTitle}
                  onChange={(e) => setCreateFolderDialogTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    e.stopPropagation();
                    handleConfirmCreateFolder();
                  }}
                />
              </Field>
              <InsertPositionField
                value={createFolderPosition}
                onChange={setCreateFolderPosition}
              />
            </FieldGroup>
            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateFolderDialogOpen(false)}
              >
                取消
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmCreateFolder}
                disabled={!createFolderDialogTitle.trim()}
              >
                创建
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Toaster />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'w-[360px] flex flex-col gap-4 p-4',
        dropdownExpanded && 'min-h-[520px]'
      )}
    >
      <h2 className="text-sm font-medium">
        {isNewBookmark ? '已添加书签' : '编辑书签'}
      </h2>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="popup-title">名称</FieldLabel>
          <Input
            id="popup-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="popup-folder">文件夹</FieldLabel>
          <Combobox<RecentFolder>
            items={dropdownOptions}
            value={{ id: folderId, title: folderName, path: '' }}
            isItemEqualToValue={(item, value) => item.id === value.id}
            itemToStringLabel={(item) => item.title}
            itemToStringValue={(item) => item.id}
            filter={null}
            autoHighlight
            open={dropdownOpen}
            inputValue={dropdownSearch}
            onInputValueChange={(value, details) => {
              if (details.reason === 'input-change') setDropdownSearch(value);
            }}
            onOpenChange={(open) => {
              setDropdownOpen(open);
              if (open) {
                setDropdownExpanded(true);
                getBookmarkTree()
                  .then(([root]) => {
                    if (root) setFolderTree(buildFolderTree(root));
                  })
                  .catch(console.error);
              }
            }}
            onOpenChangeComplete={(open) => {
              if (!open && !dropdownOpenRef.current) {
                setDropdownSearch('');
                setDropdownExpanded(false);
              }
            }}
            onValueChange={(folder) => {
              if (folder) void handleSelectFolder(folder);
            }}
          >
            <ComboboxTrigger
              id="popup-folder"
              render={
                <Button variant="outline" className="w-full justify-between" />
              }
            >
              <Folder data-icon="inline-start" />
              <span className="flex-1 truncate text-left">{folderName}</span>
            </ComboboxTrigger>
            <ComboboxContent className="min-w-0">
              <ComboboxInput
                aria-label="搜索文件夹"
                placeholder="搜索文件夹…"
                showTrigger={false}
              />
              <ComboboxEmpty>
                {dropdownSearch.trim()
                  ? '未找到匹配的文件夹'
                  : '暂无最近文件夹'}
              </ComboboxEmpty>
              <ComboboxList>
                {(folder: RecentFolder) => (
                  <ComboboxItem key={folder.id} value={folder}>
                    <Folder />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{folder.title}</div>
                      {folder.path && (
                        <div className="truncate text-xs text-muted-foreground">
                          {folder.path}
                        </div>
                      )}
                    </div>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </Field>
      </FieldGroup>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleShowTree}>
          更多
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleLocateInSidepanel()}
          disabled={!bookmarkId}
        >
          侧栏定位
        </Button>
        <div className="flex-1" />
        <Button variant="destructive" size="sm" onClick={handleRemove}>
          移除
        </Button>
        <Button size="sm" onClick={handleDone}>
          完成
        </Button>
      </div>
      <Toaster />
    </div>
  );
}
