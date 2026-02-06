import { useSettings, type InsertPosition } from '@/hooks/useSettings';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

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
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      <div className="flex gap-1">
        <Button
          variant={value === 'top' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange('top')}
          className="h-7 text-xs flex-1"
        >
          顶部
        </Button>
        <Button
          variant={value === 'bottom' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange('bottom')}
          className="h-7 text-xs flex-1"
        >
          底部
        </Button>
      </div>
    </div>
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
      <DialogContent className="max-w-[320px] p-4 gap-3">
        <DialogHeader className="pb-0">
          <DialogTitle className="text-sm">设置</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
