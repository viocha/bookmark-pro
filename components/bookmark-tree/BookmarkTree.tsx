import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useBookmarkStore } from '@/hooks/useBookmarkStore';
import { useSettings } from '@/hooks/useSettings';
import { isProtectedNode, normalizeFolderChildren } from '@/lib/bookmark-api';
import { moveBookmark } from '@/lib/bookmark-api';
import {
  flattenTree,
  computeDropIndicator,
  type FlattenedNode,
  type DropIndicator,
  TREE_INDENT_PX,
  TREE_ICON_ANCHOR_OFFSET_PX,
} from '@/lib/tree-utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TreeNodeContent } from './TreeNodeContent';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragMoveEvent,
  DragOverlay,
  MeasuringStrategy,
  closestCenter,
  useDroppable,
  useDraggable,
  type CollisionDetection,
} from '@dnd-kit/core';

// TreeNode with dnd-kit draggable + droppable (no sortable transforms)
function DndTreeNode({
  item,
  isDragging,
  dropIndicator,
  flatIds,
  renamingId,
  renamingTitle,
  onRenameStart,
  onRenameCommit,
  onRenameCancel,
  onRenameTitleChange,
}: {
  item: FlattenedNode;
  isDragging: boolean;
  dropIndicator: DropIndicator | null;
  flatIds: string[];
  renamingId: string | null;
  renamingTitle: string;
  onRenameStart: (id: string, title: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onRenameTitleChange: (v: string) => void;
}) {
  const isProtected = isProtectedNode(item.node);

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
  } = useDraggable({
    id: item.id,
    disabled: isProtected || renamingId === item.id,
  });

  const { setNodeRef: setDropRef } = useDroppable({
    id: item.id,
    disabled: isProtected,
  });

  // Merge refs
  const setNodeRef = useCallback(
    (el: HTMLElement | null) => {
      setDragRef(el);
      setDropRef(el);
    },
    [setDragRef, setDropRef]
  );

  const isTarget = dropIndicator?.overId === item.id;
  const zone = isTarget ? dropIndicator!.zone : null;
  const lineDepth = isTarget ? dropIndicator!.depth : item.depth;

  return (
    <div className="relative" style={{ opacity: isDragging ? 0.35 : 1 }}>
      {/* Insertion line BEFORE */}
      {isTarget && zone === 'before' && (
        <div
          className="absolute top-0 left-0 right-0 h-0.5 bg-primary z-10 rounded-full"
          style={{ marginLeft: `${lineDepth * TREE_INDENT_PX + TREE_ICON_ANCHOR_OFFSET_PX}px` }}
        />
      )}
      {/* Folder highlight when dropping INSIDE */}
      <TreeNodeContent
        item={item}
        insideHighlight={isTarget && zone === 'inside'}
        listeners={listeners}
        attributes={attributes}
        setNodeRef={setNodeRef}
        flatIds={flatIds}
        renamingId={renamingId}
        renamingTitle={renamingTitle}
        onRenameStart={onRenameStart}
        onRenameCommit={onRenameCommit}
        onRenameCancel={onRenameCancel}
        onRenameTitleChange={onRenameTitleChange}
      />
      {/* Insertion line AFTER */}
      {isTarget && zone === 'after' && (
        <div
          className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary z-10 rounded-full"
          style={{ marginLeft: `${lineDepth * TREE_INDENT_PX + TREE_ICON_ANCHOR_OFFSET_PX}px` }}
        />
      )}
    </div>
  );
}

