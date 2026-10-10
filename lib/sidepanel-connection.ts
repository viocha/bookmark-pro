/** 后台休眠断开连接时，存活的侧栏页面通过断开事件重新建立状态连接。 */
export function trackSidePanelConnection(windowId: number) {
  let disposed = false;
  let port: chrome.runtime.Port;
  function connect() {
    port = chrome.runtime.connect({ name: `sidepanel-${windowId}` });
    port.onDisconnect.addListener(() => {
      // 读取 lastError，避免后台重启时产生未处理的连接错误。
      void chrome.runtime.lastError;
      if (!disposed) connect();
    });
  }
  function dispose() {
    disposed = true;
    port.disconnect();
  }
  connect();
  window.addEventListener('pagehide', dispose, { once: true });
}
