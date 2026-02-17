import { FlattenedNode } from '@/lib/tree-utils';
import { useBookmarkStore } from '@/hooks/useBookmarkStore';
import { useSettings } from '@/hooks/useSettings';
import { isProtectedNode, getAllUrls, isFolder as isFolderNode } from '@/lib/bookmark-api';
import { toast } from 'sonner';

import {
  ContextMenu,
  ContextMenuContent,
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
  Square,
  CheckSquare,
  CheckSquare2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TreeNodeContentProps {
  item: FlattenedNode;
  isOverlay?: boolean;
  insideHighlight?: boolean;
  listeners?: Record<string, Function>;
  attributes?: Record<string, any>;
  setNodeRef?: (node: HTMLElement | null) => void;
  flatIds?: string[];
}

export function TreeNodeContent({
  item,
  isOverlay = false,
  insideHighlight = false,
  listeners,
  attributes,
  setNodeRef,
  flatIds = [],
}: TreeNodeContentProps) {
  const {
    expandedIds,
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
    multiSelectMode,
    selectedIds,
    toggleSelect,
    rangeSelect,
    clearSelection,
    openBatchMoveDialog,
    confirmBatchDelete,
    enterMultiSelectMode,
  } = useBookmarkStore();
  const bookmarkInsertPosition = useSettings((s) => s.bookmarkInsertPosition);

  const { node, depth, isFolder: folder } = item;
  const expanded = expandedIds.has(node.id);
  const isProtected = isProtectedNode(node.id);
  const isSelected = selectedIds.has(node.id);
  const hasMultiSelection = selectedIds.size > 1;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
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
      toast('已复制链接', { description: node.url, duration: 2000 });
    }
  };

  const handleDelete = () => {
    if (isProtected) return;
    if (folder) {
      // Save full snapshot for undo (deep clone children)
      const deepClone = (n: chrome.bookmarks.BookmarkTreeNode): chrome.bookmarks.BookmarkTreeNode => ({
        ...n,
        children: n.children?.map(deepClone),
      });
      const savedNode = deepClone(node);
      deleteNode(node);
      toast('已删除文件夹', {
        description: savedNode.title || '(无标题)',
        action: {
          label: '撤销',
          onClick: () => useBookmarkStore.getState().undoDeleteFolder(
            savedNode.title, savedNode.parentId ?? '1', savedNode.children ?? [], savedNode.index
          ),
        },
        duration: 5000,
      });
    } else {
      // Bookmark: delete immediately, show undo toast
      const savedNode = { ...node };
      deleteNode(node);
      toast('已删除书签', {
        description: savedNode.title || '(无标题)',
        action: {
          label: '撤销',
          onClick: () => undoDeleteBookmark(savedNode),
        },
        duration: 5000,
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
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      tab = tabs[0];
      if (!tab?.url || !tab?.title) {
        const fallbackTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        tab = fallbackTabs[0];
      }
      if (tab?.url && tab?.title) {
        // Check if URL already exists globally
        const existing = await chrome.bookmarks.search({ url: tab.url });
        if (existing.length > 0) {
          toast('书签已存在', { description: existing[0].title || '(无标题)', duration: 3000 });
          return;
        }
        const newNode = await addBookmark(node.id, tab.title, tab.url, bookmarkInsertPosition);
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
    toast(`已打开 ${urls.length} 个标签页`, { duration: 2000 });
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
      <ContextMenuItem onSelect={handleBatchOpenTabs} className="text-xs h-7">
        <ExternalLink className="size-3.5 mr-2" />
        在新标签页打开 ({selectedIds.size})
      </ContextMenuItem>
      <ContextMenuItem onSelect={handleBatchOpenWindow} className="text-xs h-7">
        <AppWindow className="size-3.5 mr-2" />
        在新窗口打开 ({selectedIds.size})
      </ContextMenuItem>
      <ContextMenuItem onSelect={handleBatchOpenIncognito} className="text-xs h-7">
        <EyeOff className="size-3.5 mr-2" />
        在隐私窗口打开 ({selectedIds.size})
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={openBatchMoveDialog} className="text-xs h-7">
        <FolderInput className="size-3.5 mr-2" />
        移动到 ({selectedIds.size})
      </ContextMenuItem>
      <ContextMenuItem onSelect={confirmBatchDelete} className="text-xs h-7 text-destructive">
        <Trash2 className="size-3.5 mr-2" />
        删除 ({selectedIds.size})
      </ContextMenuItem>
    </ContextMenuContent>
  );

  const innerContent = (
    <>
      {!isOverlay && <span style={{ width: `${indent}px` }} className="shrink-0" />}
      <span
        className="flex items-center justify-center size-4 shrink-0 ml-0.5"
        onClick={folder ? (e: React.MouseEvent) => {
          e.stopPropagation();
          toggleExpand(node.id);
        } : undefined}
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
            {isSelected ? (
              <CheckSquare2 className="size-3.5 text-primary" />
            ) : (
              <Square className="size-3.5 text-muted-foreground" />
            )}
            {!folder && node.url && (
              <img
                src={`chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(node.url)}&size=16`}
                className="size-2.5 absolute -bottom-0.5 -right-0.5 rounded-sm"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
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
      <span className="truncate min-w-0 ml-0.5">{node.title || '(无标题)'}</span>
      {folder && item.childCount > 0 && (
        <span className="text-[10px] text-muted-foreground ml-auto shrink-0 pr-1">
          {item.childCount}
        </span>
      )}
    </>
  );

  if (isOverlay) {
    return (
      <div
        className={cn(
          'flex items-center h-7 pr-2 cursor-pointer select-none',
          'hover:bg-accent/60 active:bg-accent',
          'text-xs gap-0.5 overflow-hidden px-2'
        )}
      >
        {innerContent}
      </div>
    );
  }

  const contextMenuContent = folder ? (
    <ContextMenuContent className="w-48">
      <ContextMenuItem onSelect={handleAddCurrentPage} className="text-xs h-7">
        <BookmarkPlus className="size-3.5 mr-2" />
        添加当前页面
      </ContextMenuItem>
      <ContextMenuItem onSelect={handleCreateFolder} className="text-xs h-7">
        <FolderPlus className="size-3.5 mr-2" />
        新建文件夹
      </ContextMenuItem>
      {!isProtected && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={handleEdit} className="text-xs h-7">
            <Pencil className="size-3.5 mr-2" />
            编辑
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => openMoveDialog(node)} className="text-xs h-7">
            <FolderInput className="size-3.5 mr-2" />
            移动到
          </ContextMenuItem>
          <ContextMenuItem onSelect={handleDelete} className="text-xs h-7 text-destructive">
            <Trash2 className="size-3.5 mr-2" />
            删除
          </ContextMenuItem>
        </>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={handleOpenAll} className="text-xs h-7">
        <FolderOpenDot className="size-3.5 mr-2" />
        打开所有书签
      </ContextMenuItem>
      <ContextMenuItem onSelect={handleOpenAllNewWindow} className="text-xs h-7">
        <AppWindow className="size-3.5 mr-2" />
        在新窗口打开所有
      </ContextMenuItem>
      <ContextMenuItem onSelect={handleOpenAllIncognito} className="text-xs h-7">
        <EyeOff className="size-3.5 mr-2" />
        在隐私窗口打开所有
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => expandAllUnder(node)} className="text-xs h-7">
        <ChevronsUpDown className="size-3.5 mr-2" />
        递归展开
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => collapseAllUnder(node)} className="text-xs h-7">
        <ChevronsDownUp className="size-3.5 mr-2" />
        递归折叠
      </ContextMenuItem>
      {!multiSelectMode && !isProtected && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={handleEnterMultiSelect} className="text-xs h-7">
            <CheckSquare className="size-3.5 mr-2" />
            多选
          </ContextMenuItem>
        </>
      )}
    </ContextMenuContent>
  ) : (
    <ContextMenuContent className="w-48">
      <ContextMenuItem onSelect={handleEdit} className="text-xs h-7">
        <Pencil className="size-3.5 mr-2" />
        编辑
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => openMoveDialog(node)} className="text-xs h-7">
        <FolderInput className="size-3.5 mr-2" />
        移动到
      </ContextMenuItem>
      <ContextMenuItem onSelect={handleDelete} className="text-xs h-7 text-destructive">
        <Trash2 className="size-3.5 mr-2" />
        删除
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={handleOpenNewTab} className="text-xs h-7">
        <ExternalLink className="size-3.5 mr-2" />
        在新标签页打开
      </ContextMenuItem>
      <ContextMenuItem onSelect={handleOpenNewWindow} className="text-xs h-7">
        <AppWindow className="size-3.5 mr-2" />
        在新窗口打开
      </ContextMenuItem>
      <ContextMenuItem onSelect={handleOpenIncognito} className="text-xs h-7">
        <EyeOff className="size-3.5 mr-2" />
        在隐私窗口打开
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={handleCopyLink} className="text-xs h-7">
        <Copy className="size-3.5 mr-2" />
        复制链接
      </ContextMenuItem>
      {!multiSelectMode && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={handleEnterMultiSelect} className="text-xs h-7">
            <CheckSquare className="size-3.5 mr-2" />
            多选
          </ContextMenuItem>
        </>
      )}
    </ContextMenuContent>
  );

  const isBookmark = !folder && !!node.url;
  const triggerClassName = cn(
    'flex items-center h-7 pr-2 cursor-pointer select-none',
    'text-xs gap-0.5 overflow-hidden',
    isSelected
      ? 'bg-primary/10 hover:bg-primary/15 data-[state=open]:bg-primary/10'
      : 'hover:bg-accent/60 active:bg-accent data-[state=open]:bg-accent/60'
  );
  const triggerDataProps = {
    'data-node-id': node.id,
    'data-inside-highlight': insideHighlight || undefined,
  } as Record<string, any>;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {isBookmark ? (
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
        )}
      </ContextMenuTrigger>
      {showBatchMenu ? batchContextMenuContent : contextMenuContent}
    </ContextMenu>
  );
}
