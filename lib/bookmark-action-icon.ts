import { getIconImageData } from './icon-utils';

/** 工具栏图标按标签页设置，收藏状态由浏览器事件更新。 */
export function registerBookmarkActionIcon(
  api = chrome,
  createIcon = getIconImageData,
) {
  const requests = new Map<number, object>();
  const icons = new Map<boolean, Promise<Record<number, ImageData>>>();

  async function updateTab(tabId: number) {
    const request = {};
    requests.set(tabId, request);
    try {
      const tab = await api.tabs.get(tabId);
      const bookmarks = tab.url ? await api.bookmarks.search({ url: tab.url }) : [];
      const filled = bookmarks.length > 0;
      if (!icons.has(filled)) icons.set(filled, createIcon(filled));
      const imageData = await icons.get(filled)!;
      // 导航或书签变化产生的新请求优先，已关闭标签页不再更新。
      if (requests.get(tabId) !== request) return;
      await api.action.setIcon({ tabId, imageData });
    } catch (error) {
      if (requests.get(tabId) !== request) return;
      console.error('[Bookmark Pro] 更新收藏图标失败:', error);
    }
  }

  async function updateActiveTabs() {
    const tabs = await api.tabs.query({ active: true });
    await Promise.all(tabs.map(tab => tab.id == null ? undefined : updateTab(tab.id)));
  }

  const refresh = () => updateActiveTabs().catch(console.error);
  api.tabs.onActivated.addListener(({ tabId }) => updateTab(tabId));
  api.tabs.onUpdated.addListener((tabId, change) => {
    if (change.url !== undefined || change.status === 'complete') return updateTab(tabId);
  });
  api.tabs.onRemoved.addListener(tabId => requests.delete(tabId));
  api.bookmarks.onCreated.addListener(refresh);
  api.bookmarks.onRemoved.addListener(refresh);
  api.bookmarks.onChanged.addListener((_id, change) => {
    if (change.url !== undefined) return refresh();
  });
  api.bookmarks.onImportEnded.addListener(refresh);
  void refresh();
}
