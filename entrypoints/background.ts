import { getIconImageData } from '@/lib/icon-utils';

export default defineBackground(() => {
  // ── Disable side panel opening on action click so popup works ──
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

  // ── Side panel state tracking ──
  // 内存 Set 用于同步查询（sidePanel.open 必须在用户手势的同步调用链中）
  // chrome.storage.session 用于持久化（Service Worker 休眠重启后恢复）
  const STORAGE_KEY = 'sidepanel_open_windows';
  const openSidePanels = new Set<number>();

  // SW 启动时立即从 storage 恢复状态到内存
  chrome.storage.session.get(STORAGE_KEY).then((data) => {
    const ids: number[] = data[STORAGE_KEY] ?? [];
    ids.forEach((id) => openSidePanels.add(id));
  });

  function persistState() {
    chrome.storage.session.set({ [STORAGE_KEY]: [...openSidePanels] });
  }

  // 监听来自 sidepanel 的状态消息
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'sidepanel-opened' && msg.windowId != null) {
      openSidePanels.add(msg.windowId);
      persistState();
    } else if (msg.type === 'sidepanel-closed' && msg.windowId != null) {
      openSidePanels.delete(msg.windowId);
      persistState();
    }
  });

  // 窗口关闭时清理对应状态
  chrome.windows.onRemoved.addListener((windowId) => {
    openSidePanels.delete(windowId);
    persistState();
  });

  // 切换侧栏 — 同步读取内存状态，不使用 await，保持用户手势上下文
  // 状态立即同步更新，不依赖 sidepanel 页面回报（beforeunload 中 sendMessage 不可靠）
  function toggleSidePanel(windowId: number) {
    if (openSidePanels.has(windowId)) {
      openSidePanels.delete(windowId);
      persistState();
      chrome.sidePanel.close({ windowId });
    } else {
      openSidePanels.add(windowId);
      persistState();
      chrome.sidePanel.open({ windowId });
    }
  }

  // ── Context menu: open sidebar ──
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: 'toggle-sidebar',
      title: '切换书签管理侧栏',
      contexts: ['action'], // right-click on extension icon
    });
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'toggle-sidebar' && tab?.windowId) {
      toggleSidePanel(tab.windowId);
    }
  });

  // ── Keyboard shortcut: toggle sidebar ──
  chrome.commands.onCommand.addListener(async (command, tab) => {
    if (command === 'toggle-sidebar') {
      const windowId = tab?.windowId;
      if (!windowId) return;
      toggleSidePanel(windowId);
    }
  });

  // ── Icon state management ──
  let iconCache: { filled?: Record<number, ImageData>; unfilled?: Record<number, ImageData> } = {};

  async function getFilledIcon() {
    if (!iconCache.filled) iconCache.filled = await getIconImageData(true);
    return iconCache.filled;
  }
  async function getUnfilledIcon() {
    if (!iconCache.unfilled) iconCache.unfilled = await getIconImageData(false);
    return iconCache.unfilled;
  }

  async function findBookmarkForUrl(url: string): Promise<chrome.bookmarks.BookmarkTreeNode | null> {
    if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url === 'about:blank') {
      return null;
    }
    try {
      const results = await chrome.bookmarks.search({ url });
      return results.length > 0 ? results[0] : null;
    } catch {
      return null;
    }
  }

  async function updateIconForTab(tabId: number, url?: string) {
    try {
      if (!url) {
        const tab = await chrome.tabs.get(tabId);
        url = tab.url;
      }
      if (!url) return;

      const bookmark = await findBookmarkForUrl(url);
      const imageData = bookmark ? await getFilledIcon() : await getUnfilledIcon();
      const title = bookmark ? 'Bookmark Pro - 已收藏' : 'Bookmark Pro - 未收藏';

      await chrome.action.setIcon({ tabId, imageData });
      await chrome.action.setTitle({ tabId, title });
    } catch {
      // Tab may have been closed during async operations — ignore
    }
  }

  // Update when tab is activated / URL changes
  chrome.tabs.onActivated.addListener((activeInfo) => {
    updateIconForTab(activeInfo.tabId).catch(() => {});
  });

  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status === 'complete') {
      if (tab.id) updateIconForTab(tab.id, tab.url).catch(() => {});
    }
  });

  // Update icon when bookmarks change
  async function updateActiveTabIcon() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) updateIconForTab(tab.id, tab.url);
    } catch {
      // ignore
    }
  }

  chrome.bookmarks.onCreated.addListener(() => updateActiveTabIcon());
  chrome.bookmarks.onRemoved.addListener(() => updateActiveTabIcon());
  chrome.bookmarks.onChanged.addListener(() => updateActiveTabIcon());
  chrome.bookmarks.onMoved.addListener(() => updateActiveTabIcon());
});
