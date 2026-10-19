/** 从内存书签树构建路径索引，结果行无需逐级查询父文件夹。 */
export function buildBookmarkFolderPaths(tree: chrome.bookmarks.BookmarkTreeNode[]) {
  const paths = new Map<string, string>();
  const rootNames: Record<string, string> = { '1': '书签栏', '2': '其他书签', '3': '移动设备书签' };
  function visit(nodes: chrome.bookmarks.BookmarkTreeNode[], parentPath: string) {
    for (const node of nodes) {
      if (node.url) continue;
      const title = node.id === '0' ? '' : node.title || rootNames[node.id] || '(无标题)';
      const path = [parentPath, title].filter(Boolean).join(' / ');
      paths.set(node.id, path);
      visit(node.children ?? [], path);
    }
  }
  visit(tree, '');
  return paths;
}

export const SEARCH_PAGE_SIZE = 60;
