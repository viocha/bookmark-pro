// Shared storage keys & helpers for popup ↔ background communication

const LAST_FOLDER_KEY = 'bookmark-pro-last-folder';
const RECENT_FOLDERS_KEY = 'bookmark-pro-recent-folders';
export const MAX_FOLDER_OPTIONS = 50;

export interface RecentFolder {
  id: string;
  title: string;
  path: string; // e.g. "书签栏 / 工作"
}

type LastFolderStorage = {
  [LAST_FOLDER_KEY]?: string;
};

type RecentFoldersStorage = {
  [RECENT_FOLDERS_KEY]?: RecentFolder[];
};

/** Get last-used folder ID (default '1' = 书签栏) */
export async function getLastFolderId(): Promise<string> {
  const result = await chrome.storage.local.get<LastFolderStorage>(LAST_FOLDER_KEY);
  return result[LAST_FOLDER_KEY] ?? '1';
}

/** Save last-used folder ID */
export async function setLastFolderId(folderId: string): Promise<void> {
  await chrome.storage.local.set({ [LAST_FOLDER_KEY]: folderId });
}

/** Get recent folders list */
export async function getRecentFolders(): Promise<RecentFolder[]> {
  const result = await chrome.storage.local.get<RecentFoldersStorage>(RECENT_FOLDERS_KEY);
  return result[RECENT_FOLDERS_KEY] ?? [];
}

/** Add a folder to recent list (dedup, move to top, trim) */
export async function addRecentFolder(folder: RecentFolder): Promise<void> {
  const existing = await getRecentFolders();
  const filtered = existing.filter((f) => f.id !== folder.id);
  const updated = [folder, ...filtered].slice(0, MAX_FOLDER_OPTIONS);
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
      const nodes: chrome.bookmarks.BookmarkTreeNode[] = await chrome.bookmarks.get(currentId);
      const node = nodes[0];
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

export async function getRecentBookmarkFolders(): Promise<RecentFolder[]> {
  try {
    const recentItems = await chrome.bookmarks.getRecent(100);
    const seen = new Set<string>();
    const folders: RecentFolder[] = [];

    const ROOT_NAMES: Record<string, string> = {
      '1': '书签栏',
      '2': '其他书签',
      '3': '移动设备书签',
    };

    // Also fetch the entire tree to find recently created/modified folders
    const tree = await chrome.bookmarks.getTree();
    const allFolders: chrome.bookmarks.BookmarkTreeNode[] = [];
    
    function traverse(nodes: chrome.bookmarks.BookmarkTreeNode[]) {
      for (const node of nodes) {
        if (!node.url && node.id !== '0') {
          allFolders.push(node);
        }
        if (node.children) {
          traverse(node.children);
        }
      }
    }
    traverse(tree);
    
    // Most recently created folders
    const recentCreatedFolders = [...allFolders]
      .sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0))
      .slice(0, 15);

    // Combine recent items' parent IDs and recently created folders
    interface FolderCandidate {
      id: string;
      time: number;
    }
    const candidates: FolderCandidate[] = [];

    for (const item of recentItems) {
      if (item.parentId) {
        candidates.push({ id: item.parentId, time: item.dateAdded || 0 });
      }
    }

    for (const folder of recentCreatedFolders) {
      candidates.push({ id: folder.id, time: folder.dateAdded || 0 });
    }

    // Sort combined list by time descending
    candidates.sort((a, b) => b.time - a.time);

    for (const { id } of candidates) {
      if (folders.length >= MAX_FOLDER_OPTIONS) break;
      if (seen.has(id)) continue;
      seen.add(id);

      try {
        const [parent] = await chrome.bookmarks.get(id);
        if (!parent || parent.url) continue; // skip if not a folder

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
