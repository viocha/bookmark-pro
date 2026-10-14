import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
	 autoIcons: {
    baseIconPath: './assets/icon.svg',
  },
  manifest: {
    name: 'Bookmark Pro',
    minimum_chrome_version: '142',
    description: '强大的书签管理器 - 侧栏树形视图、拖拽排序、全局搜索、快速收藏',
    permissions: ['bookmarks', 'sidePanel', 'activeTab', 'tabs', 'favicon', 'storage', 'contextMenus'],
    externally_connectable: {
      ids: ['*'],
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
    action: {
      default_title: 'Open Bookmark Pro',
      default_icon: {
        16: 'action-icons/16.png',
        32: 'action-icons/32.png',
        48: 'action-icons/48.png',
        128: 'action-icons/128.png',
      },
    },
    commands: {
			_execute_action: {
        suggested_key: { default: 'Alt+F' },
        description: '收藏当前页面到书签',
      },
      'toggle-sidebar': {
        suggested_key: {
          default: 'Alt+Shift+F',
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
