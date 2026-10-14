import starSvg from '@/assets/icon.svg?raw';

const SIZES = [16, 32, 48, 128] as const;

/** 与扩展静态图标共用 Lucide Star 路径，只改变填充与颜色来表达收藏状态。 */
export async function getIconImageData(filled: boolean): Promise<Record<number, ImageData>> {
  const pathData = starSvg.match(/<path[^>]*\sd="([^"]+)"/)![1];
  const path = new Path2D(pathData);
  const result: Record<number, ImageData> = {};
  for (const size of SIZES) {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(size / 22, size / 22);
    ctx.translate(-1, -1);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = filled ? '#2563eb' : '#6b7280';
    if (filled) {
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill(path);
    }
    ctx.stroke(path);
    result[size] = ctx.getImageData(0, 0, size, size);
  }
  return result;
}
