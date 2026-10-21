import { useId, useState } from 'react';
import { ArrowDownUp } from 'lucide-react';
import { useBookmarkStore } from '@/hooks/useBookmarkStore';
import { useSettings, type InsertPosition } from '@/hooks/useSettings';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Switch } from '@/components/ui/switch';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function PositionToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: InsertPosition;
  onChange: (pos: InsertPosition) => void;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel id={id}>{label}</FieldLabel>
      <ToggleGroup
        className="w-full"
        aria-labelledby={id}
        variant="outline"
        size="sm"
        spacing={0}
        value={[value]}
        onValueChange={(values) => {
          const next = values[0];
          if (next === 'top' || next === 'bottom') onChange(next);
        }}
      >
        <ToggleGroupItem className="flex-1" value="top">顶部</ToggleGroupItem>
        <ToggleGroupItem className="flex-1" value="bottom">底部</ToggleGroupItem>
      </ToggleGroup>
    </Field>
  );
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [isSorting, setIsSorting] = useState(false);
  const titleLinesId = useId();
  const showUrlId = useId();
  const {
    folderInsertPosition,
    bookmarkInsertPosition,
    setFolderInsertPosition,
    setBookmarkInsertPosition,
    bookmarkTitleLines,
    showBookmarkUrl,
    setBookmarkTitleLines,
    setShowBookmarkUrl,
  } = useSettings();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription className="sr-only">
            设置书签的名称行数、网址显示和默认插入位置。
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel id={titleLinesId}>书签名称显示行数</FieldLabel>
            <ToggleGroup
              className="w-full"
              aria-labelledby={titleLinesId}
              variant="outline"
              size="sm"
              spacing={0}
              value={[String(bookmarkTitleLines)]}
              onValueChange={(values) => {
                const lines = Number(values[0]);
                if (lines === 1 || lines === 2 || lines === 3) setBookmarkTitleLines(lines);
              }}
            >
              {[1, 2, 3].map(lines => (
                <ToggleGroupItem key={lines} className="flex-1" value={String(lines)}>
                  {lines} 行
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
          <Field orientation="horizontal">
            <FieldLabel htmlFor={showUrlId}>在名称下方显示网址</FieldLabel>
            <Switch id={showUrlId} checked={showBookmarkUrl} onCheckedChange={setShowBookmarkUrl} />
          </Field>
          <PositionToggle
            label="新建文件夹默认位置"
            value={folderInsertPosition}
            onChange={setFolderInsertPosition}
          />
          <PositionToggle
            label="添加书签默认位置"
            value={bookmarkInsertPosition}
            onChange={setBookmarkInsertPosition}
          />
          <Field>
            <Button
              variant="outline"
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
            >
              {isSorting ? <Spinner data-icon="inline-start" /> : <ArrowDownUp data-icon="inline-start" />}
              规范化排序
            </Button>
            <FieldDescription>
              将所有文件夹置于书签前，同类项目保持现有顺序。
            </FieldDescription>
          </Field>
        </FieldGroup>
      </DialogContent>
    </Dialog>
  );
}
