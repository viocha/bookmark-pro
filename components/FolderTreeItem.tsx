import { useEffect, useCallback, useRef } from 'react';
import { isProtectedNode } from '@/lib/bookmark-api';
import type { FolderNode } from '@/lib/folder-tree';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Input } from '@/components/ui/input';
import { ChevronRight, FolderOpen, Folder, FolderPlus, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function FolderTreeItem({
  node,
  depth,
  selectedId,
  expandedIds,
  disabledIds,
  editingId,
  editingTitle,
  contextMenuId,
  onSelect,
  onToggle,
  onCreateFolder,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onEditingTitleChange,
  onDelete,
  onContextMenuChange,
}: {
  node: FolderNode;
  depth: number;
  selectedId: string | null;
  expandedIds: Set<string>;
  disabledIds: Set<string>;
  editingId: string | null;
  editingTitle: string;
  contextMenuId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onCreateFolder: (parentId: string) => void;
  onStartRename: (id: string, title: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onEditingTitleChange: (v: string) => void;
  onDelete: (id: string) => void;
  onContextMenuChange: (id: string | null) => void;
}) {
  const expanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;
  const isDisabled = disabledIds.has(node.id);
  const hasChildren = node.children.length > 0;
  const isEditing = editingId === node.id;
  const isProtected = isProtectedNode(node.id);
  const isContextActive = contextMenuId === node.id;
  const inputRef = useRef<HTMLInputElement>(null);
  const hasFocusedRef = useRef(false);
  const cancelingRef = useRef(false);

  useEffect(() => {
    if (isEditing) {
      hasFocusedRef.current = false;
      cancelingRef.current = false;
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
        hasFocusedRef.current = true;
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isEditing]);

  const handleBlur = useCallback(() => {
    if (hasFocusedRef.current && !cancelingRef.current) {
      onCommitRename();
    }
  }, [onCommitRename]);

  const rowContent = (
    <div
      data-folder-id={node.id}
      tabIndex={isDisabled ? undefined : 0}
      className={cn(
        'flex items-center h-7 pr-2 cursor-pointer select-none text-xs gap-0.5 min-w-0 outline-none',
        'hover:bg-accent/60',
        isSelected && 'bg-primary/15 hover:bg-primary/20',
        isContextActive && !isSelected && 'bg-accent/60',
        isDisabled && 'opacity-40 cursor-not-allowed'
      )}
      style={{ paddingLeft: `${depth * 14 + 4}px` }}
      onClick={() => {
        if (isDisabled || isEditing) return;
        onSelect(node.id);
        if (hasChildren) onToggle(node.id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'F2' && isSelected && !isEditing && !isProtected) {
          e.preventDefault();
          onStartRename(node.id, node.title);
        }
      }}
    >
      <span
        className="flex items-center justify-center size-4 shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          if (hasChildren && !isEditing) onToggle(node.id);
        }}
      >
        {hasChildren ? (
          <ChevronRight
            className={cn(
              'size-3 text-muted-foreground transition-transform duration-200',
              expanded && 'rotate-90'
            )}
          />
        ) : null}
      </span>
      <span className="flex items-center justify-center size-4 shrink-0">
        {expanded ? (
          <FolderOpen className="size-3.5 text-yellow-600" />
        ) : (
          <Folder className="size-3.5 text-yellow-600" />
        )}
      </span>
      {isEditing ? (
        <Input
          ref={inputRef}
          value={editingTitle}
          onChange={(e) => onEditingTitleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.stopPropagation();
              onCommitRename();
            }
            if (e.key === 'Escape') {
              e.stopPropagation();
              e.preventDefault();
              cancelingRef.current = true;
              onCancelRename();
            }
          }}
          onBlur={handleBlur}
          className="h-5 text-xs px-1 py-0 ml-0.5 flex-1 min-w-0"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <>
          <span className="truncate min-w-0 ml-0.5">{node.title}</span>
          {node.childCount > 0 && (
            <span className="text-[10px] text-muted-foreground ml-auto shrink-0 pr-1">{node.childCount}</span>
          )}
        </>
      )}
    </div>
  );

  return (
    <>
      <ContextMenu onOpenChange={(open) => onContextMenuChange(open ? node.id : null)}>
        <ContextMenuTrigger asChild>
          {rowContent}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-40">
          <ContextMenuItem onSelect={() => onCreateFolder(node.id)} className="text-xs h-7">
            <FolderPlus className="size-3.5 mr-2" />
            新建文件夹
          </ContextMenuItem>
          {!isProtected && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => onStartRename(node.id, node.title)} className="text-xs h-7">
                <Pencil className="size-3.5 mr-2" />
                重命名
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => onDelete(node.id)} className="text-xs h-7 text-destructive">
                <Trash2 className="size-3.5 mr-2" />
                删除
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
      {expanded &&
        node.children.map((child) => (
          <FolderTreeItem
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedId={selectedId}
            expandedIds={expandedIds}
            disabledIds={disabledIds}
            editingId={editingId}
            editingTitle={editingTitle}
            contextMenuId={contextMenuId}
            onSelect={onSelect}
            onToggle={onToggle}
            onCreateFolder={onCreateFolder}
            onStartRename={onStartRename}
            onCommitRename={onCommitRename}
            onCancelRename={onCancelRename}
            onEditingTitleChange={onEditingTitleChange}
            onDelete={onDelete}
            onContextMenuChange={onContextMenuChange}
          />
        ))}
    </>
  );
}
