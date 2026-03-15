import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from 'next-themes';
import App from './App';
import '@/assets/globals.css';

// 建立与 background 的长连接，用于可靠监听侧栏关闭（原生 x 按钮）
chrome.windows.getCurrent().then((win) => {
  if (win.id != null) {
    chrome.runtime.connect({ name: `sidepanel-${win.id}` });
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
