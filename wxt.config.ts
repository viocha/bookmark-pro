import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Bookmark Pro',
    description: '强大的书签管理器 - 侧栏树形视图、拖拽排序、全局搜索、快速收藏',
    permissions: ['bookmarks', 'sidePanel', 'activeTab', 'tabs', 'favicon', 'storage', 'contextMenus'],
    side_panel: {
      default_path: 'sidepanel.html',
    },
    action: {
      default_title: 'Open Bookmark Pro',
    },
    commands: {
			_execute_action: {
        suggested_key: { default: 'Alt+B' },
        description: '收藏当前页面到书签',
      },
      'toggle-sidebar': {
        suggested_key: {
          default: 'Alt+Shift+B',
        },
        description: '切换书签管理侧栏',
      },
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': __dirname,
      },
    },
  }),
});
