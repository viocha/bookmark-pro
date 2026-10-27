import { afterEach, expect, test } from 'bun:test';
import { registerBookmarkFolderTracking } from '../lib/bookmark-folder-tracking';
import { getLastFolderId } from '../lib/bookmark-storage';

const originalChrome = globalThis.chrome;
afterEach(() => { globalThis.chrome = originalChrome; });

function event() {
  let listener;
  return {
    addListener(callback) { listener = callback; },
    emit(...args) { return listener(...args); },
  };
}

function fixture() {
  const data = { 'bookmark-pro-last-folder': 'popup-folder' };
  const nodes = new Map();
  const writes = [];
  const api = {
    bookmarks: {
      onCreated: event(), onMoved: event(),
      get: async id => nodes.has(id) ? [nodes.get(id)] : [],
    },
    storage: { local: {
      get: async key => ({ [key]: data[key] }),
      set: async values => { writes.push(values); Object.assign(data, values); },
    } },
  };
  globalThis.chrome = api;
  registerBookmarkFolderTracking(api);
  const create = parentId => api.bookmarks.onCreated.emit('new-bookmark', {
    id: 'new-bookmark', parentId, url: 'https://example.com',
  });
  const move = (id, parentId, oldParentId = 'source') => api.bookmarks.onMoved.emit(id, {
    parentId, oldParentId, index: 0, oldIndex: 1,
  });
  return { api, nodes, writes, data, create, move };
}

test('后台启动保留位置，浏览器内置收藏后 Popup 读取最新文件夹', async () => {
  const { create } = fixture();
  expect(await getLastFolderId()).toBe('popup-folder');
  await create('browser-folder');
  expect(await getLastFolderId()).toBe('browser-folder');
});

test('其他来源新建书签及其后续跨文件夹移动均更新默认位置', async () => {
  const { create, move, nodes } = fixture();
  await create('initial-folder');
  nodes.set('new-bookmark', { id: 'new-bookmark', url: 'https://example.com' });
  await move('new-bookmark', 'chosen-folder', 'initial-folder');
  expect(await getLastFolderId()).toBe('chosen-folder');
});

test('新建或移动文件夹、同目录排序均保留最近收藏位置', async () => {
  const { api, move, nodes, writes } = fixture();
  await api.bookmarks.onCreated.emit('folder', { id: 'folder', parentId: '1' });
  nodes.set('folder', { id: 'folder' });
  await move('folder', 'another-folder');
  await move('bookmark', 'source', 'source');
  expect(writes).toEqual([]);
  expect(await getLastFolderId()).toBe('popup-folder');
});

test('移动查询晚于后续新增完成时，最终位置仍按事件顺序确定', async () => {
  const { api, move, create, writes } = fixture();
  const lookup = Promise.withResolvers();
  const started = Promise.withResolvers();
  api.bookmarks.get = () => { started.resolve(); return lookup.promise; };
  const moved = move('old-bookmark', 'move-folder');
  await started.promise;
  const created = create('latest-folder');
  lookup.resolve([{ id: 'old-bookmark', url: 'https://example.com/old' }]);
  await Promise.all([moved, created]);
  expect(writes).toEqual([
    { 'bookmark-pro-last-folder': 'move-folder' },
    { 'bookmark-pro-last-folder': 'latest-folder' },
  ]);
  expect(await getLastFolderId()).toBe('latest-folder');
});

test('移动后条目被删除时跳过，后续新增仍正常更新位置', async () => {
  const { api, move, create } = fixture();
  api.bookmarks.get = async () => { throw new Error('书签已删除'); };
  await move('removed', 'missing-folder');
  expect(await getLastFolderId()).toBe('popup-folder');
  await create('latest-folder');
  expect(await getLastFolderId()).toBe('latest-folder');
});
