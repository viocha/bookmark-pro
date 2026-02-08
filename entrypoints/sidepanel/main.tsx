import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@/assets/globals.css';

// 通知 background 侧栏已打开
chrome.windows.getCurrent().then((win) => {
  if (win.id != null) {
    chrome.runtime.sendMessage({ type: 'sidepanel-opened', windowId: win.id });

    // 侧栏关闭时（页面卸载前）通知 background
    window.addEventListener('beforeunload', () => {
      chrome.runtime.sendMessage({ type: 'sidepanel-closed', windowId: win.id });
    });
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
