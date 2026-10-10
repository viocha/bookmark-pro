import { useState, useLayoutEffect, useRef } from 'react';
import { useBookmarkStore } from '@/hooks/useBookmarkStore';
import { useSettings, type InsertPosition } from '@/hooks/useSettings';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { InsertPositionField } from '@/components/InsertPositionField';

export function CreateFolderDialog() {
  const {
    createFolderDialogOpen,
    createFolderParentId,
    closeCreateFolderDialog,
    finishCloseCreateFolderDialog,
    addFolder,
  } = useBookmarkStore();
  const folderInsertPosition = useSettings((s) => s.folderInsertPosition);
  const [title, setTitle] = useState('');
  const [position, setPosition] = useState<InsertPosition>('bottom');
  const inputRef = useRef<HTMLInputElement>(null);

  // 在对话框初始聚焦前准备默认值，避免值更新覆盖文本选区。
  useLayoutEffect(() => {
    if (createFolderDialogOpen) {
      setPosition(folderInsertPosition);
      setTitle('新建文件夹');
    }
  }, [createFolderDialogOpen, folderInsertPosition]);

  const handleCreate = async () => {
    if (!createFolderParentId || !title.trim()) return;
    await addFolder(createFolderParentId, title.trim(), position);
    closeCreateFolderDialog();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleCreate();
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) closeCreateFolderDialog();
  };

  return (
    <Dialog
      open={createFolderDialogOpen}
      onOpenChange={handleOpenChange}
      onOpenChangeComplete={(open) => {
        if (open || useBookmarkStore.getState().createFolderDialogOpen) return;
        finishCloseCreateFolderDialog();
        setTitle('');
      }}
    >
      <DialogContent initialFocus={() => {
        inputRef.current?.focus({ preventScroll: true });
        inputRef.current?.select();
        return false;
      }}>
        <DialogHeader>
          <DialogTitle>新建文件夹</DialogTitle>
          <DialogDescription className="sr-only">
            输入名称并选择插入位置
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="create-folder-title">名称</FieldLabel>
            <Input
              id="create-folder-title"
              ref={inputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </Field>
          <InsertPositionField value={position} onChange={setPosition} />
        </FieldGroup>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenChange(false)}
          >
            取消
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={!title.trim()}>
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
