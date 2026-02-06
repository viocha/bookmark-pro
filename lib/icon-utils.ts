// Draw bookmark star icon on OffscreenCanvas and return ImageData
// filled = bookmarked (solid blue star), unfilled = not bookmarked (gray outline star)

const SIZES = [16, 32, 48, 128] as const;

function drawStar(
  ctx: OffscreenCanvasRenderingContext2D,
  size: number,
  filled: boolean
) {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.42;
  const innerR = outerR * 0.4;
  const spikes = 5;

  ctx.clearRect(0, 0, size, size);

  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / 2) * -1 + (Math.PI / spikes) * i;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();

  if (filled) {
    ctx.fillStyle = '#2563eb'; // blue-600
    ctx.fill();
  } else {
    ctx.strokeStyle = '#6b7280'; // gray-500
    ctx.lineWidth = Math.max(1, size / 16);
    ctx.stroke();
  }
}

export async function getIconImageData(filled: boolean): Promise<Record<number, ImageData>> {
  const result: Record<number, ImageData> = {};
  for (const size of SIZES) {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d')!;
    drawStar(ctx, size, filled);
    result[size] = ctx.getImageData(0, 0, size, size);
  }
  return result;
}
