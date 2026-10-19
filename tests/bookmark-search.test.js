import { afterEach, expect, test } from 'bun:test';
import { useBookmarkStore } from '../hooks/useBookmarkStore';
import { buildBookmarkFolderPaths } from '../lib/bookmark-search';

const originalChrome = globalThis.chrome;
afterEach(() => {
  useBookmarkStore.getState().clearSearch();
  globalThis.chrome = originalChrome;
});

test('搜索路径直接从树构建，省略根节点并复用各级文件夹路径', () => {
  const tree = [{ id: '0', title: '', children: [{ id: '1', title: '', children: [
    { id: '10', title: '开发', children: [{ id: '11', title: '工具', children: [] }] },
    { id: '20', title: '书签', url: 'https://example.com' },
  ] }] }];
  const paths = buildBookmarkFolderPaths(tree);
  expect(paths.get('1')).toBe('书签栏');
  expect(paths.get('11')).toBe('书签栏 / 开发 / 工具');
  expect(paths.has('20')).toBe(false);
});

test('后发搜索先完成时，旧查询不能覆盖最新结果', async () => {
  const pending = new Map();
  globalThis.chrome = { bookmarks: { search: query => new Promise(resolve => pending.set(query, resolve)) } };
  const store = useBookmarkStore.getState();
  store.setSearchQuery('s');
  const first = store.performSearch('s');
  store.setSearchQuery('shadcn');
  const second = store.performSearch('shadcn');
  const result = [{ id: '1', title: 'shadcn' }];
  pending.get('shadcn')(result);
  await second;
  pending.get('s')([{ id: '2', title: 'stale' }]);
  await first;
  expect(useBookmarkStore.getState().searchResults).toEqual(result);
  expect(useBookmarkStore.getState().isSearching).toBe(false);
});

test('清空后重新输入相同搜索词，已清空的查询不能重新显示结果', async () => {
  let finish;
  globalThis.chrome = { bookmarks: { search: () => new Promise(resolve => { finish = resolve; }) } };
  const store = useBookmarkStore.getState();
  store.setSearchQuery('s');
  const request = store.performSearch('s');
  store.clearSearch();
  store.setSearchQuery('s');
  finish([{ id: '1', title: 'stale' }]);
  await request;
  expect(useBookmarkStore.getState().searchResults).toBe(null);
});

test('修改搜索词后仍显示上一批结果，过期防抖任务不再查询', async () => {
  let count = 0;
  globalThis.chrome = { bookmarks: { search: async () => { count++; return [{ id: '1', title: 's' }]; } } };
  const store = useBookmarkStore.getState();
  store.setSearchQuery('s');
  await store.performSearch('s');
  const previous = useBookmarkStore.getState().searchResults;
  store.setSearchQuery('shadcn');
  await store.performSearch('s');
  expect(count).toBe(1);
  expect(useBookmarkStore.getState().searchResults).toBe(previous);
});
