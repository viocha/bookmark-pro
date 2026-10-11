import { expect, test } from 'bun:test';
import { useSettings } from './useSettings';

test('显示设置持久化，保存树状态和重新加载均保留名称行数与网址开关', async () => {
  const originalChrome = globalThis.chrome;
  const originalState = useSettings.getState();
  let saved;
  globalThis.chrome = { storage: { local: {
    get: async () => ({ 'bookmark-pro-settings': saved }),
    set: async (data) => { saved = data['bookmark-pro-settings']; },
  } } };
  try {
    useSettings.setState(useSettings.getInitialState());
    await useSettings.getState().load();
    expect(useSettings.getState().bookmarkTitleLines).toBe(1);
    expect(useSettings.getState().showBookmarkUrl).toBe(false);
    useSettings.getState().setBookmarkTitleLines(3);
    useSettings.getState().setShowBookmarkUrl(true);
    useSettings.getState().saveTreeState(new Set(['1', '2']), 80);
    useSettings.setState(useSettings.getInitialState());
    await useSettings.getState().load();
    expect(useSettings.getState().bookmarkTitleLines).toBe(3);
    expect(useSettings.getState().showBookmarkUrl).toBe(true);
    expect(useSettings.getState().expandedIds).toEqual(['1', '2']);
    expect(useSettings.getState().scrollTop).toBe(80);
  } finally {
    globalThis.chrome = originalChrome;
    useSettings.setState(originalState);
  }
});
