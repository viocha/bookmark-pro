import { create } from 'zustand';
import { toast } from 'sonner';
import {
  getBookmarkTree,
  createBookmark,
  updateBookmark,
  removeBookmark,
  removeBookmarkTree,
  moveBookmark,
  searchBookmarks,
  isFolder,
  isProtectedNode,
} from '@/lib/bookmark-api';
import { useSettings } from '@/hooks/useSettings';

interface BookmarkState {
  tree: chrome.bookmarks.BookmarkTreeNode[];
  expandedIds: Set<string>;
  searchQuery: string;
  searchResults: chrome.bookmarks.BookmarkTreeNode[] | null;
  isSearching: boolean;
  editingNode: chrome.bookmarks.BookmarkTreeNode | null;
  editDialogOpen: boolean;
  createFolderParentId: string | null;
  createFolderDialogOpen: boolean;

  // Add bookmark dialog state
  addBookmarkDialogOpen: boolean;
  addBookmarkNode: chrome.bookmarks.BookmarkTreeNode | null; // the newly created bookmark
  addBookmarkTitle: string;
  addBookmarkUrl: string;

  // Move dialog state
  moveDialogOpen: boolean;
  moveTargetNode: chrome.bookmarks.BookmarkTreeNode | null;
  moveTargetNodes: chrome.bookmarks.BookmarkTreeNode[]; // batch move

  // Multi-select state
  multiSelectMode: boolean;
  selectedIds: Set<string>;
  lastSelectedId: string | null;

  // Batch delete confirm

  // Actions
  loadTree: () => Promise<void>;
  restoreExpandedIds: (ids: string[]) => void;
  toggleExpand: (id: string) => void;
  expandNode: (id: string) => void;
  collapseNode: (id: string) => void;
  expandAllUnder: (node: chrome.bookmarks.BookmarkTreeNode) => void;
  collapseAllUnder: (node: chrome.bookmarks.BookmarkTreeNode) => void;
  sortFoldersFirst: () => Promise<void>;

  // Search
  setSearchQuery: (query: string) => void;
  performSearch: (query: string) => Promise<void>;
  clearSearch: () => void;
  locateNode: (nodeId: string) => Promise<void>;

  // CRUD
  addBookmark: (parentId: string, title: string, url: string, position?: 'top' | 'bottom') => Promise<chrome.bookmarks.BookmarkTreeNode>;
  addFolder: (parentId: string, title: string, position?: 'top' | 'bottom') => Promise<void>;
  editNode: (id: string, changes: { title?: string; url?: string }) => Promise<void>;
  deleteNode: (node: chrome.bookmarks.BookmarkTreeNode) => Promise<void>;
  moveNode: (id: string, destination: { parentId?: string; index?: number }) => Promise<void>;
  undoDeleteBookmark: (node: chrome.bookmarks.BookmarkTreeNode) => Promise<void>;

  // Dialog state
  openEditDialog: (node: chrome.bookmarks.BookmarkTreeNode) => void;
  closeEditDialog: () => void;
  openCreateFolderDialog: (parentId: string) => void;
  closeCreateFolderDialog: () => void;
  openAddBookmarkDialog: (node: chrome.bookmarks.BookmarkTreeNode, title: string, url: string) => void;
  closeAddBookmarkDialog: () => void;
  undoDeleteFolder: (title: string, parentId: string, children: chrome.bookmarks.BookmarkTreeNode[], index?: number) => Promise<void>;

  // Move dialog
  openMoveDialog: (node: chrome.bookmarks.BookmarkTreeNode) => void;
  closeMoveDialog: () => void;

  // Multi-select
  enterMultiSelectMode: () => void;
  exitMultiSelectMode: () => void;
  toggleSelect: (id: string) => void;
  rangeSelect: (id: string, flatIds: string[]) => void;
  clearSelection: () => void;
  openBatchMoveDialog: () => void;
  confirmBatchDelete: () => Promise<void>;
}

