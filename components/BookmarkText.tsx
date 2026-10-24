import { useSettings } from '@/hooks/useSettings';
import { cn } from '@/lib/utils';
import { getTruncatedTitleProps } from '@/lib/truncated-title';

const titleLineClasses = { 1: 'line-clamp-1', 2: 'line-clamp-2', 3: 'line-clamp-3' };

/** 树和搜索结果共用名称行数与网址显示设置。 */
export function BookmarkText({ title, url, tooltip }: { title: string; url?: string; tooltip?: string }) {
  const lines = useSettings(s => s.bookmarkTitleLines);
  const showUrl = useSettings(s => s.showBookmarkUrl);
  const fullTitle = tooltip ?? [title || '(无标题)', url].filter(Boolean).join('\n');
  return (
    <div className="min-w-0 flex-1">
      <div
        className={cn('w-fit max-w-full wrap-anywhere', titleLineClasses[lines])}
        {...getTruncatedTitleProps(fullTitle)}
      >
        {title || '(无标题)'}
      </div>
      {showUrl && url && (
        <div
          className="w-fit max-w-full truncate text-[10px] text-muted-foreground"
          {...getTruncatedTitleProps(fullTitle)}
        >{url}</div>
      )}
    </div>
  );
}
