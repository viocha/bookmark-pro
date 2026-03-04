import { getIconImageData } from '@/lib/icon-utils';

export default defineBackground(() => {
  // ── Disable side panel opening on action click so popup works ──
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

  // ── Side panel state tracking ──
  // 内存 Set 用于同步查询（sidePanel.open 必须在用户手势的同步调用链中）
  // chrome.storage.session 用于持久化（Service Worker 休眠重启后恢复）
  const STORAGE_KEY = 'sidepanel_open_windows';
  const openSidePanels = new Set<number>();

  // SW 启动时从 session storage 恢复状态。
  // 同时用 prevOpenSidePanels 记录"休眠前"的真实状态，
  // 供 onCommand 在 await 之后判断面板原本是否打开。
  let stateRestored = false;
  const prevOpenSidePanels = new Set<number>();
  const stateRestorePromise = chrome.storage.session.get(STORAGE_KEY).then((data) => {
    const rawIds = data[STORAGE_KEY];
    const ids = Array.isArray(rawIds) ? rawIds.filter((id): id is number => typeof id === 'number') : [];
    ids.forEach((id) => {
      openSidePanels.add(id);
      prevOpenSidePanels.add(id);
    });
    stateRestored = true;
    updateDebugMenu();
  });

  function persistState() {
    chrome.storage.session.set({ [STORAGE_KEY]: [...openSidePanels] });
    updateDebugMenu();
  }

  // 更新调试菜单标题（在状态变更后调用）
  // MV3 Service Worker 不支持 contextMenus.onShown，只能主动推送。
  // 不依赖 getCurrent()——SW 无用户交互上下文时该 API 会失败。
  function updateDebugMenu() {
    const restored = stateRestored ? '' : ' SW↑';
    const ids = [...openSidePanels];
    const title = ids.length > 0
      ? `[调试] 侧栏已打开的窗口: [${ids.join(', ')}]${restored}`
      : `[调试] 侧栏：全部关闭${restored}`;
    chrome.contextMenus.update('debug-state', { title }).catch((err: Error) => {
      // 首次安装时 stateRestorePromise 在 onInstalled 之前 resolve，菜单尚未创建，
      // 此错误是预期行为（onInstalled 回调内会再次调用 updateDebugMenu 补正）。
      if (err?.message?.includes('Cannot find menu item')) return;
      console.error('[Bookmark Pro] Failed to update debug-state context menu:', err);
    });
  }

  // 监听来自 sidepanel 的长连接以跟踪真实打开/关闭状态
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name.startsWith('sidepanel-')) {
      const windowId = parseInt(port.name.replace('sidepanel-', ''), 10);
      if (!isNaN(windowId)) {
        openSidePanels.add(windowId);
        persistState();

        port.onDisconnect.addListener(() => {
          openSidePanels.delete(windowId);
          persistState();
        });
      }
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

  // ── Context menu ──
  // onInstalled 在首次安装/更新时触发，此时 stateRestorePromise 可能已先 resolve（纯内存操作极快），
  // 导致 updateDebugMenu() 在菜单创建前就运行、update 失败。
  // 因此在创建完菜单后立即调用一次 updateDebugMenu() 以同步当前状态。
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: 'toggle-sidebar',
      title: '切换书签管理侧栏',
      contexts: ['action'],
    });
    chrome.contextMenus.create({
      id: 'debug-state',
      title: '侧栏状态…',
      enabled: false,
      contexts: ['action'],
    }, () => {
      // 菜单已创建，立即刷新为真实状态
      updateDebugMenu();
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

      if (stateRestored) {
        // SW 已在运行，状态是最新的，直接切换
        toggleSidePanel(windowId);
        return;
      }

      // SW 刚被快捷键唤醒，openSidePanels 尚为空（等待 storage 恢复中）。
      // 必须在此处同步调用 sidePanel.open()，以保留用户手势上下文；
      // 若面板已开则 open() 是 no-op，不会报错。
      chrome.sidePanel.open({ windowId });

      // sidePanel.close() 不需要用户手势，可在 await 后安全调用。
      // 等待状态恢复，然后判断面板原本是否打开（即用户是否想关闭）。
      await stateRestorePromise;

      if (prevOpenSidePanels.has(windowId)) {
        // 面板原本是打开的 → 用户想关闭，上方 open() 是 no-op，现在关闭
        openSidePanels.delete(windowId);
        persistState();
        chrome.sidePanel.close({ windowId });
      } else {
        // 面板原本是关闭的 → 已被上方 open() 正确打开
        openSidePanels.add(windowId);
        persistState();
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

  function isMissingTabError(message?: string) {
    if (!message) return false;
    return message.includes('No tab with id');
  }

  function getTabSafely(tabId: number): Promise<chrome.tabs.Tab | null> {
    return new Promise((resolve, reject) => {
      chrome.tabs.get(tabId, (tab) => {
        const error = chrome.runtime.lastError;
        if (!error) {
          resolve(tab);
          return;
        }
        if (isMissingTabError(error.message)) {
          resolve(null);
          return;
        }
        reject(new Error(error.message));
      });
    });
  }

  function setActionForTabSafely(
    run: (callback: () => void) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      run(() => {
        const error = chrome.runtime.lastError;
        if (!error || isMissingTabError(error.message)) {
          resolve();
          return;
        }
        reject(new Error(error.message));
      });
    });
  }

  async function updateIconForTab(tabId: number, url?: string) {
    try {
      if (!url) {
        const tab = await getTabSafely(tabId);
        url = tab?.url;
      }
      if (!url) return;

      const bookmark = await findBookmarkForUrl(url);
      const imageData = bookmark ? await getFilledIcon() : await getUnfilledIcon();
      const title = bookmark ? 'Bookmark Pro - 已收藏' : 'Bookmark Pro - 未收藏';

      // 使用 callback 读取 runtime.lastError，避免 "Unchecked runtime.lastError" 噪音。
      await setActionForTabSafely((callback) => chrome.action.setIcon({ tabId, imageData }, callback));
      await setActionForTabSafely((callback) => chrome.action.setTitle({ tabId, title }, callback));
    } catch (error) {
      // Tab may have been closed during async operations — ignore
      const message = error instanceof Error ? error.message : String(error);
      if (!isMissingTabError(message)) {
        console.error('[Bookmark Pro] Failed to update action icon state', error);
      }
    }
  }

  // Update when tab is activated / URL changes
  chrome.tabs.onActivated.addListener((activeInfo) => {
    updateIconForTab(activeInfo.tabId).catch(() => { });
  });

  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.status === 'complete') {
      if (tab.id) updateIconForTab(tab.id, tab.url).catch(() => { });
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

  // ── Cross-extension: handle LOCATE_BOOKMARK from Newtab Pro ──
  // Newtab Pro sends { type: 'LOCATE_BOOKMARK', nodeId } via chrome.runtime.sendMessage(extensionId, ...).
  // IMPORTANT: chrome.sidePanel.open() must be called **synchronously** at the top of this handler
  // to preserve the user-gesture context that Chrome requires. sender.tab is available synchronously
  // because the message originates from a newtab extension page (which runs inside a tab).
  chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'LOCATE_BOOKMARK' || typeof message.nodeId !== 'string') {
      return;
    }
    const nodeId = message.nodeId as string;

    // ── Open side panel synchronously (must happen before any await / .then) ──
    const senderWindowId = sender.tab?.windowId;
    if (senderWindowId != null && !openSidePanels.has(senderWindowId)) {
      openSidePanels.add(senderWindowId);
      persistState();
      // Synchronous call — preserves user-gesture context propagated through sendMessage.
      chrome.sidePanel.open({ windowId: senderWindowId });
    }

    // Persist locate request so sidepanel picks it up on mount (handles race with panel not yet rendered)
    chrome.storage.session
      .set({ locateRequest: { nodeId, ts: Date.now() } })
      .catch(() => {});

    // Also forward in real-time if the sidepanel is already connected
    chrome.runtime
      .sendMessage({ type: 'LOCATE_BOOKMARK', nodeId })
      .catch(() => {
        // Normal when sidepanel is not yet open
      });

    sendResponse({ ok: true });
    return true;
  });
});
