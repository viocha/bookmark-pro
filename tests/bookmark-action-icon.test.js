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
    tabs: {
      get: async (id) => ({ id, url: tabs.get(id) }),
      query: async () => [],
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
