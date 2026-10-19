import { useRef, useEffect, useCallback, useState } from 'react';
import { FlattenedNode } from '@/lib/tree-utils';
import { useBookmarkStore } from '@/hooks/useBookmarkStore';
import { useSettings } from '@/hooks/useSettings';
import {
  isProtectedNode,
  getAllUrls,
  isFolder as isFolderNode,
} from '@/lib/bookmark-api';
import { toast } from '@/components/ui/toast';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  ChevronRight,
  FolderOpen,
  Folder,
  FileText,
  Pencil,
  Trash2,
  ExternalLink,
  AppWindow,
  FolderPlus,
  BookmarkPlus,
  FolderOpenDot,
  ChevronsDownUp,
  ChevronsUpDown,
  FolderInput,
  EyeOff,
  Copy,
  CheckSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { BookmarkText } from '@/components/BookmarkText';

interface TreeNodeContentProps {
  item: FlattenedNode;
  isOverlay?: boolean;
  insideHighlight?: boolean;
  listeners?: Record<string, Function>;
  attributes?: Record<string, any>;
  setNodeRef?: (node: HTMLElement | null) => void;
  flatIds?: string[];
  renamingId?: string | null;
  renamingTitle?: string;
  onRenameStart?: (id: string, title: string) => void;
  onRenameCommit?: () => void;
  onRenameCancel?: () => void;
  onRenameTitleChange?: (v: string) => void;
}

