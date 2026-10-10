import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from 'next-themes';
import App from './App';
import '@/assets/globals.css';
import { TooltipProvider } from '@/components/ui/tooltip';
import { trackSidePanelConnection } from '@/lib/sidepanel-connection';

chrome.windows.getCurrent().then(({ id }) => {
  if (id != null) trackSidePanelConnection(id);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <TooltipProvider delay={500}>
        <App />
      </TooltipProvider>
    </ThemeProvider>
  </React.StrictMode>
);
