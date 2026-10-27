import { afterEach, expect, test } from 'bun:test';
import { savePopupBookmark } from '../lib/popup-bookmark';

const originalChrome = globalThis.chrome;
afterEach(() => { globalThis.chrome = originalChrome; });

function setup() {
  const bookmark = { id: 'bookmark', parentId: 'source', title: '名称', url: 'https://example.com' };
  const folders = [{ id: 'folder' }, { id: 'other', url: 'https://other.example.com' }];
  const moves = [];
  const updates = [];
  const stored = [];
  globalThis.chrome = {
    bookmarks: {
      get: async () => [{ ...bookmark }],
      getChildren: async () => folders,
      update: async (id, changes) => { updates.push({ id, changes }); Object.assign(bookmark, changes); },
      move: async (id, destination) => { moves.push({ id, destination }); Object.assign(bookmark, destination); },
    },
    storage: { local: { set: async values => { stored.push(values); } } },
  };
  const save = overrides => savePopupBookmark({
    id: bookmark.id,
    title: bookmark.title,
    url: bookmark.url,
    parentId: bookmark.parentId,
    position: 'bottom',
    reposition: false,
    ...overrides,
  });
  return { save, moves, updates, stored };
}

test('快速添加后选择顶部，即使文件夹不变也调整到书签顶部', async () => {
  const { save, moves } = setup();
  await save({ position: 'top', reposition: true });
  expect(moves).toEqual([{ id: 'bookmark', destination: { parentId: 'source', index: 1 } }]);
});

for (const position of ['top', 'bottom']) {
  test(`已有书签切换文件夹后按所选${position === 'top' ? '顶部' : '底部'}移动`, async () => {
    const { save, moves, stored } = setup();
    await save({ parentId: 'target', position });
    expect(moves).toEqual([{ id: 'bookmark', destination: { parentId: 'target', index: position === 'top' ? 1 : undefined } }]);
    // 最近收藏位置统一由后台的浏览器书签事件更新。
    expect(stored).toEqual([]);
  });
}

test('仅修改名称和网址时保持现有排序', async () => {
  const { save, moves, updates, stored } = setup();
  await save({ title: '新名称', url: 'https://new.example.com' });
  expect(updates).toEqual([{ id: 'bookmark', changes: { title: '新名称', url: 'https://new.example.com' } }]);
  expect(moves).toEqual([]);
  expect(stored).toEqual([]);
});

test('在更多面板选择原文件夹并明确选择底部时可以重新排序', async () => {
  const { save, moves } = setup();
  await save({ position: 'bottom', reposition: true });
  expect(moves).toEqual([{ id: 'bookmark', destination: { parentId: 'source', index: undefined } }]);
});

test('书签已被删除时跳过保存', async () => {
  const { save, moves, updates, stored } = setup();
  chrome.bookmarks.get = async () => { throw new Error('已删除'); };
  await save({ reposition: true });
  expect(moves).toEqual([]);
  expect(updates).toEqual([]);
  expect(stored).toEqual([]);
});