export function TreeNodeContent({
  item,
  isOverlay = false,
  insideHighlight = false,
  listeners,
  attributes,
  setNodeRef,
  flatIds = [],
  renamingId = null,
  renamingTitle = '',
  onRenameStart,
  onRenameCommit,
  onRenameCancel,
  onRenameTitleChange,
}: TreeNodeContentProps) {
  const {
    toggleExpand,
    expandAllUnder,
    collapseAllUnder,
    openEditDialog,
    deleteNode,
    openCreateFolderDialog,
    addBookmark,
    openAddBookmarkDialog,
    undoDeleteBookmark,
    openMoveDialog,
    toggleSelect,
    rangeSelect,
    clearSelection,
    openBatchMoveDialog,
    confirmBatchDelete,
    enterMultiSelectMode,
  } = useBookmarkStore.getState();
  const expandedIds = useBookmarkStore(s => s.expandedIds);
  const multiSelectMode = useBookmarkStore(s => s.multiSelectMode);
  const selectedIds = useBookmarkStore(s => s.selectedIds);
  const bookmarkInsertPosition = useSettings((s) => s.bookmarkInsertPosition);

  const { node, depth, isFolder: folder } = item;
  const expanded = expandedIds.has(node.id);
  const isProtected = isProtectedNode(node.id);
  const isSelected = selectedIds.has(node.id);
  const hasMultiSelection = selectedIds.size > 1;

  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameFocusedRef = useRef(false);
  const renameCancelingRef = useRef(false);
  const suppressCloseAutoFocusRef = useRef(false);
  const pendingRenameRef = useRef(false);
  const [contextActive, setContextActive] = useState(false);
  const contextOpenRef = useRef(false);
  const [currentPageReady, setCurrentPageReady] = useState(false);
  const [currentPageBookmark, setCurrentPageBookmark] = useState<chrome.bookmarks.BookmarkTreeNode | null>(null);

  const loadCurrentPage = async () => {
    setCurrentPageReady(false);
    try {
      let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const existing = tab?.url ? await chrome.bookmarks.search({ url: tab.url }) : [];
      if (!contextOpenRef.current) return;
      setCurrentPageBookmark(existing[0] ?? null);
      setCurrentPageReady(true);
    } catch (err) {
      console.error('[Bookmark Pro] currentPage error:', err);
    }
  };
  const isRenaming = folder && renamingId === node.id && !isOverlay;

  useEffect(() => {
    if (isRenaming) {
      renameFocusedRef.current = false;
      renameCancelingRef.current = false;
      const frame = requestAnimationFrame(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
        renameFocusedRef.current = true;
        suppressCloseAutoFocusRef.current = false;
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [isRenaming]);

  const handleRenameBlur = useCallback(() => {
    if (renameFocusedRef.current && !renameCancelingRef.current) {
      onRenameCommit?.();
    }
  }, [onRenameCommit]);

  const handleRenameFromMenu = useCallback(() => {
    suppressCloseAutoFocusRef.current = true;
    pendingRenameRef.current = true;
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRenaming) return;
    if (multiSelectMode) {
      // In multi-select mode: click toggles selection (skip protected)
      e.preventDefault();
      if (isProtected) return;
      if (e.shiftKey && flatIds.length > 0) {
        rangeSelect(node.id, flatIds);
      } else {
        toggleSelect(node.id);
      }
      return;
    }
    // Normal mode: default actions
    if (folder) {
      toggleExpand(node.id);
    } else if (node.url) {
      // Let browser handle modifier clicks natively via <a> href
      if (e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) {
        return;
      }
      // Plain click: navigate in current tab
      e.preventDefault();
      chrome.tabs.update({ url: node.url }).catch(() => {
        chrome.tabs.create({ url: node.url! });
      });
    }
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

  const handleDelete = () => {
    if (isProtected) return;
    if (folder) {
      // Save full snapshot for undo (deep clone children)
      const deepClone = (
        n: chrome.bookmarks.BookmarkTreeNode
      ): chrome.bookmarks.BookmarkTreeNode => ({
        ...n,
        children: n.children?.map(deepClone),
      });
      const savedNode = deepClone(node);
      deleteNode(node);
      const undoToastId = toast.add({
        title: '已删除文件夹',
        description: savedNode.title || '(无标题)',
        actionProps: {
          children: '撤销',
          onClick: () => {
            toast.close(undoToastId);
            return useBookmarkStore
              .getState()
              .undoDeleteFolder(
                savedNode.title,
                savedNode.parentId ?? '1',
                savedNode.children ?? [],
                savedNode.index
              );
          },
        },
        timeout: 5000,
      });
    } else {
      // Bookmark: delete immediately, show undo toast
      const savedNode = { ...node };
      deleteNode(node);
      const undoToastId = toast.add({
        title: '已删除书签',
        description: <span className="block truncate">{savedNode.title || '(无标题)'}</span>,
        actionProps: {
          children: '撤销',
          onClick: () => {
            toast.close(undoToastId);
            return undoDeleteBookmark(savedNode);
          },
        },
        timeout: 5000,
      });
    }
  };

  const handleEdit = () => {
    if (isProtected) return;
    openEditDialog(node);
  };

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
        // Check if URL already exists globally
        const existing = await chrome.bookmarks.search({ url: tab.url });
        if (existing.length > 0) {
          suppressCloseAutoFocusRef.current = true;
          openEditDialog(existing[0]);
          return;
        }
        suppressCloseAutoFocusRef.current = true;
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

  const handleCreateFolder = () => {
    openCreateFolderDialog(node.id);
  };

  const handleEnterMultiSelect = () => {
    enterMultiSelectMode();
    // Auto-select current node
    toggleSelect(node.id);
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

  // Batch action handlers for context menu
  const collectSelectedUrls = (): string[] => {
    const store = useBookmarkStore.getState();
    const { selectedIds: sids, tree: t } = store;
    const urls: string[] = [];
    const findUrls = (n: chrome.bookmarks.BookmarkTreeNode) => {
      if (sids.has(n.id)) {
        if (n.url) urls.push(n.url);
        else getAllUrls(n).forEach((u) => urls.push(u));
        return;
      }
      n.children?.forEach(findUrls);
    };
    t.forEach(findUrls);
    return urls;
  };

  const handleBatchOpenTabs = () => {
    const urls = collectSelectedUrls();
    urls.forEach((u) => chrome.tabs.create({ url: u }));
    toast.add({ title: `已打开 ${urls.length} 个标签页`, timeout: 2000 });
  };

  const handleBatchOpenWindow = () => {
    const urls = collectSelectedUrls();
    if (urls.length > 0) chrome.windows.create({ url: urls });
  };

  const handleBatchOpenIncognito = () => {
    const urls = collectSelectedUrls();
    if (urls.length > 0) chrome.windows.create({ url: urls, incognito: true });
  };

  const indent = depth * 14;

  const titleAttr = folder ? node.title : `${node.title}\n${node.url ?? ''}`;

  // Show batch context menu when in multi-select mode with multiple selected items and this item is selected
  const showBatchMenu = multiSelectMode && isSelected && hasMultiSelection;

  const batchContextMenuContent = (
    <ContextMenuContent className="w-48">
      <ContextMenuGroup>
        <ContextMenuItem onClick={handleBatchOpenTabs}>
          <ExternalLink />
          在新标签页打开 ({selectedIds.size})
        </ContextMenuItem>
        <ContextMenuItem onClick={handleBatchOpenWindow}>
          <AppWindow />
          在新窗口打开 ({selectedIds.size})
        </ContextMenuItem>
        <ContextMenuItem onClick={handleBatchOpenIncognito}>
          <EyeOff />
          在隐私窗口打开 ({selectedIds.size})
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={openBatchMoveDialog}>
          <FolderInput />
          移动 ({selectedIds.size})
        </ContextMenuItem>
        <ContextMenuItem onClick={confirmBatchDelete} variant="destructive">
          <Trash2 />
          删除 ({selectedIds.size})
        </ContextMenuItem>
      </ContextMenuGroup>
    </ContextMenuContent>
  );

  const innerContent = (
    <>
      {!isOverlay && (
        <span style={{ width: `${indent}px` }} className="shrink-0" />
      )}
      <span
        className="flex items-center justify-center size-4 shrink-0 ml-0.5"
        onClick={
          folder
            ? (e: React.MouseEvent) => {
                e.stopPropagation();
                toggleExpand(node.id);
              }
            : undefined
        }
      >
        {folder ? (
          <ChevronRight
            className={cn(
              'size-3 text-muted-foreground transition-transform duration-200',
              expanded && 'rotate-90'
            )}
          />
        ) : null}
      </span>
      <span className="flex items-center justify-center size-4 shrink-0">
        {multiSelectMode && !isProtected ? (
          <span className="relative flex items-center justify-center size-4">
            <Checkbox
              checked={isSelected}
              aria-label={`选择 ${node.title || '(无标题)'}`}
              onClick={(e) => e.stopPropagation()}
              onCheckedChange={() => toggleSelect(node.id)}
            />
            {!folder && node.url && (
              <img
                src={`chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(node.url)}&size=16`}
                className="size-2.5 absolute -bottom-0.5 -right-0.5 rounded-sm"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
          </span>
        ) : folder ? (
          expanded ? (
            <FolderOpen className="size-3.5 text-yellow-600" />
          ) : (
            <Folder className="size-3.5 text-yellow-600" />
          )
        ) : node.url ? (
          <>
            <img
              src={`chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(node.url)}&size=16`}
              className="size-3.5"
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                img.style.display = 'none';
                img.nextElementSibling?.classList.remove('hidden');
              }}
            />
            <FileText className="size-3.5 text-muted-foreground hidden" />
          </>
        ) : (
          <FileText className="size-3.5 text-muted-foreground" />
        )}
      </span>
      {isRenaming ? (
        <Input
          ref={renameInputRef}
          value={renamingTitle}
          onChange={(e) => onRenameTitleChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.stopPropagation();
              onRenameCommit?.();
            }
            if (e.key === 'Escape') {
              e.stopPropagation();
              e.preventDefault();
              renameCancelingRef.current = true;
              onRenameCancel?.();
            }
          }}
          onBlur={handleRenameBlur}
          className="h-5 text-xs px-1 py-0 ml-0.5 flex-1 min-w-0"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <>
          {folder ? (
            <span className="truncate min-w-0 ml-0.5">{node.title || '(无标题)'}</span>
          ) : (
            <BookmarkText title={node.title} url={node.url} />
          )}
          {folder && item.childCount > 0 && (
            <span className="ml-auto shrink-0 text-muted-foreground">
              {item.childCount}
            </span>
          )}
        </>
      )}
    </>
  );

  if (isOverlay) {
    return (
      <div
        className={cn(
          'flex items-center min-h-7 py-1 pr-3 cursor-pointer select-none rounded-md transition-colors',
          'hover:bg-accent/60 active:bg-accent',
          'text-xs gap-0.5 overflow-hidden'
        )}
      >
        {innerContent}
      </div>
    );
  }

  const contextMenuContent = folder ? (
    <ContextMenuContent
      className="w-48"
      finalFocus={() => !suppressCloseAutoFocusRef.current}
    >
      <ContextMenuGroup>
          <ContextMenuItem disabled={!currentPageReady} onClick={() => {
            suppressCloseAutoFocusRef.current = true;
            if (currentPageBookmark) openEditDialog(currentPageBookmark);
            else void handleAddCurrentPage();
          }}>
            {currentPageBookmark ? <Pencil /> : <BookmarkPlus />}
            {!currentPageReady ? '当前页面' : currentPageBookmark ? '编辑当前页面' : '添加当前页面'}
          </ContextMenuItem>
        <ContextMenuItem onClick={() => {
          suppressCloseAutoFocusRef.current = true;
          handleCreateFolder();
        }}>
          <FolderPlus />
          新建文件夹
        </ContextMenuItem>
        {!isProtected && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={handleRenameFromMenu}>
              <Pencil />
              重命名
            </ContextMenuItem>
            <ContextMenuItem onClick={() => openMoveDialog(node)}>
              <FolderInput />
              移动
            </ContextMenuItem>
            <ContextMenuItem onClick={handleDelete} variant="destructive">
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
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => expandAllUnder(node)}>
          <ChevronsUpDown />
          递归展开
        </ContextMenuItem>
        <ContextMenuItem onClick={() => collapseAllUnder(node)}>
          <ChevronsDownUp />
          递归折叠
        </ContextMenuItem>
        {!multiSelectMode && !isProtected && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={handleEnterMultiSelect}>
              <CheckSquare />
              多选
            </ContextMenuItem>
          </>
        )}
      </ContextMenuGroup>
    </ContextMenuContent>
  ) : (
    <ContextMenuContent className="w-48">
      <ContextMenuGroup>
        <ContextMenuItem onClick={handleEdit}>
          <Pencil />
          编辑
        </ContextMenuItem>
        <ContextMenuItem onClick={() => openMoveDialog(node)}>
          <FolderInput />
          移动
        </ContextMenuItem>
        <ContextMenuItem onClick={handleDelete} variant="destructive">
          <Trash2 />
          删除
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleCopyLink}>
          <Copy />
          复制链接
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
        {!multiSelectMode && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={handleEnterMultiSelect}>
              <CheckSquare />
              多选
            </ContextMenuItem>
          </>
        )}
      </ContextMenuGroup>
    </ContextMenuContent>
  );

  const isBookmark = !folder && !!node.url;
  const triggerClassName = cn(
    'flex items-center min-h-7 py-1 pr-3 cursor-pointer select-none rounded-md transition-colors',
    'text-xs gap-0.5 overflow-hidden',
    isSelected
      ? 'bg-primary/10 hover:bg-primary/15'
      : 'hover:bg-accent/60 active:bg-accent',
    contextActive && (isSelected ? 'bg-primary/15' : 'bg-accent/60')
  );
  const triggerDataProps = {
    'data-node-id': node.id,
    'data-inside-highlight': insideHighlight || undefined,
  } as Record<string, any>;

  if (isRenaming) {
    return (
      <div
        ref={setNodeRef}
        title={titleAttr}
        className={triggerClassName}
        {...triggerDataProps}
      >
        {innerContent}
      </div>
    );
  }

  return (
    <ContextMenu
      onOpenChange={(open) => {
        contextOpenRef.current = open;
        if (open) {
          suppressCloseAutoFocusRef.current = false;
          setContextActive(true);
          if (folder && !showBatchMenu) void loadCurrentPage();
        }
      }}
      onOpenChangeComplete={(open) => {
        if (!open && !contextOpenRef.current) setContextActive(false);
        if (!open && pendingRenameRef.current) {
          pendingRenameRef.current = false;
          onRenameStart?.(node.id, node.title);
        }
      }}
    >
      <ContextMenuTrigger
        render={
          isBookmark && !multiSelectMode ? (
            <a
              href={node.url}
              ref={setNodeRef}
              title={titleAttr}
              className={triggerClassName}
              onClick={handleClick}
              {...triggerDataProps}
              {...listeners}
              {...attributes}
            >
              {innerContent}
            </a>
          ) : (
            <div
              ref={setNodeRef}
              title={titleAttr}
              className={triggerClassName}
              onClick={handleClick}
              {...triggerDataProps}
              {...listeners}
              {...attributes}
            >
              {innerContent}
            </div>
          )
        }
      />
      {showBatchMenu ? batchContextMenuContent : contextMenuContent}
    </ContextMenu>
  );
}
