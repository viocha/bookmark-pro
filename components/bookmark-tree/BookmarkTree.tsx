import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useBookmarkStore } from '@/hooks/useBookmarkStore';
import { useSettings } from '@/hooks/useSettings';
import { isProtectedNode } from '@/lib/bookmark-api';
import { flattenTree, computeDropIndicator, FlattenedNode, DropIndicator } from '@/lib/tree-utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TreeNodeContent } from './TreeNodeContent';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragMoveEvent,
  DragOverlay,
  MeasuringStrategy,
  closestCenter,
  useDroppable,
  useDraggable,
  CollisionDetection,
} from '@dnd-kit/core';

interface RenderItem {
  type: 'node' | 'empty';
  item?: FlattenedNode;
  depth?: number;
  key: string;
}

// TreeNode with dnd-kit draggable + droppable (no sortable transforms)
function DndTreeNode({
  item,
  isDragging,
  dropIndicator,
  flatIds,
}: {
  item: FlattenedNode;
  isDragging: boolean;
  dropIndicator: DropIndicator | null;
  flatIds: string[];
}) {
  const isProtected = isProtectedNode(item.id);

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
  } = useDraggable({
    id: item.id,
    disabled: isProtected,
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
          style={{ marginLeft: `${lineDepth * 14 + 8}px` }}
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
      />
      {/* Insertion line AFTER */}
      {isTarget && zone === 'after' && (
        <div
          className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary z-10 rounded-full"
          style={{ marginLeft: `${lineDepth * 14 + 8}px` }}
        />
      )}
    </div>
  );
}

export function BookmarkTree() {
  const { tree, expandedIds, moveNode } = useBookmarkStore();
  const saveTreeState = useSettings((s) => s.saveTreeState);
  const settingsScrollTop = useSettings((s) => s.scrollTop);
  const settingsLoaded = useSettings((s) => s.loaded);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const scrollRestoredRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

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

  // Build render list with empty folder indicators
  const renderItems = useMemo(() => {
    const result: RenderItem[] = [];
    for (let i = 0; i < flatItems.length; i++) {
      const item = flatItems[i];
      result.push({ type: 'node', item, key: item.id });
      if (item.isFolder && expandedIds.has(item.id) && item.childCount === 0) {
        result.push({ type: 'empty', depth: item.depth + 1, key: `empty-${item.id}` });
      }
    }
    return result;
  }, [flatItems, expandedIds]);

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
    if (isProtectedNode(id)) return;
    setActiveId(id);
  }, []);

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      const { over, activatorEvent } = event;
      if (!over || !activeId) {
        setDropIndicator(null);
        return;
      }

      const overId = String(over.id);
      if (overId === activeId) {
        setDropIndicator(null);
        return;
      }

      const overRect = over.rect;
      if (!overRect) {
        setDropIndicator(null);
        return;
      }

      const initialEvent = activatorEvent as PointerEvent;
      const cursorY = initialEvent.clientY + (event.delta?.y ?? 0);
      const cursorX = initialEvent.clientX + (event.delta?.x ?? 0);

      const indicator = computeDropIndicator(
        flatItems,
        activeId,
        overId,
        { top: overRect.top, height: overRect.height, left: overRect.left },
        cursorY,
        cursorX
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
      if (isProtectedNode(activeIdStr)) return;
      if (!currentIndicator) return;

      // When dropping inside a folder, normalize children and compute correct index
      if (currentIndicator.zone === 'inside') {
        const targetFolderId = currentIndicator.projection.parentId;
        const activeFlat = flatItems.find((i) => i.id === activeIdStr);
        const isActiveFolder = activeFlat?.isFolder ?? false;
        const { folderInsertPosition, bookmarkInsertPosition } = useSettings.getState();

        try {
          // Get and normalize target folder children (folders first)
          const children = await chrome.bookmarks.getChildren(targetFolderId);
          const folders = children.filter((c) => !c.url);
          const bookmarks = children.filter((c) => !!c.url);
          const sorted = [...folders, ...bookmarks];
          let current = [...children];
          for (let i = 0; i < sorted.length; i++) {
            if (sorted[i].id !== current[i]?.id) {
              await chrome.bookmarks.move(sorted[i].id, { parentId: targetFolderId, index: i });
              const updated = await chrome.bookmarks.getChildren(targetFolderId);
              current = updated;
            }
          }

          // Compute insert index based on settings
          let index: number | undefined;
          if (isActiveFolder) {
            index = folderInsertPosition === 'top' ? 0 : folders.length;
          } else {
            if (bookmarkInsertPosition === 'top') {
              index = folders.length; // right after all folders
            }
            // else: undefined = append to end (bottom)
          }

          await moveNode(activeIdStr, { parentId: targetFolderId, index });
        } catch (err) {
          console.error('[Bookmark Pro] drag-into-folder error:', err);
        }
        return;
      }

      moveNode(activeIdStr, currentIndicator.projection);
    },
    [moveNode, dropIndicator, flatItems]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setDropIndicator(null);
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
          {renderItems.map((ri) => {
            if (ri.type === 'empty') {
              return (
                <div
                  key={ri.key}
                  className="text-[11px] text-muted-foreground h-6 flex items-center"
                  style={{ paddingLeft: `${(ri.depth ?? 1) * 14 + 24}px` }}
                >
                  (空)
                </div>
              );
            }
            return (
              <DndTreeNode
                key={ri.key}
                item={ri.item!}
                isDragging={ri.item!.id === activeId}
                dropIndicator={activeId ? dropIndicator : null}
                flatIds={flatIds}
              />
            );
          })}

          <DragOverlay dropAnimation={null}>
            {activeItem ? (
              <div className="bg-background border border-border rounded shadow-md opacity-90">
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