export const useBookmarkStore = create<BookmarkState>((set, get) => ({
  tree: [],
  expandedIds: new Set<string>(['1']),
  searchQuery: '',
  searchResults: null,
  isSearching: false,
  editingNode: null,
  editDialogOpen: false,
  createFolderParentId: null,
  createFolderDialogOpen: false,
  addBookmarkDialogOpen: false,
  addBookmarkNode: null,
  addBookmarkTitle: '',
  addBookmarkUrl: '',
  moveDialogOpen: false,
  moveTargetNode: null,
  moveTargetNodes: [],
  multiSelectMode: false,
  selectedIds: new Set<string>(),
  lastSelectedId: null,

  loadTree: async () => {
    const tree = await getBookmarkTree();
    set({ tree });
  },

  restoreExpandedIds: (ids: string[]) => {
    set({ expandedIds: new Set(ids) });
  },

  toggleExpand: (id: string) => {
    const { expandedIds } = get();
    const next = new Set(expandedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    set({ expandedIds: next });
  },

  expandNode: (id: string) => {
    const { expandedIds } = get();
    const next = new Set(expandedIds);
    next.add(id);
    set({ expandedIds: next });
  },

  collapseNode: (id: string) => {
    const { expandedIds } = get();
    const next = new Set(expandedIds);
    next.delete(id);
    set({ expandedIds: next });
  },

  expandAllUnder: (node) => {
    const { expandedIds } = get();
    const next = new Set(expandedIds);
    const collectFolderIds = (n: chrome.bookmarks.BookmarkTreeNode) => {
      if (!n.url) {
        next.add(n.id);
        n.children?.forEach(collectFolderIds);
      }
    };
    collectFolderIds(node);
    set({ expandedIds: next });
  },

  collapseAllUnder: (node) => {
    const { expandedIds } = get();
    const next = new Set(expandedIds);
    const removeFolderIds = (n: chrome.bookmarks.BookmarkTreeNode) => {
      if (!n.url) {
        next.delete(n.id);
        n.children?.forEach(removeFolderIds);
      }
    };
    removeFolderIds(node);
    set({ expandedIds: next });
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
    if (!query.trim()) {
      set({ searchResults: null, isSearching: false });
    }
  },

  performSearch: async (query: string) => {
    if (!query.trim()) {
      set({ searchResults: null, isSearching: false });
      return;
    }
    set({ isSearching: true });
    const results = await searchBookmarks(query);
    set({ searchResults: results, isSearching: false });
  },

  clearSearch: () => {
    set({ searchQuery: '', searchResults: null, isSearching: false });
  },

  locateNode: async (nodeId: string) => {
    // Expand all ancestor folders, then clear search to reveal in tree
    const { expandedIds } = get();
    const next = new Set(expandedIds);
    let currentId: string | undefined = nodeId;
    // Walk up the tree to find all ancestor IDs
    while (currentId) {
      try {
        const nodes = await chrome.bookmarks.get(currentId);
        const node = nodes[0];
        if (!node || !node.parentId) break;
        next.add(node.parentId);
        currentId = node.parentId;
      } catch {
        break;
      }
    }
    set({ expandedIds: next, searchQuery: '', searchResults: null, isSearching: false });
    // Scroll to the node after a short delay to let the tree re-render
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-node-id="${nodeId}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      // Flash highlight
      el?.classList.add('bg-primary/15');
      setTimeout(() => el?.classList.remove('bg-primary/15'), 1500);
    });
  },

  addBookmark: async (parentId, title, url, position) => {
    // Check if URL already exists globally
    const globalExisting = await chrome.bookmarks.search({ url });
    if (globalExisting.length > 0) {
      return globalExisting[0];
    }
    // Sort existing children: folders before bookmarks
    const children = await chrome.bookmarks.getChildren(parentId);
    const folders = children.filter(c => !c.url);
    const bookmarks = children.filter(c => !!c.url);
    const sorted = [...folders, ...bookmarks];
    let current = [...children];
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].id !== current[i]?.id) {
        await moveBookmark(sorted[i].id, { parentId, index: i });
        const updated = await chrome.bookmarks.getChildren(parentId);
        current = updated;
      }
    }
    // Determine insert index
    let index: number | undefined;
    if (position === 'top') {
      index = folders.length; // right after folders
    }
    // else: undefined = append to end (bottom)
    const node = await createBookmark(parentId, title, url, index);
    await get().loadTree();
    return node;
  },

  addFolder: async (parentId, title, position) => {
    // First sort existing children: folders before bookmarks
    const children = await chrome.bookmarks.getChildren(parentId);
    const folders = children.filter(c => !c.url);
    const bookmarks = children.filter(c => !!c.url);
    const sorted = [...folders, ...bookmarks];
    // Move items to their correct positions if needed
    let current = [...children];
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].id !== current[i]?.id) {
        await moveBookmark(sorted[i].id, { parentId, index: i });
        const updated = await chrome.bookmarks.getChildren(parentId);
        current = updated;
      }
    }
    // Determine insert index based on position
    const insertIndex = position === 'top' ? 0 : folders.length;
    await createBookmark(parentId, title, undefined, insertIndex);
    await get().loadTree();
  },

  sortFoldersFirst: async () => {
    // Recursively sort all folders so folders come before bookmarks
    const sortChildren = async (node: chrome.bookmarks.BookmarkTreeNode) => {
      if (!node.children || node.children.length === 0) return;
      const folders = node.children.filter(c => !c.url);
      const bookmarks = node.children.filter(c => !!c.url);
      const sorted = [...folders, ...bookmarks];
      // Move items to their correct positions
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].id !== node.children[i]?.id) {
          await moveBookmark(sorted[i].id, { parentId: node.id, index: i });
          // Re-fetch children after move to get updated order
          const updated = await chrome.bookmarks.getChildren(node.id);
          node.children = updated as chrome.bookmarks.BookmarkTreeNode[];
        }
      }
      // Recurse into subfolders
      for (const child of folders) {
        // Re-fetch the full subtree for this folder
        const subtree = await chrome.bookmarks.getSubTree(child.id);
        if (subtree[0]) await sortChildren(subtree[0]);
      }
    };
    const tree = await getBookmarkTree();
    for (const root of tree) {
      if (root.children) {
        for (const topLevel of root.children) {
          const subtree = await chrome.bookmarks.getSubTree(topLevel.id);
          if (subtree[0]) await sortChildren(subtree[0]);
        }
      }
    }
    await get().loadTree();
    toast('已完成排序', { description: '所有文件夹已移至书签前方', duration: 3000 });
  },

  editNode: async (id, changes) => {
    await updateBookmark(id, changes);
    await get().loadTree();
  },

  deleteNode: async (node) => {
    if (isFolder(node)) {
      await removeBookmarkTree(node.id);
    } else {
      await removeBookmark(node.id);
    }
    await get().loadTree();
  },

  moveNode: async (id, destination) => {
    await moveBookmark(id, destination);
    await get().loadTree();
  },

  undoDeleteBookmark: async (node) => {
    // Re-create the bookmark at its original location
    await createBookmark(
      node.parentId ?? '1',
      node.title,
      node.url,
      node.index
    );
    await get().loadTree();
  },

  openEditDialog: (node) => {
    set({ editingNode: node, editDialogOpen: true });
  },

  closeEditDialog: () => {
    set({ editingNode: null, editDialogOpen: false });
  },

  openCreateFolderDialog: (parentId) => {
    set({ createFolderParentId: parentId, createFolderDialogOpen: true });
  },

  closeCreateFolderDialog: () => {
    set({ createFolderParentId: null, createFolderDialogOpen: false });
  },

  openAddBookmarkDialog: (node, title, url) => {
    set({
      addBookmarkDialogOpen: true,
      addBookmarkNode: node,
      addBookmarkTitle: title,
      addBookmarkUrl: url,
    });
  },

  closeAddBookmarkDialog: () => {
    set({
      addBookmarkDialogOpen: false,
      addBookmarkNode: null,
      addBookmarkTitle: '',
      addBookmarkUrl: '',
    });
  },

  undoDeleteFolder: async (title, parentId, children, index) => {
    // Re-create folder
    const folder = await createBookmark(parentId, title, undefined, index);
    // Re-create children recursively
    const recreateChildren = async (parentId: string, nodes: chrome.bookmarks.BookmarkTreeNode[]) => {
      for (const child of nodes) {
        if (child.url) {
          await createBookmark(parentId, child.title, child.url);
        } else {
          const newFolder = await createBookmark(parentId, child.title);
          if (child.children && child.children.length > 0) {
            await recreateChildren(newFolder.id, child.children);
          }
        }
      }
    };
    await recreateChildren(folder.id, children);
    await get().loadTree();
  },

  openMoveDialog: (node) => {
    set({ moveTargetNode: node, moveTargetNodes: [node], moveDialogOpen: true });
  },

  closeMoveDialog: () => {
    set({ moveTargetNode: null, moveTargetNodes: [], moveDialogOpen: false });
  },

  // Multi-select
  enterMultiSelectMode: () => {
    set({ multiSelectMode: true });
  },

  exitMultiSelectMode: () => {
    set({ multiSelectMode: false, selectedIds: new Set<string>(), lastSelectedId: null });
  },

  toggleSelect: (id: string) => {
    // Prevent selecting protected/root nodes
    if (isProtectedNode(id)) return;
    const { selectedIds } = get();
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    set({ selectedIds: next, lastSelectedId: id });
  },

  rangeSelect: (id: string, flatIds: string[]) => {
    const { lastSelectedId, selectedIds } = get();
    if (!lastSelectedId) {
      if (isProtectedNode(id)) return;
      set({ selectedIds: new Set([id]), lastSelectedId: id });
      return;
    }
    const startIdx = flatIds.indexOf(lastSelectedId);
    const endIdx = flatIds.indexOf(id);
    if (startIdx === -1 || endIdx === -1) {
      if (isProtectedNode(id)) return;
      set({ selectedIds: new Set([id]), lastSelectedId: id });
      return;
    }
    const lo = Math.min(startIdx, endIdx);
    const hi = Math.max(startIdx, endIdx);
    const next = new Set(selectedIds);
    for (let i = lo; i <= hi; i++) {
      if (!isProtectedNode(flatIds[i])) {
        next.add(flatIds[i]);
      }
    }
    set({ selectedIds: next, lastSelectedId: id });
  },

  clearSelection: () => {
    set({ selectedIds: new Set<string>(), lastSelectedId: null });
  },

  openBatchMoveDialog: () => {
    const { selectedIds, tree } = get();
    if (selectedIds.size === 0) return;
    // Collect selected nodes from tree
    const nodes: chrome.bookmarks.BookmarkTreeNode[] = [];
    const findNodes = (n: chrome.bookmarks.BookmarkTreeNode) => {
      if (selectedIds.has(n.id)) nodes.push(n);
      n.children?.forEach(findNodes);
    };
    tree.forEach(findNodes);
    set({ moveTargetNodes: nodes, moveTargetNode: nodes[0] ?? null, moveDialogOpen: true });
  },

  confirmBatchDelete: async () => {
    const { selectedIds, tree } = get();
    if (selectedIds.size === 0) return;
    // Collect full node snapshots (deep clone with children for folders)
    const nodes: chrome.bookmarks.BookmarkTreeNode[] = [];
    const deepClone = (n: chrome.bookmarks.BookmarkTreeNode): chrome.bookmarks.BookmarkTreeNode => ({
      ...n,
      children: n.children?.map(deepClone),
    });
    const findNodes = (n: chrome.bookmarks.BookmarkTreeNode) => {
      if (selectedIds.has(n.id)) {
        nodes.push(deepClone(n));
        return; // don't recurse into selected nodes
      }
      n.children?.forEach(findNodes);
    };
    tree.forEach(findNodes);

    // Save snapshots before deletion for undo
    const savedSnapshots = [...nodes];
    let count = 0;
    for (const n of nodes) {
      if (isProtectedNode(n.id)) continue;
      if (isFolder(n)) {
        await removeBookmarkTree(n.id);
      } else {
        await removeBookmark(n.id);
      }
      count++;
    }
    await get().loadTree();
    set({
      multiSelectMode: false,
      selectedIds: new Set<string>(),
      lastSelectedId: null,
    });
    toast(`已删除 ${count} 个项目`, {
      action: {
        label: '撤销',
        onClick: async () => {
          // Recreate all deleted items in reverse order (to preserve indices)
          for (const snap of savedSnapshots.reverse()) {
            if (isProtectedNode(snap.id)) continue;
            if (isFolder(snap)) {
              await get().undoDeleteFolder(
                snap.title,
                snap.parentId ?? '1',
                snap.children ?? [],
                snap.index,
              );
            } else {
              await createBookmark(
                snap.parentId ?? '1',
                snap.title,
                snap.url,
                snap.index,
              );
            }
          }
          await get().loadTree();
          toast(`已恢复 ${count} 个项目`, { duration: 2000 });
        },
      },
      duration: 5000,
    });
  },
}));

// Listen for bookmark changes from external sources
export function setupBookmarkListeners() {
  const reload = () => useBookmarkStore.getState().loadTree();
  chrome.bookmarks.onCreated.addListener(reload);
  chrome.bookmarks.onRemoved.addListener(reload);
  chrome.bookmarks.onChanged.addListener(reload);
  chrome.bookmarks.onMoved.addListener(reload);
  if (chrome.bookmarks.onChildrenReordered) {
    chrome.bookmarks.onChildrenReordered.addListener(reload);
  }
}
