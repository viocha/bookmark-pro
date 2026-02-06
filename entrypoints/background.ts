import { getIconImageData } from '@/lib/icon-utils';

export default defineBackground(() => {
  // ── Disable side panel opening on action click so popup works ──
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

  // ── Context menu: open sidebar ──
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: 'open-sidebar',
      title: '打开书签管理侧栏',
      contexts: ['action'], // right-click on extension icon
    });
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'open-sidebar' && tab?.windowId) {
      chrome.sidePanel.open({ windowId: tab.windowId });
    }
  });

  // ── Keyboard shortcut: toggle sidebar ──
  const sidePanelOpenWindows = new Set<number>();

  // Track side panel state via events (Chrome 141+/142+)
  try {
    chrome.sidePanel.onOpened.addListener((info) => {
      sidePanelOpenWindows.add(info.windowId);
    });
    chrome.sidePanel.onClosed.addListener((info) => {
      sidePanelOpenWindows.delete(info.windowId);
    });
  } catch {
    // Events not available in older Chrome versions
  }

  chrome.commands.onCommand.addListener((command, tab) => {
    if (command === 'toggle-sidebar' && tab?.windowId) {
      if (sidePanelOpenWindows.has(tab.windowId)) {
        chrome.sidePanel.close({ windowId: tab.windowId });
      } else {
        chrome.sidePanel.open({ windowId: tab.windowId });
      }
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
    if (!url) {
      try {
        const tab = await chrome.tabs.get(tabId);
        url = tab.url;
      } catch {
        return;
      }
    }
    if (!url) return;

    const bookmark = await findBookmarkForUrl(url);
    const imageData = bookmark ? await getFilledIcon() : await getUnfilledIcon();
    const title = bookmark ? 'Bookmark Pro - 已收藏' : 'Bookmark Pro - 未收藏';

    try {
      await chrome.action.setIcon({ tabId, imageData });
      await chrome.action.setTitle({ tabId, title });
    } catch {
      // Tab may have been closed
    }
  }

  // Update when tab is activated / URL changes
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    updateIconForTab(activeInfo.tabId);
  });

  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status === 'complete') {
      if (tab.id) updateIconForTab(tab.id, tab.url);
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
