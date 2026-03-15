import { useEffect, useRef, useState } from 'react';
import { useBookmarkStore } from '@/hooks/useBookmarkStore';
import { useSettings, type InsertPosition } from '@/hooks/useSettings';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function AddBookmarkDialog() {
  const {
    addBookmarkDialogOpen,
    addBookmarkNode,
    addBookmarkTitle,
    addBookmarkUrl,
    closeAddBookmarkDialog,
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
      // Select title text after dialog renders
      requestAnimationFrame(() => {
        titleInputRef.current?.focus();
        titleInputRef.current?.select();
      });
    }
  }, [addBookmarkDialogOpen, addBookmarkTitle, addBookmarkUrl, bookmarkInsertPosition]);

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
        const folders = children.filter(c => !c.url);
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
    <Dialog open={addBookmarkDialogOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[320px] p-4 gap-3">
        <DialogHeader className="pb-0">
          <DialogTitle className="text-sm">已添加书签</DialogTitle>
          <DialogDescription className="sr-only">
            编辑刚添加的书签名称、网址和插入位置。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">名称</label>
            <Input
              ref={titleInputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleDone(); }}
              className="h-7 text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">网址</label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleDone(); }}
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
        </div>
        <div className="flex justify-end gap-2 pt-0">
          <Button variant="outline" size="sm" onClick={handleRemove} className="h-7 text-xs text-destructive hover:text-destructive">
            移除
          </Button>
          <Button size="sm" onClick={handleDone} className="h-7 text-xs">
            完成
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
