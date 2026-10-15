import { afterAll, expect, test } from 'bun:test';

const originalDefineBackground = globalThis.defineBackground;
const originalChrome = globalThis.chrome;
globalThis.defineBackground = (setup) => setup;
const { default: setup } = await import('../entrypoints/background');
afterAll(() => {
  globalThis.defineBackground = originalDefineBackground;
  globalThis.chrome = originalChrome;
});

function createEvent() {
  let listener;
  return {
    addListener(callback) { listener = callback; },
    emit(...args) { return listener?.(...args); },
  };
}

function createBackground() {
  let restore;
  let stored = [];
  const calls = [];
  const opened = createEvent();
  const closed = createEvent();
  const command = createEvent();
  globalThis.chrome = {
    tabs: { get: async () => ({}), query: async () => [], onCreated: createEvent(), onActivated: createEvent(), onUpdated: createEvent(), onRemoved: createEvent() },
    bookmarks: { search: async () => [], onCreated: createEvent(), onRemoved: createEvent(), onChanged: createEvent(), onImportEnded: createEvent() },
    action: { setIcon: async () => {} },
    webNavigation: { onCommitted: createEvent() },
    sidePanel: {
      setPanelBehavior: async () => {},
      open: async ({ windowId }) => { calls.push(['open', windowId]); },
      close: async ({ windowId }) => { calls.push(['close', windowId]); },
      onOpened: opened,
      onClosed: closed,
    },
    storage: { session: {
      get: () => new Promise(resolve => { restore = resolve; }),
      set: async (data) => { stored = data.sidepanel_open_windows; },
    } },
    contextMenus: { update: async () => {}, create() {}, onClicked: createEvent() },
    runtime: { onConnect: createEvent(), onMessage: createEvent(), onInstalled: createEvent(), onMessageExternal: createEvent() },
    windows: { onRemoved: createEvent() },
    commands: { onCommand: command },
  };
  setup();
  return { calls, opened, closed, command, connect: chrome.runtime.onConnect, restore: async (ids) => {
    restore({ sidepanel_open_windows: ids });
    await Promise.resolve();
  }, getStored: () => stored };
}

test('后台冷启动时首次快捷键同步打开侧栏，恢复关闭状态后不反向关闭', async () => {
  const background = createBackground();
  const handled = background.command.emit('toggle-sidebar', { windowId: 1 });
  expect(background.calls).toEqual([['open', 1]]);
  await background.restore([]);
  await handled;
  expect(background.calls).toEqual([['open', 1]]);
});

test('Edge 未发送关闭事件时，页面连接断开清理状态，第一次快捷键即可打开', async () => {
  const background = createBackground();
  await background.restore([]);
  const port = { name: 'sidepanel-1', onDisconnect: createEvent() };
  background.connect.emit(port);
  expect(background.getStored()).toEqual([1]);
  port.onDisconnect.emit();
  expect(background.getStored()).toEqual([]);
  await background.command.emit('toggle-sidebar', { windowId: 1 });
  expect(background.calls).toEqual([['open', 1]]);
});

test('页面重连后旧端口断开不覆盖新状态，冷启动快捷键可以关闭仍打开的面板', async () => {
  const background = createBackground();
  const oldPort = { name: 'sidepanel-1', onDisconnect: createEvent() };
  const newPort = { name: 'sidepanel-1', onDisconnect: createEvent() };
  background.connect.emit(oldPort);
  background.connect.emit(newPort);
  oldPort.onDisconnect.emit();
  const handled = background.command.emit('toggle-sidebar', { windowId: 1 });
  await background.restore([1]);
  await handled;
  expect(background.calls).toEqual([['open', 1], ['close', 1]]);
});

test('原生关闭事件清除休眠前记录，首次快捷键即可打开，连续触发可切换', async () => {
  const background = createBackground();
  // 关闭事件唤醒后台，存储读取尚未完成。
  background.closed.emit({ windowId: 1 });
  await background.restore([1, 2]);
  expect(background.getStored()).toEqual([2]);
  await background.command.emit('toggle-sidebar', { windowId: 1 });
  expect(background.calls).toEqual([['open', 1]]);
  background.opened.emit({ windowId: 1 });
  await background.command.emit('toggle-sidebar', { windowId: 1 });
  expect(background.calls).toEqual([['open', 1], ['close', 1]]);
});

test('启动期间的打开事件不会被存储恢复覆盖，窗口状态相互独立', async () => {
  const background = createBackground();
  background.opened.emit({ windowId: 1 });
  await background.restore([2]);
  expect(background.getStored()).toEqual([1, 2]);
  await background.command.emit('toggle-sidebar', { windowId: 1 });
  expect(background.calls).toEqual([['close', 1]]);
  await background.command.emit('toggle-sidebar', { windowId: 3 });
  expect(background.calls).toEqual([['close', 1], ['open', 3]]);
});

test('冷启动且侧栏原本已打开时，快捷键恢复状态后关闭侧栏', async () => {
  const background = createBackground();
  const handled = background.command.emit('toggle-sidebar', { windowId: 1 });
  await background.restore([1]);
  await handled;
  expect(background.calls).toEqual([['open', 1], ['close', 1]]);
});
