import { useState, useRef, useEffect, useCallback } from 'react';
import { useBookmarkStore } from '@/hooks/useBookmarkStore';
import { getAllUrls } from '@/lib/bookmark-api';
import { toast } from '@/components/ui/toast';
import {
  Search,
  X,
  ArrowDownUp,
  Settings,
  CheckSquare2,
  ExternalLink,
  AppWindow,
  EyeOff,
  FolderInput,
  Trash2,
} from 'lucide-react';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Separator } from '@/components/ui/separator';
import { SettingsDialog } from '@/components/SettingsDialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Spinner } from '@/components/ui/spinner';
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

function ToolbarAction({
  label,
  icon,
  onClick,
  disabled = false,
  destructive = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            onClick={onClick}
            disabled={disabled}
            variant={destructive ? 'destructive' : 'ghost'}
            size="icon-sm"
          >
            {icon}
          </Button>
        }
      />
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function Header() {
  const { searchQuery, setSearchQuery, performSearch, clearSearch } =
    useBookmarkStore();
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
    toast.add({ title: `已打开 ${urls.length} 个标签页`, timeout: 2000 });
  };

  const handleOpenWindow = () => {
    const urls = collectSelectedUrls();
    if (urls.length > 0) chrome.windows.create({ url: urls });
  };

  const handleOpenIncognito = () => {
    const urls = collectSelectedUrls();
    if (urls.length > 0) chrome.windows.create({ url: urls, incognito: true });
  };

  if (multiSelectMode) {
    return (
      <div className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
        <span className="mr-auto shrink-0 text-sm text-muted-foreground">
          已选 {selectedIds.size} 项
        </span>
        <ToolbarAction
          label="在新标签页打开"
          icon={<ExternalLink />}
          onClick={handleOpenTabs}
          disabled={selectedIds.size === 0}
        />
        <ToolbarAction
          label="在新窗口打开"
          icon={<AppWindow />}
          onClick={handleOpenWindow}
          disabled={selectedIds.size === 0}
        />
        <ToolbarAction
          label="在隐私窗口打开"
          icon={<EyeOff />}
          onClick={handleOpenIncognito}
          disabled={selectedIds.size === 0}
        />
        <ToolbarAction
          label="移动到"
          icon={<FolderInput />}
          onClick={openBatchMoveDialog}
          disabled={selectedIds.size === 0}
        />
        <ToolbarAction
          label="删除"
          icon={<Trash2 />}
          onClick={confirmBatchDelete}
          disabled={selectedIds.size === 0}
          destructive
        />
        <Separator orientation="vertical" className="mx-1 h-4" />
        <ToolbarAction
          label="退出多选"
          icon={<X />}
          onClick={exitMultiSelectMode}
        />
      </div>
    );
  }

  return (
    <>
      <div className="flex h-10 shrink-0 items-center gap-1 border-b px-2">
        {showSearch ? (
          <InputGroup>
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              ref={inputRef}
              value={searchQuery}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              aria-label="搜索书签和文件夹"
              placeholder="搜索书签和文件夹…"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                aria-label="关闭搜索"
                size="icon-xs"
                onClick={handleSearchToggle}
              >
                <X />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        ) : (
          <>
            <span className="flex-1 truncate text-sm font-medium">
              书签管理
            </span>
            <ToolbarAction
              label="多选模式"
              icon={<CheckSquare2 />}
              onClick={enterMultiSelectMode}
            />
            <ToolbarAction
              label="排序：文件夹置前"
              icon={isSorting ? <Spinner /> : <ArrowDownUp />}
              disabled={isSorting}
              onClick={async () => {
                if (isSorting) return;
                setIsSorting(true);
                try {
                  await useBookmarkStore.getState().sortFoldersFirst();
                } finally {
                  setIsSorting(false);
                }
              }}
            />
            <ToolbarAction
              label="搜索 (Ctrl+F)"
              icon={<Search />}
              onClick={handleSearchToggle}
            />
            <ToolbarAction
              label="设置"
              icon={<Settings />}
              onClick={() => setShowSettings(true)}
            />
          </>
        )}
      </div>
      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
    </>
  );
}
