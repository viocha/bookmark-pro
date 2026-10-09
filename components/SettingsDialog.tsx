import { useId } from 'react';
import { useSettings, type InsertPosition } from '@/hooks/useSettings';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

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
  const {
    folderInsertPosition,
    bookmarkInsertPosition,
    setFolderInsertPosition,
    setBookmarkInsertPosition,
  } = useSettings();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription className="sr-only">
            设置新建文件夹和添加书签时默认使用的插入位置。
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
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
        </FieldGroup>
      </DialogContent>
    </Dialog>
  );
}
