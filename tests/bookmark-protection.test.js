import { afterEach, expect, test } from 'bun:test';
import { getProtectedNodeIds, isProtectedNode } from '../lib/bookmark-api';
import { useBookmarkStore } from '../hooks/useBookmarkStore';

const originalState = useBookmarkStore.getState();
afterEach(() => useBookmarkStore.setState(originalState, true));

const folder = { id: '10', parentId: '9000', title: '普通目录' };
const bookmark = { id: '11', parentId: '9000', title: '书签', url: 'https://example.com' };
const nextFolder = { id: '12', parentId: '9001', title: '其他目录' };
const fixed = { id: '9000', parentId: '0', title: '书签栏', children: [folder, bookmark] };
const other = { id: '9001', parentId: '0', title: '其他书签', children: [nextFolder] };
const tree = [{ id: '0', title: '', children: [fixed, other] }];

function setup() {
  useBookmarkStore.setState({
    tree, selectedIds: new Set(), lastSelectedId: null,
    moveDialogOpen: false, moveTargetNode: null, moveTargetNodes: [],
  });
  return useBookmarkStore.getState();
}

test('固定目录由节点属性判定，不能依赖浏览器分配的 ID', () => {
  expect(isProtectedNode(fixed)).toBe(true);
  expect(isProtectedNode(other)).toBe(true);
  expect(isProtectedNode({ id: '9999', parentId: '123', folderType: 'other' })).toBe(true);
  expect(isProtectedNode({ id: '8888', parentId: '123', unmodifiable: 'managed' })).toBe(true);
  expect(isProtectedNode({ id: '3', parentId: '9000' })).toBe(false);
  expect(getProtectedNodeIds(tree)).toEqual(new Set(['0', '9000', '9001']));
});

test('根目录不能单独选择，Shift 范围选择也跳过固定目录', () => {
  const store = setup();
  store.toggleSelect(other.id);
  expect(useBookmarkStore.getState().selectedIds.size).toBe(0);
  store.toggleSelect(folder.id);
  const flatIds = [fixed.id, folder.id, bookmark.id, other.id, nextFolder.id];
  store.rangeSelect(other.id, flatIds);
  expect(useBookmarkStore.getState().selectedIds).toEqual(new Set([folder.id]));
  store.rangeSelect(nextFolder.id, flatIds);
  expect(useBookmarkStore.getState().selectedIds).toEqual(new Set([folder.id, bookmark.id, nextFolder.id]));
});

test('单项和批量移动都不能包含固定目录', () => {
  const store = setup();
  store.openMoveDialog(other);
  expect(useBookmarkStore.getState().moveDialogOpen).toBe(false);
  useBookmarkStore.setState({ selectedIds: new Set([fixed.id, folder.id, other.id]) });
  store.openBatchMoveDialog();
  expect(useBookmarkStore.getState().moveTargetNodes).toEqual([folder]);
});

test('仅包含固定目录的选中状态不能触发批量移动或删除', async () => {
  const store = setup();
  useBookmarkStore.setState({ selectedIds: new Set([fixed.id, other.id]) });
  store.openBatchMoveDialog();
  expect(useBookmarkStore.getState().moveDialogOpen).toBe(false);
  await store.confirmBatchDelete();
  expect(useBookmarkStore.getState().tree).toEqual(tree);
  expect(useBookmarkStore.getState()._suppressReload).toBe(false);
});
