export interface FlattenedNode {
  id: string;
  parentId: string | null | undefined;
  depth: number;
  index: number;
  node: chrome.bookmarks.BookmarkTreeNode;
  isFolder: boolean;
  childCount: number;
  isExpanded: boolean;
}

/**
 * Flatten a bookmark tree into a flat array, respecting expanded state.
 * Only expanded folders have their children included.
 */
export function flattenTree(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  expandedIds: Set<string>,
  parentId: string | null = null,
  depth: number = 0
): FlattenedNode[] {
  const result: FlattenedNode[] = [];

  nodes.forEach((node, index) => {
    const isFolder = !node.url;
    const isExpanded = isFolder && expandedIds.has(node.id);
    result.push({
      id: node.id,
      parentId: parentId ?? node.parentId,
      depth,
      index,
      node,
      isFolder,
      childCount: node.children?.length ?? 0,
      isExpanded,
    });

    if (isFolder && expandedIds.has(node.id) && node.children) {
      result.push(...flattenTree(node.children, expandedIds, node.id, depth + 1));
    }
  });

  return result;
}

export type DropZone = 'before' | 'inside' | 'after';

export interface DropProjection {
  parentId: string;
  index: number;
}

export interface DropIndicator {
  overId: string;
  zone: DropZone;
  /** Visual depth for the insertion line (may differ from overItem.depth when outdenting) */
  depth: number;
  projection: DropProjection;
}

export const TREE_INDENT_PX = 14;
// Anchor line/indent calculations to the icon column LEFT edge:
// indent spacer + chevron left margin (~2px) + chevron column (~16px) + inter-item gap (~2px).
export const TREE_ICON_ANCHOR_OFFSET_PX = 20;
/** Horizontal drag distance (px) required to change one indent level during drag */
export const DRAG_INDENT_SENSITIVITY_PX = 40;

/**
 * Determine drop indicator by analyzing cursor position (Y for zone, X for indent/outdent).
 *
 * Y-axis (zone detection):
 * - Folders: top 25% = before, middle 50% = inside, bottom 25% = after
 * - Bookmarks: top 50% = before, bottom 50% = after
 *
 * X-axis (outdent detection):
 * When zone is 'after' and the over item has depth > 0, if the cursor's X position
 * is shifted left, we "outdent" — making the result be an 'after' of the parent (or grandparent).
 * This enables dragging a child out of its folder by pulling left.
 */
