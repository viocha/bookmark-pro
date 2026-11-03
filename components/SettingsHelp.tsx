import { Kbd } from '@/components/ui/kbd';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function SettingsHelp() {
  const modifier = /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl';
  const sections = [
    {
      title: '打开与搜索',
      items: [
        { action: <><Kbd>{modifier}</Kbd> + 点击书签</>, effect: '在后台新标签页打开' },
        { action: <><Kbd>{modifier}</Kbd> + <Kbd>Shift</Kbd> + 点击书签</>, effect: '在新标签页打开并切换过去' },
        { action: '鼠标中键点击书签', effect: '在后台新标签页打开' },
        { action: <><Kbd>Shift</Kbd> + 点击书签</>, effect: '在新窗口打开' },
        { action: <><Kbd>{modifier}</Kbd> + <Kbd>F</Kbd></>, effect: '搜索书签和文件夹' },
      ],
    },
    {
      title: '多选与文件夹',
      items: [
        { action: <><Kbd>Shift</Kbd> + 点击条目</>, effect: '在多选模式下连续选择一段条目' },
        { action: '点击折叠箭头', effect: '只展开或折叠，不改变选中项' },
        { action: <Kbd>F2</Kbd>, effect: '在移动面板重命名已选文件夹' },
      ],
    },
    {
      title: '拖拽整理',
      items: [
        { action: '拖到文件夹中部', effect: '移入该文件夹' },
        { action: '拖到条目上、下边缘', effect: '调整排列顺序' },
        { action: '拖到条目下方并向左移动', effect: '按插入线减少缩进层级' },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {sections.map(section => (
        <Card key={section.title} size="sm" role="group" aria-label={section.title}>
          <CardHeader>
            <CardTitle role="heading" aria-level={3}>{section.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3">
              {section.items.map((item, index) => (
                <div key={index} className="grid grid-cols-2 items-start gap-3 text-[13px]">
                  <dt className="min-w-0 leading-6">{item.action}</dt>
                  <dd className="min-w-0 leading-6 text-muted-foreground">{item.effect}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
