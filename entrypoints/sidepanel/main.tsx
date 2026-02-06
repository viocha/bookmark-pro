import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@/assets/globals.css';

// 建立与 background 的 port 连接，用于追踪侧栏打开状态
const port = chrome.runtime.connect({ name: 'sidepanel' });
chrome.windows.getCurrent().then((win) => {
  if (win.id != null) {
    port.postMessage({ windowId: win.id });
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
