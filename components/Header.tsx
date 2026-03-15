import { useState, useRef, useEffect, useCallback } from 'react';
import { useBookmarkStore } from '@/hooks/useBookmarkStore';
import { getAllUrls } from '@/lib/bookmark-api';
import { toast } from 'sonner';
import {
  Search,
  X,
  Bookmark,
  ArrowDownUp,
  Settings,
  CheckSquare2,
  ExternalLink,
  AppWindow,
  EyeOff,
  FolderInput,
  Trash2,
  Loader2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { SettingsDialog } from '@/components/SettingsDialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';

function collectSelectedUrls(): string[] {
  const store = useBookmarkStore.getState();
  const { selectedIds, tree } = store;
  const urls: string[] = [];
  const findUrls = (n: chrome.bookmarks.BookmarkTreeNode) => {
    if (selectedIds.has(n.id)) {
      if (n.url) {
        urls.push(n.url);
      } else {
        getAllUrls(n).forEach((u) => urls.push(u));
      }
      return;
    }
    n.children?.forEach(findUrls);
  };
  tree.forEach(findUrls);
  return urls;
}

export function Header() {
  const { searchQuery, setSearchQuery, performSearch, clearSearch } = useBookmarkStore();
  const multiSelectMode = useBookmarkStore((s) => s.multiSelectMode);
  const selectedIds = useBookmarkStore((s) => s.selectedIds);
  const enterMultiSelectMode = useBookmarkStore((s) => s.enterMultiSelectMode);
  const exitMultiSelectMode = useBookmarkStore((s) => s.exitMultiSelectMode);
  const openBatchMoveDialog = useBookmarkStore((s) => s.openBatchMoveDialog);
  const confirmBatchDelete = useBookmarkStore((s) => s.confirmBatchDelete);

  const [showSearch, setShowSearch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isSorting, setIsSorting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const openSearch = useCallback(() => {
    setShowSearch(true);
  }, []);

  useEffect(() => {
    if (showSearch && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showSearch]);

  // When locateNode clears search externally, close the search bar
  const locateTargetId = useBookmarkStore((s) => s.locateTargetId);
  useEffect(() => {
    if (locateTargetId && showSearch) {
      setShowSearch(false);
    }
  }, [locateTargetId, showSearch]);

  // Listen for Ctrl+F
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openSearch]);

  const handleSearchToggle = () => {
    if (showSearch) {
      clearSearch();
      setShowSearch(false);
    } else {
      setShowSearch(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      performSearch(searchQuery);
    }
    if (e.key === 'Escape') {
      clearSearch();
      setShowSearch(false);
    }
  };

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim()) {
      debounceRef.current = setTimeout(() => performSearch(val), 300);
    } else {
      clearSearch();
    }
  };

  // Batch action handlers
  const handleOpenTabs = () => {
    const urls = collectSelectedUrls();
    urls.forEach((u) => chrome.tabs.create({ url: u }));
    toast(`已打开 ${urls.length} 个标签页`, { duration: 2000 });
  };

  const handleOpenWindow = () => {
    const urls = collectSelectedUrls();
    if (urls.length > 0) chrome.windows.create({ url: urls });
  };

  const handleOpenIncognito = () => {
    const urls = collectSelectedUrls();
    if (urls.length > 0) chrome.windows.create({ url: urls, incognito: true });
  };

  // Multi-select mode header
  if (multiSelectMode) {
    return (
      <TooltipProvider delayDuration={300}>
      <div className="flex items-center h-9 px-2 border-b border-border bg-background shrink-0 gap-1">
        <span className="text-xs text-muted-foreground shrink-0 mr-auto">
          已选 {selectedIds.size} 项
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              onClick={handleOpenTabs}
              disabled={selectedIds.size === 0}
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
            >
              <ExternalLink className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">在新标签页打开</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              onClick={handleOpenWindow}
              disabled={selectedIds.size === 0}
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
            >
              <AppWindow className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">在新窗口打开</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              onClick={handleOpenIncognito}
              disabled={selectedIds.size === 0}
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
            >
              <EyeOff className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">在隐私窗口打开</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              onClick={openBatchMoveDialog}
              disabled={selectedIds.size === 0}
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
            >
              <FolderInput className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">移动到</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              onClick={confirmBatchDelete}
              disabled={selectedIds.size === 0}
              variant="ghost"
              size="icon-sm"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">删除</TooltipContent>
        </Tooltip>
        <div className="w-px h-4 bg-border mx-0.5" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              onClick={exitMultiSelectMode}
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
            >
              <X className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">退出多选</TooltipContent>
        </Tooltip>
      </div>
      </TooltipProvider>
    );
  }

  return (
    <>
    <div className="flex items-center h-9 px-2 border-b border-border bg-background shrink-0 gap-1">
      {showSearch ? (
        <div className="flex items-center flex-1 gap-1">
          <Search className="size-3.5 text-muted-foreground shrink-0" />
          <Input
            ref={inputRef}
            value={searchQuery}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="搜索书签和文件夹..."
            className="h-6 text-xs border-none shadow-none focus-visible:ring-0 px-1"
          />
          <Button
            type="button"
            onClick={handleSearchToggle}
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : (
        <>
          <Bookmark className="size-3.5 text-primary shrink-0" />
          <span className="text-xs font-medium flex-1 truncate">书签管理</span>
          <Button
            type="button"
            onClick={enterMultiSelectMode}
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            title="多选模式"
          >
            <CheckSquare2 className="size-3.5" />
          </Button>
          <Button
            type="button"
            onClick={async () => {
              if (isSorting) return;
              setIsSorting(true);
              try {
                await useBookmarkStore.getState().sortFoldersFirst();
              } finally {
                setIsSorting(false);
              }
            }}
            disabled={isSorting}
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            title={isSorting ? '排序中…' : '排序：文件夹置前'}
          >
            {isSorting ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowDownUp className="size-3.5" />}
          </Button>
          <Button
            type="button"
            onClick={handleSearchToggle}
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            title="搜索 (Ctrl+F)"
          >
            <Search className="size-3.5" />
          </Button>
          <Button
            type="button"
            onClick={() => setShowSettings(true)}
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            title="设置"
          >
            <Settings className="size-3.5" />
          </Button>
        </>
      )}
    </div>
    <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
    </>
  );
}
