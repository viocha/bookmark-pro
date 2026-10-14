import { registerBookmarkActionIcon } from '@/lib/bookmark-action-icon';

export default defineBackground(() => {
  registerBookmarkActionIcon();
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
  // 启动期间到达的浏览器事件优先于异步读取的状态。
  const changedDuringRestore = new Set<number>();
  const stateRestorePromise = chrome.storage.session.get(STORAGE_KEY).then((data) => {
    const rawIds = data[STORAGE_KEY];
    const ids = Array.isArray(rawIds) ? rawIds.filter((id): id is number => typeof id === 'number') : [];
    ids.forEach((id) => {
      if (changedDuringRestore.has(id)) return;
      openSidePanels.add(id);
      prevOpenSidePanels.add(id);
    });
    stateRestored = true;
    changedDuringRestore.clear();
    persistState();
  });

  function persistState() {
    chrome.storage.session.set({ [STORAGE_KEY]: [...openSidePanels] });
    updateDebugMenu();
  }

  function ensureSidePanelOpen(windowId: number) {
    if (openSidePanels.has(windowId)) return;
    openSidePanels.add(windowId);
    persistState();
    chrome.sidePanel.open({ windowId });
  }

  function dispatchLocateBookmark(nodeId: string) {
    chrome.storage.session
      .set({ locateRequest: { nodeId, ts: Date.now() } })
      .catch(() => {});

    chrome.runtime
      .sendMessage({ type: 'LOCATE_BOOKMARK', nodeId })
      .catch(() => {
        // Normal when sidepanel is not yet open
      });
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

  // 浏览器事件在 SW 休眠时也能唤醒后台，关闭状态不依赖页面长连接。
  chrome.sidePanel.onOpened.addListener(({ windowId }) => {
    if (!stateRestored) changedDuringRestore.add(windowId);
    openSidePanels.add(windowId);
    persistState();
  });
  chrome.sidePanel.onClosed.addListener(({ windowId }) => {
    if (!stateRestored) changedDuringRestore.add(windowId);
    openSidePanels.delete(windowId);
    prevOpenSidePanels.delete(windowId);
    persistState();
  });

  // Edge 原生关闭按钮可能不触发 onClosed，以页面连接销毁补充关闭通知。
  const panelPorts = new Map<number, chrome.runtime.Port>();
  chrome.runtime.onConnect.addListener((port) => {
    if (!/^sidepanel-\d+$/.test(port.name)) return;
    const windowId = Number(port.name.slice('sidepanel-'.length));
    panelPorts.set(windowId, port);
    if (!stateRestored) changedDuringRestore.add(windowId);
    openSidePanels.add(windowId);
    persistState();
    port.onDisconnect.addListener(() => {
      // 重连替换端口后，旧连接的关闭不能覆盖当前页面的状态。
      if (panelPorts.get(windowId) !== port) return;
      panelPorts.delete(windowId);
      if (!stateRestored) changedDuringRestore.add(windowId);
      openSidePanels.delete(windowId);
      prevOpenSidePanels.delete(windowId);
      persistState();
    });
  });

  // 窗口关闭时清理对应状态
  chrome.windows.onRemoved.addListener((windowId) => {
    if (!stateRestored) changedDuringRestore.add(windowId);
    openSidePanels.delete(windowId);
    prevOpenSidePanels.delete(windowId);
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
      ensureSidePanelOpen(windowId);
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (
      message?.type === 'PREPARE_LOCATE_BOOKMARK_FROM_POPUP' &&
      typeof message.windowId === 'number'
    ) {
      ensureSidePanelOpen(message.windowId);
      sendResponse({ ok: true });
      return true;
    }

    if (
      message?.type === 'LOCATE_BOOKMARK_FROM_POPUP' &&
      typeof message.nodeId === 'string'
    ) {
      dispatchLocateBookmark(message.nodeId);
      sendResponse({ ok: true });
      return true;
    }

    return undefined;
  });

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
      const wasOpen = openSidePanels.has(windowId);
      chrome.sidePanel.open({ windowId });

      // sidePanel.close() 不需要用户手势，可在 await 后安全调用。
      // 等待状态恢复，然后判断面板原本是否打开（即用户是否想关闭）。
      await stateRestorePromise;

      if (wasOpen || prevOpenSidePanels.has(windowId)) {
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
    if (senderWindowId != null) {
      // Synchronous call — preserves user-gesture context propagated through sendMessage.
      ensureSidePanelOpen(senderWindowId);
    }

    dispatchLocateBookmark(nodeId);

    sendResponse({ ok: true });
    return true;
  });
});
