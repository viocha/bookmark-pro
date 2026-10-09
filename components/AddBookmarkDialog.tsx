import { useEffect, useRef, useState } from 'react';
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

export function AddBookmarkDialog() {
  const {
    addBookmarkDialogOpen,
    addBookmarkNode,
    addBookmarkTitle,
    addBookmarkUrl,
    closeAddBookmarkDialog,
    finishCloseAddBookmarkDialog,
    editNode,
    deleteNode,
    moveNode,
  } = useBookmarkStore();
  const bookmarkInsertPosition = useSettings((s) => s.bookmarkInsertPosition);

  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [position, setPosition] = useState<InsertPosition>('bottom');
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addBookmarkDialogOpen) {
      setTitle(addBookmarkTitle);
      setUrl(addBookmarkUrl);
      setPosition(bookmarkInsertPosition);
    }
  }, [
    addBookmarkDialogOpen,
    addBookmarkTitle,
    addBookmarkUrl,
    bookmarkInsertPosition,
  ]);

  const handleDone = async () => {
    if (!addBookmarkNode) return;
    // Save any edits user made to name/url
    const changes: { title?: string; url?: string } = {};
    if (title !== addBookmarkTitle) changes.title = title;
    if (url !== addBookmarkUrl) changes.url = url;
    if (Object.keys(changes).length > 0) {
      await editNode(addBookmarkNode.id, changes);
    }
    // Always apply the selected insert position
    if (addBookmarkNode.parentId) {
      const parentId = addBookmarkNode.parentId;
      if (position === 'top') {
        const children = await chrome.bookmarks.getChildren(parentId);
        const folders = children.filter((c) => !c.url);
        await moveNode(addBookmarkNode.id, { parentId, index: folders.length });
      } else {
        // Append to end (no index = bottom)
        await moveNode(addBookmarkNode.id, { parentId });
      }
    }
    closeAddBookmarkDialog();
  };

  const handleRemove = async () => {
    if (!addBookmarkNode) return;
    await deleteNode(addBookmarkNode);
    closeAddBookmarkDialog();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Closing the dialog means "done" (keep the bookmark)
      handleDone();
    }
  };

  return (
    <Dialog
      open={addBookmarkDialogOpen}
      onOpenChange={handleOpenChange}
      onOpenChangeComplete={(open) => {
        if (!open) finishCloseAddBookmarkDialog();
      }}
    >
      <DialogContent
        initialFocus={() => {
          titleInputRef.current?.select();
          return titleInputRef.current;
        }}
      >
        <DialogHeader>
          <DialogTitle>已添加书签</DialogTitle>
          <DialogDescription className="sr-only">
            编辑名称、网址和插入位置
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="add-bookmark-title">名称</FieldLabel>
            <Input
              id="add-bookmark-title"
              ref={titleInputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleDone();
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="add-bookmark-url">网址</FieldLabel>
            <Input
              id="add-bookmark-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleDone();
              }}
            />
          </Field>
          <InsertPositionField value={position} onChange={setPosition} />
        </FieldGroup>
        <DialogFooter>
          <Button variant="destructive" size="sm" onClick={handleRemove}>
            移除
          </Button>
          <Button size="sm" onClick={handleDone}>
            完成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
