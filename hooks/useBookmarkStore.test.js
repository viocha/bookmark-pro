import { describe, expect, test } from 'bun:test';
import { useBookmarkStore } from './useBookmarkStore';

const firstNode = { id: '10', parentId: '1', title: '文件夹' };
const nextNode = { id: '11', parentId: '2', title: '书签', url: 'https://example.com' };
const dialogs = [
  {
    name: '移动',
    open: (node) => useBookmarkStore.getState().openMoveDialog(node),
    close: 'closeMoveDialog',
    finish: 'finishCloseMoveDialog',
    openKey: 'moveDialogOpen',
    fields: ['moveTargetNode', 'moveTargetNodes'],
    cleared: { moveTargetNode: null, moveTargetNodes: [] },
  },
  {
    name: '编辑',
    open: (node) => useBookmarkStore.getState().openEditDialog(node),
    close: 'closeEditDialog',
    finish: 'finishCloseEditDialog',
    openKey: 'editDialogOpen',
    fields: ['editingNode'],
    cleared: { editingNode: null },
  },
  {
    name: '创建文件夹',
    open: (node) => useBookmarkStore.getState().openCreateFolderDialog(node.parentId),
    close: 'closeCreateFolderDialog',
    finish: 'finishCloseCreateFolderDialog',
    openKey: 'createFolderDialogOpen',
    fields: ['createFolderParentId'],
    cleared: { createFolderParentId: null },
  },
  {
    name: '添加书签',
    open: (node) => useBookmarkStore.getState().openAddBookmarkDialog(node, node.title, node.url ?? ''),
    close: 'closeAddBookmarkDialog',
    finish: 'finishCloseAddBookmarkDialog',
    openKey: 'addBookmarkDialogOpen',
    fields: ['addBookmarkNode', 'addBookmarkTitle', 'addBookmarkUrl'],
    cleared: { addBookmarkNode: null, addBookmarkTitle: '', addBookmarkUrl: '' },
  },
];

for (const dialog of dialogs) {
  const content = () => Object.fromEntries(dialog.fields.map((key) => [key, useBookmarkStore.getState()[key]]));

  describe(`${dialog.name}对话框关闭生命周期`, () => {
    test('退出期间保留内容，退出完成后清理', () => {
      dialog.open(firstNode);
      const snapshot = content();
      useBookmarkStore.getState()[dialog.close]();
      expect(useBookmarkStore.getState()[dialog.openKey]).toBe(false);
      expect(content()).toEqual(snapshot);
      useBookmarkStore.getState()[dialog.finish]();
      expect(content()).toEqual(dialog.cleared);
    });

    test('重新打开后收到退出回调，不清理当前内容', () => {
      dialog.open(firstNode);
      useBookmarkStore.getState()[dialog.close]();
      dialog.open(nextNode);
      const snapshot = content();
      useBookmarkStore.getState()[dialog.finish]();
      expect(useBookmarkStore.getState()[dialog.openKey]).toBe(true);
      expect(content()).toEqual(snapshot);
      useBookmarkStore.getState()[dialog.close]();
      useBookmarkStore.getState()[dialog.finish]();
    });
  });
}
