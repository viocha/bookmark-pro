import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useBookmarkStore } from '@/hooks/useBookmarkStore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { toast } from '@/components/ui/toast';
import {
  isProtectedNode,
  getAllUrls,
} from '@/lib/bookmark-api';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  FileText,
  Folder,
  Pencil,
  Trash2,
  ExternalLink,
  AppWindow,
  MapPin,
  FolderPlus,
  FolderInput,
  FolderOpenDot,
  EyeOff,
  Copy,
  BookmarkPlus,
} from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { BookmarkText } from '@/components/BookmarkText';
import { buildBookmarkFolderPaths, SEARCH_PAGE_SIZE } from '@/lib/bookmark-search';
import { getTruncatedTitleProps } from '@/lib/truncated-title';

export function SearchResults() {
  const searchResults = useBookmarkStore(s => s.searchResults);
  const hasQuery = useBookmarkStore(s => Boolean(s.searchQuery.trim()));
  const tree = useBookmarkStore(s => s.tree);
  const {
    openEditDialog,
    deleteNode,
    undoDeleteBookmark,
    openMoveDialog,
    openCreateFolderDialog,
  } = useBookmarkStore.getState();
  const rootRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState({ results: searchResults, limit: SEARCH_PAGE_SIZE });
  const limit = page.results === searchResults ? page.limit : SEARCH_PAGE_SIZE;
  const { folders, bookmarks, ordered } = useMemo(() => {
    const folders = (searchResults ?? []).filter(n => !n.url);
    const bookmarks = (searchResults ?? []).filter(n => n.url);
    return { folders, bookmarks, ordered: [...folders, ...bookmarks] };
  }, [searchResults]);
  const folderPaths = useMemo(() => buildBookmarkFolderPaths(tree), [tree]);
  const visible = ordered.slice(0, limit);

  useLayoutEffect(() => {
    const viewport = rootRef.current?.querySelector('[data-slot="scroll-area-viewport"]');
    if (viewport) viewport.scrollTop = 0;
  }, [searchResults]);

  useEffect(() => {
    if (visible.length >= ordered.length) return;
    const viewport = rootRef.current?.querySelector('[data-slot="scroll-area-viewport"]');
    const sentinel = sentinelRef.current;
    if (!viewport || !sentinel) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setPage(current => ({
          results: searchResults,
          limit: (current.results === searchResults ? current.limit : SEARCH_PAGE_SIZE) + SEARCH_PAGE_SIZE,
        }));
      }
    }, { root: viewport, rootMargin: '200px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [searchResults, visible.length, ordered.length]);

  if (!searchResults || searchResults.length === 0) {
    return (
      <Empty className="h-full">
        <EmptyDescription>
          {hasQuery ? '没有找到匹配的结果' : '请输入搜索词'}
        </EmptyDescription>
      </Empty>
    );
  }

  const handleDeleteFolder = (node: chrome.bookmarks.BookmarkTreeNode) => {
    const deepClone = (
      n: chrome.bookmarks.BookmarkTreeNode
    ): chrome.bookmarks.BookmarkTreeNode => ({
      ...n,
      children: n.children?.map(deepClone),
    });
    const saved = deepClone(node);
    deleteNode(node);
    const undoToastId = toast.add({
      title: '已删除文件夹',
      description: saved.title || '(无标题)',
      actionProps: {
        children: '撤销',
        onClick: () => {
          toast.close(undoToastId);
          return useBookmarkStore
            .getState()
            .undoDeleteFolder(
              saved.title,
              saved.parentId ?? '1',
              saved.children ?? [],
              saved.index
            );
        },
      },
      timeout: 5000,
    });
  };

  const handleDeleteBookmark = (node: chrome.bookmarks.BookmarkTreeNode) => {
    const saved = { ...node };
    deleteNode(node);
    const undoToastId = toast.add({
      title: '已删除书签',
      description: <span className="block truncate">{saved.title || '(无标题)'}</span>,
      actionProps: {
        children: '撤销',
        onClick: () => {
          toast.close(undoToastId);
          return undoDeleteBookmark(saved);
        },
      },
      timeout: 5000,
    });
  };

  return (
    <ScrollArea ref={rootRef} className="h-full">
      <div className="py-0.5">
        <div className="px-2 py-1 text-[11px] text-muted-foreground">
          找到 {folders.length > 0 ? `${folders.length} 个文件夹、` : ''}
          {bookmarks.length} 个书签
        </div>
        {visible.filter(node => !node.url).map((node) => (
          <SearchFolderItem
            key={node.id}
            node={node}
            path={folderPaths.get(node.parentId ?? '') ?? ''}
            onOpen={() =>
              useBookmarkStore
                .getState()
                .locateNode(node.id, { expandTarget: true })
            }
            onLocate={() => useBookmarkStore.getState().locateNode(node.id)}
            onEdit={() => openEditDialog(node)}
            onMove={() => openMoveDialog(node)}
            onDelete={() => handleDeleteFolder(node)}
            onCreateFolder={() => openCreateFolderDialog(node.id)}
          />
        ))}
        {visible.filter(node => node.url).map((node) => (
          <SearchResultItem
            key={node.id}
            node={node}
            path={folderPaths.get(node.parentId ?? '') ?? ''}
            onEdit={() => openEditDialog(node)}
            onMove={() => openMoveDialog(node)}
            onDelete={() => handleDeleteBookmark(node)}
            onLocate={() => useBookmarkStore.getState().locateNode(node.id)}
          />
        ))}
        {visible.length < ordered.length && <div ref={sentinelRef} className="h-1" aria-hidden="true" />}
      </div>
    </ScrollArea>
  );
}

function SearchFolderItem({
  node,
  path,
  onOpen,
  onLocate,
  onEdit,
  onMove,
  onDelete,
  onCreateFolder,
}: {
  node: chrome.bookmarks.BookmarkTreeNode;
  path: string;
  onOpen: () => void;
  onLocate: () => void;
  onEdit: () => void;
  onMove: () => void;
  onDelete: () => void;
  onCreateFolder: () => void;
}) {
  const isProtected = isProtectedNode(node.id);
  const { addBookmark, openAddBookmarkDialog } = useBookmarkStore.getState();
  const bookmarkInsertPosition = useSettings(s => s.bookmarkInsertPosition);

  const titleAttr = [node.title, path]
    .filter(Boolean)
    .join('\n');

  const handleAddCurrentPage = async () => {
    try {
      let tab: chrome.tabs.Tab | undefined;
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      tab = tabs[0];
      if (!tab?.url || !tab?.title) {
        const fallbackTabs = await chrome.tabs.query({
          active: true,
          lastFocusedWindow: true,
        });
        tab = fallbackTabs[0];
      }
      if (tab?.url && tab?.title) {
        const [existing] = await chrome.bookmarks.search({ url: tab.url });
        if (existing) {
          toast.add({
            title: '书签已存在',
            description: existing.title || '(无标题)',
            timeout: 3000,
          });
          return;
        }
        const newNode = await addBookmark(
          node.id,
          tab.title,
          tab.url,
          bookmarkInsertPosition
        );
        openAddBookmarkDialog(newNode, tab.title, tab.url);
      }
    } catch (err) {
      console.error('[Bookmark Pro] addCurrentPage error:', err);
    }
  };

  const handleOpenAll = () => {
    const urls = getAllUrls(node);
    urls.forEach((url) => chrome.tabs.create({ url }));
  };
  const handleOpenAllNewWindow = () => {
    const urls = getAllUrls(node);
    if (urls.length > 0) chrome.windows.create({ url: urls });
  };
  const handleOpenAllIncognito = () => {
    const urls = getAllUrls(node);
    if (urls.length > 0) chrome.windows.create({ url: urls, incognito: true });
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="flex items-start py-1 h-auto min-h-[28px] px-2 cursor-pointer select-none rounded-md transition-colors hover:bg-accent/60 active:bg-accent data-[state=open]:bg-accent/60 text-xs gap-1 overflow-hidden"
        onClick={onOpen}
      >
        <span className="flex items-center justify-center size-4 shrink-0 mt-0.5">
          <Folder className="size-3.5 text-yellow-600" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="w-fit max-w-full truncate" {...getTruncatedTitleProps(titleAttr)}>
            {node.title || '(无标题)'}
          </div>
          {path && (
            <div className="w-fit max-w-full truncate text-[10px] text-muted-foreground" {...getTruncatedTitleProps(titleAttr)}>
              {path}
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuGroup>
          <ContextMenuItem onClick={onLocate}>
            <MapPin />
            显示所在位置
          </ContextMenuItem>
          <ContextMenuItem onClick={handleAddCurrentPage}>
            <BookmarkPlus />
            添加当前页面
          </ContextMenuItem>
          <ContextMenuItem onClick={onCreateFolder}>
            <FolderPlus />
            新建文件夹
          </ContextMenuItem>
          {!isProtected && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={onEdit}>
                <Pencil />
                编辑
              </ContextMenuItem>
              <ContextMenuItem onClick={onMove}>
                <FolderInput />
                移动
              </ContextMenuItem>
              <ContextMenuItem onClick={onDelete} variant="destructive">
                <Trash2 />
                删除
              </ContextMenuItem>
            </>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleOpenAll}>
            <FolderOpenDot />
            打开全部书签
          </ContextMenuItem>
          <ContextMenuItem onClick={handleOpenAllNewWindow}>
            <AppWindow />
            在新窗口打开全部
          </ContextMenuItem>
          <ContextMenuItem onClick={handleOpenAllIncognito}>
            <EyeOff />
            在隐私窗口打开全部
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function SearchResultItem({
  node,
  path,
  onEdit,
  onMove,
  onDelete,
  onLocate,
}: {
  node: chrome.bookmarks.BookmarkTreeNode;
  path: string;
  onEdit: () => void;
  onMove: () => void;
  onDelete: () => void;
  onLocate: () => void;
}) {
  const handleClick = (e: React.MouseEvent) => {
    if (!node.url) return;
    // Let browser handle modifier clicks natively via <a> href
    if (e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) {
      return;
    }
    // Plain click: navigate in current tab
    e.preventDefault();
    chrome.tabs.update({ url: node.url }).catch(() => {
      chrome.tabs.create({ url: node.url! });
    });
  };
  const handleOpenNewTab = () => {
    if (node.url) chrome.tabs.create({ url: node.url });
  };
  const handleOpenNewWindow = () => {
    if (node.url) chrome.windows.create({ url: node.url });
  };
  const handleOpenIncognito = () => {
    if (node.url) chrome.windows.create({ url: node.url, incognito: true });
  };
  const handleCopyLink = () => {
    if (node.url) {
      navigator.clipboard.writeText(node.url);
      toast.add({ title: '已复制链接', description: node.url, timeout: 2000 });
    }
  };

  const titleAttr = [node.title, node.url, path]
    .filter(Boolean)
    .join('\n');

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <a
            href={node.url}
            className="flex items-start py-1 h-auto min-h-[28px] px-2 cursor-pointer select-none rounded-md transition-colors hover:bg-accent/60 active:bg-accent data-[state=open]:bg-accent/60 text-xs gap-1 overflow-hidden"
            onClick={handleClick}
          >
            <span className="flex items-center justify-center size-4 shrink-0 mt-0.5">
              {node.url ? (
                <img
                  src={`chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(node.url)}&size=16`}
                  className="size-3.5"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (
                      e.target as HTMLImageElement
                    ).nextElementSibling?.classList.remove('hidden');
                  }}
                />
              ) : null}
              <FileText className="size-3.5 text-muted-foreground hidden" />
            </span>
            <div className="flex-1 min-w-0">
              <BookmarkText title={node.title} url={node.url} tooltip={titleAttr} />
              {path && (
                <div className="w-fit max-w-full truncate text-[10px] text-muted-foreground" {...getTruncatedTitleProps(titleAttr)}>
                  {path}
                </div>
              )}
            </div>
          </a>
        }
      />
      <ContextMenuContent className="w-48">
        <ContextMenuGroup>
          <ContextMenuItem onClick={onLocate}>
            <MapPin />
            显示所在位置
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={onEdit}>
            <Pencil />
            编辑
          </ContextMenuItem>
          <ContextMenuItem onClick={onMove}>
            <FolderInput />
            移动
          </ContextMenuItem>
          <ContextMenuItem onClick={onDelete} variant="destructive">
            <Trash2 />
            删除
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleOpenNewTab}>
            <ExternalLink />
            在新标签页打开
          </ContextMenuItem>
          <ContextMenuItem onClick={handleOpenNewWindow}>
            <AppWindow />
            在新窗口打开
          </ContextMenuItem>
          <ContextMenuItem onClick={handleOpenIncognito}>
            <EyeOff />
            在隐私窗口打开
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleCopyLink}>
            <Copy />
            复制链接
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}
