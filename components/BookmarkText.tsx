import { useSettings } from '@/hooks/useSettings';
import { cn } from '@/lib/utils';

const titleLineClasses = { 1: 'line-clamp-1', 2: 'line-clamp-2', 3: 'line-clamp-3' };

/** 树和搜索结果共用名称行数与网址显示设置。 */
export function BookmarkText({ title, url }: { title: string; url?: string }) {
  const lines = useSettings(s => s.bookmarkTitleLines);
  const showUrl = useSettings(s => s.showBookmarkUrl);
  return (
    <div className="min-w-0 flex-1">
      <div className={cn('wrap-anywhere', titleLineClasses[lines])}>
        {title || '(无标题)'}
      </div>
      {showUrl && url && (
        <div className="truncate text-[10px] text-muted-foreground">{url}</div>
      )}
    </div>
  );
}
