import { Layer, LayerGroup } from '../types';

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * 16진수 색상 코드를 RGBA 객체로 변환
 */
export function hexToRgba(hex: string): RGBA {
  if (!hex || hex === 'transparent') {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('') + 'ff';
  } else if (cleanHex.length === 6) {
    cleanHex += 'ff';
  }

  const num = parseInt(cleanHex, 16);
  if (isNaN(num)) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  return {
    r: (num >> 24) & 255,
    g: (num >> 16) & 255,
    b: (num >> 8) & 255,
    a: (num & 255) / 255,
  };
}

/**
 * RGBA 값을 Hex(#RRGGBB 또는 투명시 "")로 변환
 */
export function rgbaToHex(r: number, g: number, b: number, a: number = 1): string {
  if (a < 0.05) return '';
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  if (a >= 0.99) {
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(a * 255)}`;
}

/**
 * 두 색상 간의 유클리드 거리 (RGB 공간)
 */
export function colorDistance(c1: RGBA, c2: RGBA): number {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  // 가중치 적용 인지 유클리드 거리 (Redmean metric)
  const rmean = (c1.r + c2.r) / 2;
  return Math.sqrt((((512 + rmean) * dr * dr) >> 8) + 4 * dg * dg + (((767 - rmean) * db * db) >> 8));
}

/**
 * Bresenham 직선 알고리즘
 */
export function getLinePoints(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  let curX = x0;
  let curY = y0;

  while (true) {
    points.push({ x: curX, y: curY });
    if (curX === x1 && curY === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      curX += sx;
    }
    if (e2 < dx) {
      err += dx;
      curY += sy;
    }
  }

  return points;
}

/**
 * 사각형 테두리/채우기 픽셀 포인트 생성
 */
export function getRectanglePoints(
  x0: number, 
  y0: number, 
  x1: number, 
  y1: number, 
  fill: boolean = false
): { x: number; y: number }[] {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  const points: { x: number; y: number }[] = [];

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (fill || x === minX || x === maxX || y === minY || y === maxY) {
        points.push({ x, y });
      }
    }
  }

  return points;
}

/**
 * 중점 원 알고리즘 (Bresenham Circle)
 */
export function getCirclePoints(
  x0: number, 
  y0: number, 
  x1: number, 
  y1: number, 
  fill: boolean = false
): { x: number; y: number }[] {
  const radius = Math.round(Math.hypot(x1 - x0, y1 - y0));
  const points: { x: number; y: number }[] = [];
  const setPoint = (x: number, y: number) => {
    points.push({ x, y });
  };

  if (radius === 0) {
    return [{ x: x0, y: y0 }];
  }

  if (fill) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) {
          setPoint(x0 + dx, y0 + dy);
        }
      }
    }
    return points;
  }

  let x = radius;
  let y = 0;
  let err = 0;

  const added = new Set<string>();
  const add = (px: number, py: number) => {
    const key = `${px},${py}`;
    if (!added.has(key)) {
      added.add(key);
      points.push({ x: px, y: py });
    }
  };

  while (x >= y) {
    add(x0 + x, y0 + y);
    add(x0 + y, y0 + x);
    add(x0 - y, y0 + x);
    add(x0 - x, y0 + y);
    add(x0 - x, y0 - y);
    add(x0 - y, y0 - x);
    add(x0 + y, y0 - x);
    add(x0 + x, y0 - y);

    if (err <= 0) {
      y += 1;
      err += 2 * y + 1;
    }
    if (err > 0) {
      x -= 1;
      err -= 2 * x + 1;
    }
  }

  return points;
}

/**
 * 플러드 필 (페인트 통 채우기)
 */
export function floodFill(
  pixels: string[],
  width: number,
  height: number,
  startX: number,
  startY: number,
  fillColor: string
): string[] {
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) return pixels;

  const targetColor = pixels[startY * width + startX] || '';
  if (targetColor.toLowerCase() === fillColor.toLowerCase()) return pixels;

  const newPixels = [...pixels];
  const visited = new Uint8Array(width * height);
  const queue: [number, number][] = [[startX, startY]];
  visited[startY * width + startX] = 1;

  const getIdx = (x: number, y: number) => y * width + x;

  while (queue.length > 0) {
    const [x, y] = queue.pop()!;
    const idx = getIdx(x, y);
    newPixels[idx] = fillColor;

    // 4방향 탐색
    const neighbors: [number, number][] = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];

    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nIdx = getIdx(nx, ny);
        if (!visited[nIdx]) {
          const neighborColor = newPixels[nIdx] || '';
          if (neighborColor.toLowerCase() === targetColor.toLowerCase()) {
            visited[nIdx] = 1;
            queue.push([nx, ny]);
          }
        }
      }
    }
  }

  return newPixels;
}

/**
 * 브러시 크기(1~4px)에 따른 픽셀 스탬프 반환
 */
export function getBrushStamp(centerX: number, centerY: number, size: number): { x: number; y: number }[] {
  if (size <= 1) return [{ x: centerX, y: centerY }];
  const points: { x: number; y: number }[] = [];
  const offset = Math.floor(size / 2);
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      points.push({ x: centerX - offset + dx, y: centerY - offset + dy });
    }
  }
  return points;
}

/**
 * 여러 레이어를 결합하여 합성 ImageData 생성
 */
export function compositeLayers(
  layers: Layer[],
  groups: LayerGroup[],
  width: number,
  height: number
): ImageData {
  const groupVisibilityMap = new Map<string, boolean>();
  groups.forEach(g => groupVisibilityMap.set(g.id, g.visible));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  // 레이어는 배열 순서대로 아래에서 위로 합성
  // visible && group.visible 인 레이어만 렌더
  for (let l = 0; l < layers.length; l++) {
    const layer = layers[l];
    if (!layer.visible) continue;
    if (layer.groupId && groupVisibilityMap.get(layer.groupId) === false) continue;

    const opacity = Math.max(0, Math.min(1, layer.opacity));
    if (opacity <= 0) continue;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const color = layer.pixels[idx];
        if (!color) continue;

        const src = hexToRgba(color);
        const srcAlpha = src.a * opacity;
        if (srcAlpha <= 0) continue;

        const pIdx = idx * 4;
        const dstR = data[pIdx];
        const dstG = data[pIdx + 1];
        const dstB = data[pIdx + 2];
        const dstA = data[pIdx + 3] / 255;

        // 알파 블렌딩 (Over 연산)
        const outA = srcAlpha + dstA * (1 - srcAlpha);
        if (outA > 0) {
          data[pIdx] = Math.round((src.r * srcAlpha + dstR * dstA * (1 - srcAlpha)) / outA);
          data[pIdx + 1] = Math.round((src.g * srcAlpha + dstG * dstA * (1 - srcAlpha)) / outA);
          data[pIdx + 2] = Math.round((src.b * srcAlpha + dstB * dstA * (1 - srcAlpha)) / outA);
          data[pIdx + 3] = Math.round(outA * 255);
        }
      }
    }
  }

  return imgData;
}
