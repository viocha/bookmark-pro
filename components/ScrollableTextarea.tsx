import type { ComponentProps } from 'react';
import { InputGroup, InputGroupTextarea } from '@/components/ui/input-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

/** 文本框随内容增高，由 ScrollArea 提供固定高度的滚动视口。 */
export function ScrollableTextarea({
  rows = 2,
  className,
  ...props
}: Omit<ComponentProps<typeof InputGroupTextarea>, 'rows'> & {
  rows?: 2 | 3;
}) {
  return (
    <InputGroup className="h-auto">
      <ScrollArea
        className="w-full rounded-[inherit] [&_[data-slot=scroll-area-viewport]]:overscroll-contain"
        style={{ height: `calc(${rows}lh + 1rem)` }}
      >
        <InputGroupTextarea
          {...props}
          rows={rows}
          className={cn('overflow-hidden', className)}
          style={{ minHeight: `calc(${rows}lh + 1rem)` }}
        />
      </ScrollArea>
    </InputGroup>
  );
}
