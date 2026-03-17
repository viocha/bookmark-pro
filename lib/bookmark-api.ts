// Wrapper around Chrome Bookmarks API

export async function getBookmarkTree(): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  return chrome.bookmarks.getTree();
}

export async function createBookmark(
  parentId: string,
  title: string,
  url?: string,
  index?: number
): Promise<chrome.bookmarks.BookmarkTreeNode> {
  return chrome.bookmarks.create({ parentId, title, url, index });
}

export async function updateBookmark(
  id: string,
  changes: { title?: string; url?: string }
): Promise<chrome.bookmarks.BookmarkTreeNode> {
  return chrome.bookmarks.update(id, changes);
}

export async function moveBookmark(
  id: string,
  destination: { parentId?: string; index?: number }
): Promise<chrome.bookmarks.BookmarkTreeNode> {
  return chrome.bookmarks.move(id, destination);
}

export async function removeBookmark(id: string): Promise<void> {
  return chrome.bookmarks.remove(id);
}

export async function removeBookmarkTree(id: string): Promise<void> {
  return chrome.bookmarks.removeTree(id);
}

export async function searchBookmarks(
  query: string
): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  return chrome.bookmarks.search(query);
}

export function isFolder(node: chrome.bookmarks.BookmarkTreeNode): boolean {
  return !node.url;
}

// Root node IDs that cannot be modified
const PROTECTED_IDS = new Set(['0', '1', '2', '3']);

export function isProtectedNode(id: string): boolean {
  return PROTECTED_IDS.has(id);
}

// Get all bookmark URLs in a folder (recursively)
export function getAllUrls(node: chrome.bookmarks.BookmarkTreeNode): string[] {
  const urls: string[] = [];
  if (node.url) {
    urls.push(node.url);
  }
  if (node.children) {
    for (const child of node.children) {
      urls.push(...getAllUrls(child));
    }
  }
  return urls;
}

/**
 * Normalize a folder's children so that all sub-folders come before bookmarks.
 * Preserves relative order within each group.
 * @returns true if the order was actually changed, false if already correct.
 */
export async function normalizeFolderChildren(parentId: string): Promise<boolean> {
  // Root node ("0") cannot be modified by Chrome API
  if (parentId === '0') return false;
  const children = await chrome.bookmarks.getChildren(parentId);
  const folders = children.filter((c) => !c.url);
  const bookmarks = children.filter((c) => !!c.url);
  const sorted = [...folders, ...bookmarks];
  let current = [...children];
  let changed = false;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].id !== current[i]?.id) {
      await chrome.bookmarks.move(sorted[i].id, { parentId, index: i });
      current = await chrome.bookmarks.getChildren(parentId);
      changed = true;
    }
  }
  return changed;
}

// Get the path of a bookmark node (e.g. "书签栏 / 工作 / 开发")
export async function getBookmarkPath(nodeId: string): Promise<string> {
  const parts: string[] = [];
  let currentId: string | undefined = nodeId;
  while (currentId) {
    const nodes: chrome.bookmarks.BookmarkTreeNode[] = await chrome.bookmarks.get(currentId);
    const node: chrome.bookmarks.BookmarkTreeNode | undefined = nodes[0];
    if (!node || PROTECTED_IDS.has(node.id) && node.id === '0') break;
    if (node.title) parts.unshift(node.title);
    else if (PROTECTED_IDS.has(node.id)) {
      // Give root folders readable names
      const names: Record<string, string> = { '1': '书签栏', '2': '其他书签', '3': '移动设备书签' };
      parts.unshift(names[node.id] ?? '');
    }
    currentId = node.parentId;
  }
  return parts.join(' / ');
}