export function BookmarkTree() {
  const tree = useBookmarkStore(s => s.tree);
  const expandedIds = useBookmarkStore(s => s.expandedIds);
  const { moveNode, editNode } = useBookmarkStore.getState();
  const loadTree = useBookmarkStore((s) => s.loadTree);
  const saveTreeState = useSettings((s) => s.saveTreeState);
  const settingsScrollTop = useSettings((s) => s.scrollTop);
  const settingsLoaded = useSettings((s) => s.loaded);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingTitle, setRenamingTitle] = useState('');
  const scrollRestoredRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Track real cursor position in viewport coordinates.
  // dnd-kit's event.delta includes scroll compensation, making
  // `initialEvent.clientY + delta.y` diverge from the actual cursor
  // position when the ScrollArea scrolls during drag (e.g. auto-scroll).
  // Using a pointermove listener gives us the true viewport cursor position.
  const pointerRef = useRef({ x: 0, y: 0 });
  // Record drag start cursor X and active item depth for relative indent calculation
  const dragStartRef = useRef<{ x: number; depth: number }>({ x: 0, depth: 0 });
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('pointermove', handler, { passive: true });
    window.addEventListener('pointerdown', handler, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handler);
      window.removeEventListener('pointerdown', handler);
    };
  }, []);

  // Persist expandedIds whenever they change (debounced)
  useEffect(() => {
    if (!settingsLoaded) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const viewport = document.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
      saveTreeState(expandedIds, viewport?.scrollTop ?? 0);
    }, 300);
    return () => clearTimeout(saveTimerRef.current);
  }, [expandedIds, settingsLoaded, saveTreeState]);

  // Locate target: scroll to a specific node instead of restoring scroll position
  const locateTargetId = useBookmarkStore((s) => s.locateTargetId);

  // Restore scroll position once after tree loads (skip if locating a node)
  useEffect(() => {
    if (scrollRestoredRef.current || !settingsLoaded || tree.length === 0) return;
    scrollRestoredRef.current = true;
    if (locateTargetId) return; // skip restore — let locate effect handle scroll
    requestAnimationFrame(() => {
      const viewport = document.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
      if (viewport && settingsScrollTop > 0) {
        viewport.scrollTop = settingsScrollTop;
      }
    });
  }, [settingsLoaded, tree, settingsScrollTop, locateTargetId]);

  // Scroll to located node and flash highlight
  useEffect(() => {
    if (!locateTargetId || tree.length === 0) return;
    // Wait for tree DOM to render
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-node-id="${locateTargetId}"]`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        el.classList.add('bg-primary/15');
        setTimeout(() => el.classList.remove('bg-primary/15'), 1500);
      }
      useBookmarkStore.setState({ locateTargetId: null });
    }, 80);
    return () => clearTimeout(timer);
  }, [locateTargetId, tree]);

  // Save scroll position on scroll (debounced)
  useEffect(() => {
    const viewport = document.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (!viewport) return;
    let timer: ReturnType<typeof setTimeout>;
    const handleScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const store = useBookmarkStore.getState();
        saveTreeState(store.expandedIds, viewport.scrollTop);
      }, 500);
    };
    viewport.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      viewport.removeEventListener('scroll', handleScroll);
    };
  }, [saveTreeState]);

  const rootChildren = tree[0]?.children ?? [];

  const flatItems = useMemo(
    () => flattenTree(rootChildren, expandedIds),
    [rootChildren, expandedIds]
  );

  // Flat list of IDs for Shift+Click range selection
  const flatIds = useMemo(() => flatItems.map((item) => item.id), [flatItems]);

  const activeItem = useMemo(
    () => flatItems.find((item) => item.id === activeId) ?? null,
    [flatItems, activeId]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // Custom collision detection: exclude the active item so that adjacent-item
  // dragging works correctly (the active item's DOM rect hasn't moved since
  // we don't use sortable transforms).
  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      if (!activeId) return closestCenter(args);
      const filtered = {
        ...args,
        droppableContainers: args.droppableContainers.filter(
          (container) => String(container.id) !== activeId
        ),
      };
      return closestCenter(filtered);
    },
    [activeId]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = String(event.active.id);
    const item = flatItems.find((i) => i.id === id);
    if (!item || isProtectedNode(item.node)) return;
    dragStartRef.current = {
      x: pointerRef.current.x,
      depth: item?.depth ?? 0,
    };
    setActiveId(id);
  }, [flatItems]);

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      const { over } = event;
      if (!over || !activeId) {
        setDropIndicator(null);
        return;
      }

      const overId = String(over.id);
      if (overId === activeId) {
        setDropIndicator(null);
        return;
      }

      // Get the over element's rect directly from DOM to guarantee
      // viewport-relative coordinates, matching our pointer position.
      const overEl = document.querySelector<HTMLElement>(`[data-node-id="${overId}"]`);
      if (!overEl) {
        setDropIndicator(null);
        return;
      }
      const overRect = overEl.getBoundingClientRect();

      // Use real cursor position (viewport coordinates) from pointermove,
      // NOT initialEvent.clientY + delta.y which includes scroll compensation.
      const cursorY = pointerRef.current.y;
      const cursorX = pointerRef.current.x;

      const indicator = computeDropIndicator(
        flatItems,
        activeId,
        overId,
        { top: overRect.top, height: overRect.height },
        cursorY,
        cursorX,
        dragStartRef.current.x,
        dragStartRef.current.depth
      );
      setDropIndicator(indicator);
    },
    [flatItems, activeId]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      const currentIndicator = dropIndicator;

      setActiveId(null);
      setDropIndicator(null);

      if (!over || active.id === over.id) return;

      const activeIdStr = String(active.id);
      const activeNode = flatItems.find(item => item.id === activeIdStr)?.node;
      if (!activeNode || isProtectedNode(activeNode)) return;
      if (!currentIndicator) return;

      // When dropping inside a folder, normalize children and compute correct index
      if (currentIndicator.zone === 'inside') {
        const targetFolderId = currentIndicator.projection.parentId;
        // Cannot move into the root node
        if (targetFolderId === '0') return;
        const activeFlat = flatItems.find((i) => i.id === activeIdStr);
        const isActiveFolder = activeFlat?.isFolder ?? false;
        const { folderInsertPosition, bookmarkInsertPosition } = useSettings.getState();

        try {
          // Suppress auto-reload during batch bookmark operations
          useBookmarkStore.setState({ _suppressReload: true });

          // Normalize target folder children (folders first)
          await normalizeFolderChildren(targetFolderId);

          // Compute insert index based on settings
          const children = await chrome.bookmarks.getChildren(targetFolderId);
          const folders = children.filter((c) => !c.url);
          let index: number | undefined;
          if (isActiveFolder) {
            index = folderInsertPosition === 'top' ? 0 : folders.length;
          } else {
            if (bookmarkInsertPosition === 'top') {
              index = folders.length; // right after all folders
            }
            // else: undefined = append to end (bottom)
          }

          await moveBookmark(activeIdStr, { parentId: targetFolderId, index });
        } catch (err) {
          console.error('[Bookmark Pro] drag-into-folder error:', err);
        } finally {
          useBookmarkStore.setState({ _suppressReload: false });
          await loadTree();
        }
        return;
      }

      // "before" / "after" drop: move first, then normalize the target parent
      const targetParentId = currentIndicator.projection.parentId;
      // Cannot move into the root node
      if (targetParentId === '0') return;
      const activeFlat = flatItems.find((i) => i.id === activeIdStr);
      const sourceParentId = activeFlat?.parentId ?? null;

      try {
        // Suppress auto-reload during batch bookmark operations
        useBookmarkStore.setState({ _suppressReload: true });

        await moveBookmark(activeIdStr, currentIndicator.projection);

        // Normalize the target parent folder (folders before bookmarks)
        await normalizeFolderChildren(targetParentId);
        // If moved across folders, also normalize the source parent
        if (sourceParentId && sourceParentId !== targetParentId) {
          await normalizeFolderChildren(sourceParentId);
        }
      } catch (err) {
        console.error('[Bookmark Pro] post-drag normalize error:', err);
      } finally {
        useBookmarkStore.setState({ _suppressReload: false });
        await loadTree();
      }
    },
    [moveNode, dropIndicator, flatItems]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setDropIndicator(null);
    // dnd-kit 在 Esc 取消拖拽后会释放指针捕获，后续的 pointerup 仍会触发
    // click 事件并打开书签。在此注册一次性 capture 阶段拦截器来阻止该 click。
    window.addEventListener(
      'click',
      (e) => { e.preventDefault(); e.stopPropagation(); },
      { capture: true, once: true }
    );
  }, []);

  const handleRenameStart = useCallback((id: string, title: string) => {
    setRenamingId(id);
    setRenamingTitle(title);
  }, []);

  const handleRenameCommit = useCallback(async () => {
    if (!renamingId) return;
    const trimmed = renamingTitle.trim();
    if (trimmed) {
      await editNode(renamingId, { title: trimmed });
    }
    setRenamingId(null);
    setRenamingTitle('');
  }, [renamingId, renamingTitle, editNode]);

  const handleRenameCancel = useCallback(() => {
    setRenamingId(null);
    setRenamingTitle('');
  }, []);

  return (
    <div className="relative h-full">
      <ScrollArea className="h-full">
        <div className="py-0.5">
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
          measuring={{
            droppable: {
              strategy: MeasuringStrategy.Always,
            },
          }}
        >
          {flatItems.map((item) => (
            <DndTreeNode
              key={item.id}
              item={item}
              isDragging={item.id === activeId}
              dropIndicator={activeId ? dropIndicator : null}
              flatIds={flatIds}
              renamingId={renamingId}
              renamingTitle={renamingTitle}
              onRenameStart={handleRenameStart}
              onRenameCommit={handleRenameCommit}
              onRenameCancel={handleRenameCancel}
              onRenameTitleChange={setRenamingTitle}
            />
          ))}

          <DragOverlay dropAnimation={null}>
            {activeItem ? (
              <div
                className="bg-background border border-border rounded shadow-md"
                style={{ marginLeft: `${activeItem.depth * TREE_INDENT_PX}px` }}
              >
                <TreeNodeContent item={activeItem} isOverlay />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </ScrollArea>
  </div>
  );
}
