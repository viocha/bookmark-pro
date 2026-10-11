import { useEffect, useState } from 'react';
import { useBookmarkStore } from '@/hooks/useBookmarkStore';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import {
  getBookmarkPath,
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

export function SearchResults() {
  const store = useBookmarkStore();
  const {
    searchResults,
    isSearching,
    searchQuery,
    openEditDialog,
    deleteNode,
    undoDeleteBookmark,
    openMoveDialog,
    openCreateFolderDialog,
  } = store;

  if (isSearching) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner aria-label="搜索中" />
      </div>
    );
  }

  if (!searchResults || searchResults.length === 0) {
    return (
      <Empty className="h-full">
        <EmptyDescription>
          {searchQuery ? '没有找到匹配的结果' : '请输入搜索词'}
        </EmptyDescription>
      </Empty>
    );
  }

  const folders = searchResults.filter((n) => !n.url);
  const bookmarks = searchResults.filter((n) => n.url);

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
      description: saved.title || '(无标题)',
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
    <ScrollArea className="h-full">
      <div className="py-0.5">
        <div className="px-2 py-1 text-[11px] text-muted-foreground">
          找到 {folders.length > 0 ? `${folders.length} 个文件夹、` : ''}
          {bookmarks.length} 个书签
        </div>
        {folders.map((node) => (
          <SearchFolderItem
            key={node.id}
            node={node}
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
        {bookmarks.map((node) => (
          <SearchResultItem
            key={node.id}
            node={node}
            onEdit={() => openEditDialog(node)}
            onMove={() => openMoveDialog(node)}
            onDelete={() => handleDeleteBookmark(node)}
            onLocate={() => useBookmarkStore.getState().locateNode(node.id)}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

function SearchFolderItem({
  node,
  onOpen,
  onLocate,
  onEdit,
  onMove,
  onDelete,
  onCreateFolder,
}: {
  node: chrome.bookmarks.BookmarkTreeNode;
  onOpen: () => void;
  onLocate: () => void;
  onEdit: () => void;
  onMove: () => void;
  onDelete: () => void;
  onCreateFolder: () => void;
}) {
  const [path, setPath] = useState('');
  const isProtected = isProtectedNode(node.id);
  const { addBookmark, openAddBookmarkDialog } = useBookmarkStore();
  const { bookmarkInsertPosition } = useSettings();

  useEffect(() => {
    if (node.parentId) {
      getBookmarkPath(node.parentId).then(setPath);
    }
  }, [node.parentId]);

  const titleAttr = [node.title, path ? `📁 ${path}` : '']
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
        const existing = await chrome.bookmarks.search({ url: tab.url });
        if (existing.length > 0) {
          toast.add({
            title: '书签已存在',
            description: existing[0].title || '(无标题)',
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
        title={titleAttr}
        onClick={onOpen}
      >
        <span className="flex items-center justify-center size-4 shrink-0 mt-0.5">
          <Folder className="size-3.5 text-yellow-600" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="truncate">{node.title || '(无标题)'}</div>
          {path && (
            <div className="truncate text-[10px] text-muted-foreground">
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
                移动到
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
  onEdit,
  onMove,
  onDelete,
  onLocate,
}: {
  node: chrome.bookmarks.BookmarkTreeNode;
  onEdit: () => void;
  onMove: () => void;
  onDelete: () => void;
  onLocate: () => void;
}) {
  const [path, setPath] = useState('');

  useEffect(() => {
    if (node.parentId) {
      getBookmarkPath(node.parentId).then(setPath);
    }
  }, [node.parentId]);

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

  const titleAttr = [node.title, node.url, path ? `📁 ${path}` : '']
    .filter(Boolean)
    .join('\n');

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <a
            href={node.url}
            className="flex items-start py-1 h-auto min-h-[28px] px-2 cursor-pointer select-none rounded-md transition-colors hover:bg-accent/60 active:bg-accent data-[state=open]:bg-accent/60 text-xs gap-1 overflow-hidden"
            title={titleAttr}
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
              <BookmarkText title={node.title} url={node.url} />
              {path && (
                <div className="truncate text-[10px] text-muted-foreground">
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
            移动到
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
