import { mkdir, writeFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Star } from 'lucide-react';
import sharp from 'sharp';

// 直接从已安装的 Lucide 生成资源，缩小 viewBox 留白并保留描边空间。
const svg = renderToStaticMarkup(createElement(Star, {
  width: 128,
  height: 128,
  viewBox: '1 1 22 22',
  color: '#f59e0b',
  fill: '#f59e0b',
}));
await mkdir('assets', { recursive: true });
await writeFile('assets/icon.svg', `${svg}\n`);

// 浏览器在后台查询前直接使用空心图标，避免新标签页先显示成已收藏。
const actionSvg = renderToStaticMarkup(createElement(Star, {
  width: 128,
  height: 128,
  viewBox: '1 1 22 22',
  color: '#6b7280',
  fill: 'none',
}));
await mkdir('public/action-icons', { recursive: true });
await Promise.all([16, 32, 48, 128].map(size =>
  sharp(Buffer.from(actionSvg)).resize(size).png().toFile(`public/action-icons/${size}.png`),
));
