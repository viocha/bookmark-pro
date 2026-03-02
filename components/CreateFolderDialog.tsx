import { useState, useEffect, useRef } from 'react';
import { useBookmarkStore } from '@/hooks/useBookmarkStore';
import { useSettings, type InsertPosition } from '@/hooks/useSettings';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function CreateFolderDialog() {
  const { createFolderDialogOpen, createFolderParentId, closeCreateFolderDialog, addFolder } =
    useBookmarkStore();
  const folderInsertPosition = useSettings((s) => s.folderInsertPosition);
  const [title, setTitle] = useState('');
  const [position, setPosition] = useState<InsertPosition>('bottom');
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync default position from settings when dialog opens, set default name and auto-select
  useEffect(() => {
    if (createFolderDialogOpen) {
      setPosition(folderInsertPosition);
      setTitle('新建文件夹');
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [createFolderDialogOpen, folderInsertPosition]);

  const handleCreate = async () => {
    if (!createFolderParentId || !title.trim()) return;
    await addFolder(createFolderParentId, title.trim(), position);
    setTitle('');
    closeCreateFolderDialog();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreate();
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setTitle('');
      closeCreateFolderDialog();
    }
  };

  return (
    <Dialog open={createFolderDialogOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[320px] p-4 gap-3">
        <DialogHeader className="pb-0">
          <DialogTitle className="text-sm">新建文件夹</DialogTitle>
        </DialogHeader>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">名称</label>
          <Input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="文件夹名称"
            className="h-7 text-xs"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">插入位置</label>
          <div className="flex gap-1">
            <Button
              variant={position === 'top' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPosition('top')}
              className="h-7 text-xs flex-1"
            >
              顶部
            </Button>
            <Button
              variant={position === 'bottom' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPosition('bottom')}
              className="h-7 text-xs flex-1"
            >
              底部
            </Button>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-0">
          <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)} className="h-7 text-xs">
            取消
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={!title.trim()} className="h-7 text-xs">
            创建
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