export function computeDropIndicator(
  flatItems: FlattenedNode[],
  activeId: string,
  overId: string,
  overRect: { top: number; height: number },
  cursorY: number,
  cursorX: number,
  dragStartX: number,
  dragStartDepth: number
): DropIndicator | null {
  const overIndex = flatItems.findIndex((item) => item.id === overId);
  const activeIndex = flatItems.findIndex((item) => item.id === activeId);
  if (overIndex === -1 || activeIndex === -1) return null;

  const overItem = flatItems[overIndex];
  const activeItem = flatItems[activeIndex];

  // --- Y-axis zone ---
  const relY = cursorY - overRect.top;
  const ratio = Math.max(0, Math.min(1, relY / overRect.height));

  let zone: DropZone;
  if (overItem.isFolder) {
    if (overItem.isExpanded) {
      // Expanded folder: top 25% = before (sibling), bottom 75% = inside (first child)
      // No 'after' zone — children are visible below, 'after' would cause visual jump
      zone = ratio < 0.25 ? 'before' : 'inside';
    } else {
      // Collapsed folder: top 25% = before, middle 50% = inside, bottom 25% = after
      if (ratio < 0.25) zone = 'before';
      else if (ratio > 0.75) zone = 'after';
      else zone = 'inside';
    }
  } else {
    zone = ratio < 0.5 ? 'before' : 'after';
  }

  // --- Compute projection ---
  if (zone === 'inside' && overItem.isFolder) {
    return {
      overId,
      zone: 'inside',
      depth: overItem.depth + 1,
      projection: { parentId: overItem.id, index: 0 },
    };
  }

  if (zone === 'before') {
    const parentId = overItem.parentId ?? '0';
    const idx = computeInsertIndex(overItem.index, activeItem, parentId);
    return {
      overId,
      zone: 'before',
      depth: overItem.depth,
      projection: { parentId, index: idx },
    };
  }

  // zone === 'after'
  // Check if the over item is the last visible node in its subtree.
  // If so, we can outdent based on cursor X position.
  let targetItem = overItem;
  let targetDepth = overItem.depth;

  if (overItem.depth > 0) {
    // Find the "effective bottom depth": the last visible descendant-or-self.
    // After the overItem in flatItems, skip all deeper items (its visible subtree).
    let lastInSubtreeIndex = overIndex;
    for (let i = overIndex + 1; i < flatItems.length; i++) {
      if (flatItems[i].depth > overItem.depth) {
        lastInSubtreeIndex = i;
      } else {
        break;
      }
    }
    // If overItem IS the last in its subtree block or `after` applies to the bottom
    const lastItem = flatItems[lastInSubtreeIndex];
    const lastDepth = lastItem.depth;

    // Calculate the "desired depth" from relative horizontal movement.
    // Use the distance moved from the drag start position, not the absolute cursor position.
    // This way, moving left by one indent unit = outdent by one level, regardless of start position.
    const deltaX = cursorX - dragStartX;
    const desiredDepth = Math.max(
      0,
      dragStartDepth + Math.round(deltaX / DRAG_INDENT_SENSITIVITY_PX)
    );

    // We can only outdent if the cursor's desired depth is less than the item's depth.
    // But we cannot go shallower than the depth of the next visible sibling below.
    // Skip the active (dragged) item — it will be moved away, so it shouldn't constrain outdent.
    let nextNonActiveIndex = lastInSubtreeIndex + 1;
    while (nextNonActiveIndex < flatItems.length && flatItems[nextNonActiveIndex].id === activeId) {
      nextNonActiveIndex++;
    }
    const nextItemDepth = nextNonActiveIndex < flatItems.length
      ? flatItems[nextNonActiveIndex].depth
      : 0;

    // Only allow outdent when over item is the "bottom" of the subtree visible
    // i.e., there's no next item OR next item is shallower
    if (overIndex === lastInSubtreeIndex || lastDepth === overItem.depth) {
      // Clamp desired depth between nextItemDepth and overItem.depth
      const clampedDepth = Math.max(nextItemDepth, Math.min(overItem.depth, desiredDepth));
      if (clampedDepth < overItem.depth) {
        // Outdent: find the ancestor at clampedDepth
        const ancestor = findAncestorAtDepth(flatItems, overItem, clampedDepth);
        if (ancestor) {
          targetItem = ancestor;
          targetDepth = clampedDepth;
        }
      }
    }
  }

  const parentId = targetItem.parentId ?? '0';
  const idx = computeInsertIndexAfter(targetItem.index, activeItem, parentId);
  return {
    overId,
    zone: 'after',
    depth: targetDepth,
    projection: { parentId, index: idx },
  };
}

function computeInsertIndex(overItemIndex: number, activeItem: FlattenedNode, parentId: string): number {
  // Placing before overItem.
  // Chrome's move API uses "index in original array" semantics:
  // when same parent and index > currentIndex, effective = index - 1.
  // So we always pass overItemIndex — Chrome handles the adjustment.
  return overItemIndex;
}

function computeInsertIndexAfter(overItemIndex: number, activeItem: FlattenedNode, parentId: string): number {
  // Placing after overItem.
  // Always pass overItemIndex + 1 — Chrome handles same-parent adjustment.
  return overItemIndex + 1;
}

/**
 * Walk up the flat list to find an ancestor of `item` at the desired depth.
 */
function findAncestorAtDepth(
  flatItems: FlattenedNode[],
  item: FlattenedNode,
  targetDepth: number
): FlattenedNode | null {
  // Walk backward from the item to find its ancestor at targetDepth
  const idx = flatItems.findIndex((n) => n.id === item.id);
  for (let i = idx - 1; i >= 0; i--) {
    const candidate = flatItems[i];
    if (candidate.depth === targetDepth && candidate.depth < item.depth) {
      return candidate;
    }
    if (candidate.depth < targetDepth) {
      break; // went too shallow, shouldn't happen
    }
  }
  return null;
}
