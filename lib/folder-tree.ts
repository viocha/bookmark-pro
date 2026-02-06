// Shared folder tree types and utilities used by MoveDialog and Popup

import { isFolder, isProtectedNode } from '@/lib/bookmark-api';

export interface FolderNode {
  id: string;
  title: string;
  children: FolderNode[];
  parentId?: string;
  childCount: number;
}

export function buildFolderTree(node: chrome.bookmarks.BookmarkTreeNode): FolderNode[] {
  if (!node.children) return [];
  return node.children
    .filter((c) => isFolder(c))
    .map((c) => ({
      id: c.id,
      title: c.title || (isProtectedNode(c.id) ? ({ '1': '书签栏', '2': '其他书签', '3': '移动设备书签' }[c.id] ?? c.id) : '(无标题)'),
      children: buildFolderTree(c),
      parentId: c.parentId,
      childCount: c.children?.length ?? 0,
    }));
}

export function getAncestorIds(folders: FolderNode[], targetId: string): Set<string> {
  const ids = new Set<string>();
  const find = (nodes: FolderNode[], path: string[]): boolean => {
    for (const node of nodes) {
      if (node.id === targetId) {
        path.forEach((id) => ids.add(id));
        return true;
      }
      if (find(node.children, [...path, node.id])) return true;
    }
    return false;
  };
  find(folders, []);
  return ids;
}

export function getDescendantIds(nodes: FolderNode[]): Set<string> {
  const ids = new Set<string>();
  const collect = (ns: FolderNode[]) => {
    for (const n of ns) {
      ids.add(n.id);
      collect(n.children);
    }
  };
  collect(nodes);
  return ids;
}

export function findFolderNode(nodes: FolderNode[], id: string): FolderNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findFolderNode(n.children, id);
    if (found) return found;
  }
  return null;
}

/** Filter folder tree by search query — keep matching nodes and their ancestors */
export function filterFolderTree(nodes: FolderNode[], query: string): FolderNode[] {
  const q = query.toLowerCase();
  const filter = (ns: FolderNode[]): FolderNode[] => {
    const result: FolderNode[] = [];
    for (const n of ns) {
      const filteredChildren = filter(n.children);
      if (n.title.toLowerCase().includes(q) || filteredChildren.length > 0) {
        result.push({ ...n, children: filteredChildren });
      }
    }
    return result;
  };
  return filter(nodes);
}

/** Collect all node IDs in a folder tree */
export function collectAllIds(nodes: FolderNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (ns: FolderNode[]) => {
    for (const n of ns) {
      ids.add(n.id);
      walk(n.children);
    }
  };
  walk(nodes);
  return ids;
}
