import { getBookmarkInsertIndex, moveBookmark, updateBookmark } from './bookmark-api';
import type { InsertPosition } from '@/hooks/useSettings';

/** 保存 Popup 编辑；切换文件夹或明确选择位置时应用顶部、底部排序。 */
export async function savePopupBookmark({
  id,
  title,
  url,
  parentId,
  position,
  reposition,
}: {
  id: string;
  title: string;
  url: string;
  parentId: string;
  position: InsertPosition;
  reposition: boolean;
}) {
  const [existing] = await chrome.bookmarks.get(id).catch(() => []);
  if (!existing) return;

  const changes: { title?: string; url?: string } = {};
  if (title !== existing.title) changes.title = title;
  if (url !== existing.url) changes.url = url;
  if (Object.keys(changes).length > 0) await updateBookmark(id, changes);

  if (parentId !== existing.parentId || reposition) {
    const index = await getBookmarkInsertIndex(parentId, position);
    await moveBookmark(id, { parentId, index });
  }
}
