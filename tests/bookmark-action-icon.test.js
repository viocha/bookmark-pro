import { expect, test } from "bun:test";
import { registerBookmarkActionIcon } from "../lib/bookmark-action-icon";
function event() {
  let listener;
  return {
    addListener(callback) {
      listener = callback;
    },
    emit(...args) {
      return listener(...args);
    }
  };
}
function fixture() {
  const tabs = new Map([[1, "https://example.com/a"], [2, "https://example.com/b"]]);
  const saved = new Set(["https://example.com/a"]);
  const calls = [];
  const api = {
    webNavigation: { onCommitted: event() },
    tabs: {
      get: async (id) => ({ id, url: tabs.get(id) }),
      query: async () => [],
      onCreated: event(),
      onActivated: event(),
      onUpdated: event(),
      onRemoved: event()
    },
    bookmarks: {
      search: async ({ url }) => saved.has(url) ? [{}] : [],
      onCreated: event(),
      onRemoved: event(),
      onChanged: event(),
      onImportEnded: event()
    },
    action: { setIcon: async ({ tabId, imageData }) => {
      calls.push({ tabId, filled: imageData.filled });
    } }
  };
  registerBookmarkActionIcon(api, async (filled) => ({ filled }));
  return { api, tabs, saved, calls };
}
test("切换标签页和同一标签页导航，图标按当前网址显示收藏状态", async () => {
  const { api, tabs, calls } = fixture();
  await api.tabs.onActivated.emit({ tabId: 1 });
  await api.tabs.onActivated.emit({ tabId: 2 });
  tabs.set(2, "https://example.com/a");
  await api.tabs.onUpdated.emit(2, { url: tabs.get(2) });
  expect(calls).toEqual([{ tabId: 1, filled: true }, { tabId: 2, filled: false }, { tabId: 2, filled: true }]);
});
test("新标签创建、开始加载和激活时使用目标网址，在加载完成前更新图标", async () => {
  const { api, calls } = fixture();
  // url 仍是空白页或旧页面，pendingUrl 已知，不发送 complete 事件。
  await api.tabs.onCreated.emit({ id: 3, url: 'about:blank', pendingUrl: 'https://example.com/a', status: 'loading' });
  await api.tabs.onUpdated.emit(2, { status: 'loading' }, { url: 'https://example.com/b', pendingUrl: 'https://example.com/a' });
  api.tabs.get = async () => ({ id: 1, url: 'https://example.com/a', pendingUrl: 'https://example.com/b' });
  await api.tabs.onActivated.emit({ tabId: 1 });
  expect(calls).toEqual([{ tabId: 3, filled: true }, { tabId: 2, filled: true }, { tabId: 1, filled: false }]);
});

test("网址变更事件直接使用事件网址，不重新读取尚未更新的标签页网址", async () => {
  const { api, calls } = fixture();
  api.tabs.get = async () => { throw new Error('已有事件网址时无需查询'); };
  await api.tabs.onUpdated.emit(2, { url: 'https://example.com/a' });
  expect(calls).toEqual([{ tabId: 2, filled: true }]);
});

test("新建、删除、修改网址和导入书签后刷新活动标签页", async () => {
  const { api, saved, calls } = fixture();
  api.tabs.query = async () => [{ id: 1 }];
  saved.clear();
  await api.bookmarks.onRemoved.emit("folder", {});
  saved.add("https://example.com/a");
  await api.bookmarks.onCreated.emit("bookmark", {});
  saved.clear();
  await api.bookmarks.onChanged.emit("bookmark", { url: "https://example.com/c" });
  saved.add("https://example.com/a");
  await api.bookmarks.onImportEnded.emit();
  expect(calls.map((call) => call.filled)).toEqual([false, true, false, true]);
});

test("同网址刷新在导航提交后恢复已收藏图标，无需重新查询或等待加载完成", async () => {
  const { api, calls } = fixture();
  await api.tabs.onActivated.emit({ tabId: 1 });
  api.bookmarks.search = async () => { throw new Error('相同网址刷新直接使用收藏缓存'); };
  await api.tabs.onUpdated.emit(1, { status: 'loading' }, { url: 'https://example.com/a' });
  await api.webNavigation.onCommitted.emit({ tabId: 1, frameId: 0, url: 'https://example.com/a' });
  expect(calls).toEqual([{ tabId: 1, filled: true }, { tabId: 1, filled: true }, { tabId: 1, filled: true }]);
});

test("重定向提交到新网址时重新判断收藏，子框架导航不改变图标", async () => {
  const { api, calls } = fixture();
  await api.tabs.onActivated.emit({ tabId: 1 });
  await api.webNavigation.onCommitted.emit({ tabId: 1, frameId: 1, url: 'https://example.com/b' });
  await api.webNavigation.onCommitted.emit({ tabId: 1, frameId: 0, url: 'https://example.com/b' });
  expect(calls).toEqual([{ tabId: 1, filled: true }, { tabId: 1, filled: false }]);
});
test("过期导航查询和已关闭标签页的查询不会覆盖最新图标", async () => {
  const { api, tabs, calls } = fixture();
  let resolve;
  api.bookmarks.search = () => new Promise((done) => {
    resolve = done;
  });
  const first = api.tabs.onActivated.emit({ tabId: 1 });
  await Promise.resolve();
  api.bookmarks.search = async () => [];
  tabs.set(1, "https://example.com/b");
  await api.tabs.onUpdated.emit(1, { url: tabs.get(1) });
  resolve([{}]);
  await first;
  expect(calls).toEqual([{ tabId: 1, filled: false }]);
  tabs.set(1, 'https://example.com/c');
  api.bookmarks.search = () => new Promise((done) => {
    resolve = done;
  });
  const closing = api.tabs.onActivated.emit({ tabId: 1 });
  await Promise.resolve();
  api.tabs.onRemoved.emit(1);
  resolve([{}]);
  await closing;
  expect(calls).toHaveLength(1);
});
