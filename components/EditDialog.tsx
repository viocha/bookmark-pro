import { useState, useEffect } from 'react';
import { useBookmarkStore } from '@/hooks/useBookmarkStore';
import { isFolder } from '@/lib/bookmark-api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function EditDialog() {
  const { editingNode, editDialogOpen, closeEditDialog, editNode } = useBookmarkStore();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (editingNode) {
      setTitle(editingNode.title || '');
      setUrl(editingNode.url || '');
    }
  }, [editingNode]);

  const handleSave = async () => {
    if (!editingNode) return;
    const changes: { title?: string; url?: string } = { title };
    if (!isFolder(editingNode)) {
      changes.url = url;
    }
    await editNode(editingNode.id, changes);
    closeEditDialog();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    }
  };

  const folder = editingNode ? isFolder(editingNode) : false;

  return (
    <Dialog open={editDialogOpen} onOpenChange={(open) => !open && closeEditDialog()}>
      <DialogContent className="max-w-[320px] p-4 gap-3">
        <DialogHeader className="pb-0">
          <DialogTitle className="text-sm">
            {folder ? '编辑文件夹' : '编辑书签'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {folder ? '修改当前文件夹名称。' : '修改当前书签的名称和网址。'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">名称</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-7 text-xs"
              autoFocus
            />
          </div>
          {!folder && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">网址</label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-7 text-xs"
              />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-0">
          <Button variant="outline" size="sm" onClick={closeEditDialog} className="h-7 text-xs">
            取消
          </Button>
          <Button size="sm" onClick={handleSave} className="h-7 text-xs">
            保存
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
