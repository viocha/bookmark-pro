import { useState, useLayoutEffect, useRef } from 'react';
import { useBookmarkStore } from '@/hooks/useBookmarkStore';
import { isFolder } from '@/lib/bookmark-api';
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
import { BookmarkFormFields } from '@/components/BookmarkFormFields';
import { focusBookmarkTitle } from '@/lib/bookmark-form-focus';

export function EditDialog() {
  const {
    editingNode,
    editDialogOpen,
    closeEditDialog,
    finishCloseEditDialog,
    editNode,
  } = useBookmarkStore();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const urlRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
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
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSave();
    }
  };

  const folder = editingNode ? isFolder(editingNode) : false;

  return (
    <Dialog
      open={editDialogOpen}
      onOpenChange={(open) => !open && closeEditDialog()}
      onOpenChangeComplete={(open) => {
        if (!open) finishCloseEditDialog();
      }}
    >
      <DialogContent
        initialFocus={folder ? undefined : () => {
          focusBookmarkTitle(titleRef.current, urlRef.current);
          return false;
        }}
      >
        <DialogHeader>
          <DialogTitle>{folder ? '编辑文件夹' : '编辑书签'}</DialogTitle>
          <DialogDescription className="sr-only">
            {folder ? '修改当前文件夹名称。' : '修改当前书签的名称和网址。'}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {folder ? (
            <Field>
              <FieldLabel htmlFor="edit-title">名称</FieldLabel>
              <Input
                id="edit-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
              />
            </Field>
          ) : (
            <BookmarkFormFields
              idPrefix="edit"
              title={title}
              url={url}
              onTitleChange={setTitle}
              onUrlChange={setUrl}
              titleRef={titleRef}
              urlRef={urlRef}
              onKeyDown={handleKeyDown}
            />
          )}
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={closeEditDialog}>
            取消
          </Button>
          <Button size="sm" onClick={handleSave}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
