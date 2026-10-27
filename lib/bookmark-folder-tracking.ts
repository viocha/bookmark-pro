import { setLastFolderId } from './bookmark-storage';

/** 跟随所有来源的书签保存位置，按浏览器事件顺序持久化。 */
export function registerBookmarkFolderTracking(api = chrome) {
  let pending = Promise.resolve();
  const enqueue = (update: () => Promise<void>) => {
    pending = pending.then(update).catch(error => {
      console.error('[Bookmark Pro] 更新最近收藏位置失败:', error);
    });
    return pending;
  };

  api.bookmarks.onCreated.addListener((_id, node) => {
    const parentId = node.parentId;
    if (!node.url || !parentId || parentId === '0') return;
    return enqueue(() => setLastFolderId(parentId, api.storage.local));
  });

  api.bookmarks.onMoved.addListener((id, move) => {
    if (move.parentId === move.oldParentId || move.parentId === '0') return;
    return enqueue(async () => {
      const [node] = await api.bookmarks.get(id).catch(() => []);
      // 移动文件夹或已被删除的条目不代表保存了书签。
      if (node?.url) await setLastFolderId(move.parentId, api.storage.local);
    });
  });
}
