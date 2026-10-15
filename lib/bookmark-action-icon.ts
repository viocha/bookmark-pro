import { getIconImageData } from './icon-utils';

/** 工具栏图标按标签页设置，收藏状态由浏览器事件更新。 */
export function registerBookmarkActionIcon(
  api = chrome,
  createIcon = getIconImageData,
) {
  const requests = new Map<number, object>();
  const icons = new Map<boolean, Promise<Record<number, ImageData>>>();
  const states = new Map<number, { url: string | undefined; filled: boolean }>();

  async function updateTab(tabId: number, url?: string) {
    const request = {};
    requests.set(tabId, request);
    try {
      if (url === undefined) {
        const tab = await api.tabs.get(tabId);
        url = tab.pendingUrl || tab.url;
      }
      const cached = states.get(tabId);
      const filled = cached && cached.url === url
        ? cached.filled
        : url ? (await api.bookmarks.search({ url })).length > 0 : false;
      if (!icons.has(filled)) icons.set(filled, createIcon(filled));
      const imageData = await icons.get(filled)!;
      // 导航或书签变化产生的新请求优先，已关闭标签页不再更新。
      if (requests.get(tabId) !== request) return;
      await api.action.setIcon({ tabId, imageData });
      if (requests.get(tabId) === request) states.set(tabId, { url, filled });
    } catch (error) {
      if (requests.get(tabId) !== request) return;
      console.error('[Bookmark Pro] 更新收藏图标失败:', error);
    }
  }

  async function updateActiveTabs() {
    const tabs = await api.tabs.query({ active: true });
    await Promise.all(tabs.map(tab => tab.id == null ? undefined : updateTab(tab.id)));
  }

  const refresh = () => {
    states.clear();
    return updateActiveTabs().catch(console.error);
  };
  api.tabs.onCreated.addListener(tab => {
    if (tab.id != null) return updateTab(tab.id, tab.pendingUrl || tab.url);
  });
  api.tabs.onActivated.addListener(({ tabId }) => updateTab(tabId));
  api.tabs.onUpdated.addListener((tabId, change, tab) => {
    if (change.url !== undefined || change.status === 'loading') {
      return updateTab(tabId, tab?.pendingUrl || change.url || tab?.url);
    }
  });
  // Chromium 在导航提交时清除标签页图标；刷新相同网址时直接恢复缓存状态。
  api.webNavigation.onCommitted.addListener(details => {
    if (details.frameId === 0) return updateTab(details.tabId, details.url);
  });
  api.tabs.onRemoved.addListener(tabId => {
    requests.delete(tabId);
    states.delete(tabId);
  });
  api.bookmarks.onCreated.addListener(refresh);
  api.bookmarks.onRemoved.addListener(refresh);
  api.bookmarks.onChanged.addListener((_id, change) => {
    if (change.url !== undefined) return refresh();
  });
  api.bookmarks.onImportEnded.addListener(refresh);
  void refresh();
}
