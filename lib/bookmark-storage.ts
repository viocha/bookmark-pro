// Shared storage keys & helpers for popup ↔ background communication

const LAST_FOLDER_KEY = 'bookmark-pro-last-folder';
const RECENT_FOLDERS_KEY = 'bookmark-pro-recent-folders';
const MAX_RECENT_FOLDERS = 8;

export interface RecentFolder {
  id: string;
  title: string;
  path: string; // e.g. "书签栏 / 工作"
}

/** Get last-used folder ID (default '1' = 书签栏) */
export async function getLastFolderId(): Promise<string> {
  const result = await chrome.storage.local.get(LAST_FOLDER_KEY);
  return result[LAST_FOLDER_KEY] || '1';
}

/** Save last-used folder ID */
export async function setLastFolderId(folderId: string): Promise<void> {
  await chrome.storage.local.set({ [LAST_FOLDER_KEY]: folderId });
}

/** Get recent folders list */
export async function getRecentFolders(): Promise<RecentFolder[]> {
  const result = await chrome.storage.local.get(RECENT_FOLDERS_KEY);
  return result[RECENT_FOLDERS_KEY] || [];
}

/** Add a folder to recent list (dedup, move to top, trim) */
export async function addRecentFolder(folder: RecentFolder): Promise<void> {
  const existing = await getRecentFolders();
  const filtered = existing.filter((f) => f.id !== folder.id);
  const updated = [folder, ...filtered].slice(0, MAX_RECENT_FOLDERS);
  await chrome.storage.local.set({ [RECENT_FOLDERS_KEY]: updated });
}

/** Build a readable path for a folder ID */
export async function buildFolderPath(folderId: string): Promise<string> {
  const ROOT_NAMES: Record<string, string> = {
    '1': '书签栏',
    '2': '其他书签',
    '3': '移动设备书签',
  };
  const parts: string[] = [];
  let currentId: string | undefined = folderId;
  while (currentId && currentId !== '0') {
    try {
      const [node] = await chrome.bookmarks.get(currentId);
      if (!node) break;
      parts.unshift(node.title || ROOT_NAMES[node.id] || '');
      currentId = node.parentId;
    } catch {
      break;
    }
  }
  return parts.join(' / ');
}

/** Check if a folder still exists */
export async function folderExists(folderId: string): Promise<boolean> {
  try {
    const [node] = await chrome.bookmarks.get(folderId);
    return !!node && !node.url; // must be a folder
  } catch {
    return false;
  }
}

/**
 * Derive recent bookmark folders from the user's actual recent bookmarks.
 * Scans the most recent bookmarks and returns their unique parent folders.
 * This works immediately after install without any prior plugin usage.
 */
export async function getRecentBookmarkFolders(): Promise<RecentFolder[]> {
  try {
    const recentItems = await chrome.bookmarks.getRecent(100);
    const seen = new Set<string>();
    const folders: RecentFolder[] = [];

    for (const item of recentItems) {
      if (!item.parentId || seen.has(item.parentId)) continue;
      seen.add(item.parentId);

      try {
        const [parent] = await chrome.bookmarks.get(item.parentId);
        if (!parent || parent.url) continue; // skip if not a folder

        const ROOT_NAMES: Record<string, string> = {
          '1': '书签栏',
          '2': '其他书签',
          '3': '移动设备书签',
        };
        const title = parent.title || ROOT_NAMES[parent.id] || '';
        const path = await buildFolderPath(parent.id);
        folders.push({ id: parent.id, title, path });
      } catch {
        continue;
      }
    }

    return folders;
  } catch {
    return [];
  }
}
