import { expect, test } from 'bun:test';
import { trackSidePanelConnection } from '../lib/sidepanel-connection';

test('后台连接断开后按事件重连，页面退出时断开且不重连', () => {
  const originalChrome = globalThis.chrome;
  const originalWindow = globalThis.window;
  const ports = [];
  let pagehide;
  globalThis.chrome = { runtime: {
    connect: ({ name }) => {
      let disconnected;
      const port = {
        name,
        onDisconnect: { addListener(listener) { disconnected = listener; } },
        disconnect() { disconnected(); },
      };
      ports.push(port);
      return port;
    },
  } };
  globalThis.window = { addEventListener(event, callback) {
    if (event === 'pagehide') pagehide = callback;
  } };
  try {
    trackSidePanelConnection(1);
    expect(ports.map(port => port.name)).toEqual(['sidepanel-1']);
    ports[0].disconnect();
    expect(ports.map(port => port.name)).toEqual(['sidepanel-1', 'sidepanel-1']);
    pagehide();
    expect(ports).toHaveLength(2);
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.window = originalWindow;
  }
});
