import { useEffect, useId, useState } from 'react';
import { ArrowDownUp, ExternalLink } from 'lucide-react';
import { useBookmarkStore } from '@/hooks/useBookmarkStore';
import { useSettings, type InsertPosition } from '@/hooks/useSettings';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { toast } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Switch } from '@/components/ui/switch';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SHORTCUT_COMMANDS = [
  { name: '_execute_action', label: '收藏当前页面' },
  { name: 'toggle-sidebar', label: '切换书签管理侧栏' },
];

function PositionToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: InsertPosition;
  onChange: (pos: InsertPosition) => void;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel id={id}>{label}</FieldLabel>
      <ToggleGroup
        className="w-full"
        aria-labelledby={id}
        variant="outline"
        size="sm"
        spacing={0}
        value={[value]}
        onValueChange={(values) => {
          const next = values[0];
          if (next === 'top' || next === 'bottom') onChange(next);
        }}
      >
        <ToggleGroupItem className="flex-1" value="top">顶部</ToggleGroupItem>
        <ToggleGroupItem className="flex-1" value="bottom">底部</ToggleGroupItem>
      </ToggleGroup>
    </Field>
  );
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [isSorting, setIsSorting] = useState(false);
  const [commands, setCommands] = useState<chrome.commands.Command[] | null>(null);
  const [isOpeningShortcuts, setIsOpeningShortcuts] = useState(false);
  const titleLinesId = useId();
  const showUrlId = useId();
  const shortcutsTitleId = useId();
  const {
    folderInsertPosition,
    bookmarkInsertPosition,
    setFolderInsertPosition,
    setBookmarkInsertPosition,
    bookmarkTitleLines,
    showBookmarkUrl,
    setBookmarkTitleLines,
    setShowBookmarkUrl,
  } = useSettings();

  useEffect(() => {
    if (!open) return;
    let active = true;
    let request = 0;
    const refresh = async () => {
      const current = ++request;
      try {
        const configured = await chrome.commands.getAll();
        if (active && current === request) setCommands(configured);
      } catch {
        if (active && current === request) toast.add({ title: '读取快捷键失败', type: 'error' });
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    void refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription className="sr-only">
            设置书签显示、默认插入位置和快捷键。
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel id={titleLinesId}>书签名称显示行数</FieldLabel>
            <ToggleGroup
              className="w-full"
              aria-labelledby={titleLinesId}
              variant="outline"
              size="sm"
              spacing={0}
              value={[String(bookmarkTitleLines)]}
              onValueChange={(values) => {
                const lines = Number(values[0]);
                if (lines === 1 || lines === 2 || lines === 3) setBookmarkTitleLines(lines);
              }}
            >
              {[1, 2, 3].map(lines => (
                <ToggleGroupItem key={lines} className="flex-1" value={String(lines)}>
                  {lines} 行
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
          <Field orientation="horizontal">
            <FieldLabel htmlFor={showUrlId}>在名称下方显示网址</FieldLabel>
            <Switch id={showUrlId} checked={showBookmarkUrl} onCheckedChange={setShowBookmarkUrl} />
          </Field>
          <PositionToggle
            label="新建文件夹默认位置"
            value={folderInsertPosition}
            onChange={setFolderInsertPosition}
          />
          <PositionToggle
            label="添加书签默认位置"
            value={bookmarkInsertPosition}
            onChange={setBookmarkInsertPosition}
          />
          <Field>
            <Button
              variant="outline"
              disabled={isSorting}
              onClick={async () => {
                if (isSorting) return;
                setIsSorting(true);
                try {
                  await useBookmarkStore.getState().sortFoldersFirst();
                } finally {
                  setIsSorting(false);
                }
              }}
            >
              {isSorting ? <Spinner data-icon="inline-start" /> : <ArrowDownUp data-icon="inline-start" />}
              规范化排序
            </Button>
            <FieldDescription>
              将所有文件夹置于书签前，同类项目保持现有顺序。
            </FieldDescription>
          </Field>
          <Card size="sm" role="group" aria-labelledby={shortcutsTitleId}>
            <CardHeader className="items-center">
              <CardTitle id={shortcutsTitleId}>快捷键</CardTitle>
              <CardAction className="row-span-1 self-center">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="打开浏览器快捷键设置"
                  disabled={isOpeningShortcuts}
                  onClick={async () => {
                    if (isOpeningShortcuts) return;
                    setIsOpeningShortcuts(true);
                    try {
                      const scheme = /Edg\//.test(navigator.userAgent) ? 'edge' : 'chrome';
                      await chrome.tabs.create({ url: `${scheme}://extensions/shortcuts` });
                    } catch {
                      toast.add({ title: '打开快捷键设置失败', type: 'error' });
                    } finally {
                      setIsOpeningShortcuts(false);
                    }
                  }}
                >
                  设置
                  <ExternalLink data-icon="inline-end" />
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <FieldGroup className="gap-2">
                {SHORTCUT_COMMANDS.map(({ name, label }) => {
                  const shortcut = commands?.find(command => command.name === name)?.shortcut;
                  return (
                    <Field key={name} orientation="horizontal" className="min-h-6 justify-between">
                      <span className="text-muted-foreground">{label}</span>
                      {commands !== null && (shortcut ? (
                        <KbdGroup aria-label={shortcut}>
                          {shortcut.split('+').map((key, index) => <Kbd key={index}>{key}</Kbd>)}
                        </KbdGroup>
                      ) : <span className="text-sm text-muted-foreground">未设置</span>)}
                    </Field>
                  );
                })}
              </FieldGroup>
            </CardContent>
          </Card>
        </FieldGroup>
      </DialogContent>
    </Dialog>
  );
}
