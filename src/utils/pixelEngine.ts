import { Layer, LayerGroup, PixelClipboard, SelectionRect } from '../types';

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

const TRANSPARENT: RGBA = { r: 0, g: 0, b: 0, a: 0 };

// hex 문자열 파싱 결과 캐시.
// 캔버스 합성은 매 프레임 (레이어 수 × 픽셀 수)만큼 이 함수를 호출하지만
// 실제 등장하는 색상 종류는 보통 수십 개뿐이라 캐시 적중률이 사실상 100%다.
const hexCache = new Map<string, RGBA>();
const HEX_CACHE_LIMIT = 4096;

/**
 * 16진수 색상 코드를 RGBA 객체로 변환.
 * 반환 객체는 캐시에서 공유되므로 **변형하지 말 것** (읽기 전용으로만 사용).
 */
export function hexToRgba(hex: string): RGBA {
  if (!hex || hex === 'transparent') {
    return TRANSPARENT;
  }

  const cached = hexCache.get(hex);
  if (cached) return cached;

  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('') + 'ff';
  } else if (cleanHex.length === 6) {
    cleanHex += 'ff';
  }

  const num = parseInt(cleanHex, 16);
  if (isNaN(num)) {
    return TRANSPARENT;
  }

  const parsed: RGBA = {
    r: (num >> 24) & 255,
    g: (num >> 16) & 255,
    b: (num >> 8) & 255,
    a: (num & 255) / 255,
  };

  // 비정상적으로 많은 색상이 들어와도 메모리가 무한정 늘지 않도록 상한을 둔다
  if (hexCache.size >= HEX_CACHE_LIMIT) hexCache.clear();
  hexCache.set(hex, parsed);

  return parsed;
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

// ImageData 생성을 위한 재사용 캔버스.
// 합성은 드로잉 중 매 프레임 호출되므로, 호출마다 캔버스 엘리먼트를 새로 만들면
// 불필요한 DOM 할당과 GC 부담이 생긴다.
let scratchCanvas: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;

function getScratchContext(width: number, height: number): CanvasRenderingContext2D {
  if (!scratchCanvas || !scratchCtx) {
    scratchCanvas = document.createElement('canvas');
    scratchCtx = scratchCanvas.getContext('2d')!;
  }
  if (scratchCanvas.width !== width || scratchCanvas.height !== height) {
    scratchCanvas.width = width;
    scratchCanvas.height = height;
  }
  return scratchCtx;
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

  const imgData = getScratchContext(width, height).createImageData(width, height);
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

        // 완전 불투명한 픽셀은 아래를 그대로 덮으므로 블렌딩 계산을 건너뛴다.
        // 도트 이미지는 대부분의 픽셀이 여기에 해당해서, 캔버스가 커질수록
        // 이 분기가 합성 프레임 시간을 크게 좌우한다.
        if (srcAlpha >= 1) {
          data[pIdx] = src.r;
          data[pIdx + 1] = src.g;
          data[pIdx + 2] = src.b;
          data[pIdx + 3] = 255;
          continue;
        }

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

/**
 * 한 프레임의 레이어들을 합성해 하나의 픽셀 배열로 만든다.
 *
 * 프레임 썸네일, 어니언 스킨, 스프라이트 시트처럼 "프레임 하나를 이미지 하나로"
 * 다뤄야 하는 곳에서 쓴다. compositeLayers와 같은 결과를 ImageData 대신
 * 레이어와 동일한 hex 배열 형태로 돌려준다.
 *
 * 색이 반복되는 도트 이미지에서 픽셀마다 새 문자열을 만들지 않도록 색상별로
 * 캐시해 참조를 공유한다.
 */
export function flattenLayers(
  layers: Layer[],
  groups: LayerGroup[],
  width: number,
  height: number
): string[] {
  const data = compositeLayers(layers, groups, width, height).data;
  const out: string[] = new Array(width * height);
  const cache = new Map<number, string>();

  for (let i = 0; i < out.length; i++) {
    const p = i * 4;
    const a = data[p + 3];
    if (a === 0) {
      out[i] = '';
      continue;
    }
    const key = (a << 24) | (data[p] << 16) | (data[p + 1] << 8) | data[p + 2];
    const cached = cache.get(key);
    if (cached !== undefined) {
      out[i] = cached;
      continue;
    }
    const hex = rgbaToHex(data[p], data[p + 1], data[p + 2], a / 255);
    cache.set(key, hex);
    out[i] = hex;
  }

  return out;
}

/**
 * top 레이어를 bottom 레이어 위에 불투명도/표시여부를 반영해 알파 합성한
 * 픽셀 배열을 반환한다 (레이어 병합에 사용)
 */
export function blendPixelArrays(
  topPixels: string[],
  topOpacity: number,
  topVisible: boolean,
  bottomPixels: string[]
): string[] {
  if (!topVisible) return [...bottomPixels];

  const opacity = Math.max(0, Math.min(1, topOpacity));
  if (opacity <= 0) return [...bottomPixels];

  return bottomPixels.map((bottomHex, idx) => {
    const topHex = topPixels[idx];
    if (!topHex) return bottomHex;

    const src = hexToRgba(topHex);
    const srcAlpha = src.a * opacity;
    if (srcAlpha <= 0) return bottomHex;

    const dst = hexToRgba(bottomHex);
    const outA = srcAlpha + dst.a * (1 - srcAlpha);
    if (outA <= 0) return '';

    return rgbaToHex(
      (src.r * srcAlpha + dst.r * dst.a * (1 - srcAlpha)) / outA,
      (src.g * srcAlpha + dst.g * dst.a * (1 - srcAlpha)) / outA,
      (src.b * srcAlpha + dst.b * dst.a * (1 - srcAlpha)) / outA,
      outA
    );
  });
}

/**
 * 허용 오차 100%에 해당하는 색상 거리.
 * Redmean 거리의 최대치는 765(검정↔흰색)지만, 실측하면 안티앨리어싱은 15,
 * 디더링은 30~50, 배경과 피사체의 차이는 170 이상이다.
 * 0~300 구간에 대응시켜야 슬라이더가 실제로 쓸 만한 해상도를 갖는다.
 */
const MAX_WAND_DISTANCE = 300;

/**
 * 클릭한 지점과 이어진 비슷한 색 영역을 지운다 (마술봉 지우개).
 * 사용자가 직접 배경을 지목하므로, 피사체가 캔버스 가장자리에 닿아 있어도 안전하다.
 * tolerance는 0~100.
 */
export function magicWandErase(
  pixels: string[],
  width: number,
  height: number,
  startX: number,
  startY: number,
  tolerance: number
): string[] {
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) return pixels;

  const startColor = pixels[startY * width + startX] || '';
  if (!startColor) return pixels; // 이미 투명한 곳을 클릭하면 할 일이 없다

  const maxDistance = (Math.max(0, Math.min(100, tolerance)) / 100) * MAX_WAND_DISTANCE;
  const target = hexToRgba(startColor);

  const result = [...pixels];
  const visited = new Uint8Array(width * height);
  const stack: number[] = [];

  const push = (x: number, y: number) => {
    const idx = y * width + x;
    if (visited[idx]) return;
    visited[idx] = 1;
    const color = pixels[idx];
    if (!color) return;
    if (colorDistance(hexToRgba(color), target) > maxDistance) return;
    stack.push(idx);
  };

  push(startX, startY);

  while (stack.length > 0) {
    const idx = stack.pop()!;
    result[idx] = '';

    const x = idx % width;
    const y = (idx - x) / width;
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }

  return result;
}

/**
 * 드래그 시작/끝 좌표를 캔버스 안쪽의 정규화된 사각 선택 영역으로 변환한다.
 * 좌표 순서(역방향 드래그)와 캔버스 경계를 모두 보정하며,
 * 면적이 0이면 null을 반환한다.
 */
export function normalizeSelection(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  canvasWidth: number,
  canvasHeight: number
): SelectionRect | null {
  const x0 = Math.max(0, Math.min(canvasWidth - 1, Math.min(startX, endX)));
  const y0 = Math.max(0, Math.min(canvasHeight - 1, Math.min(startY, endY)));
  const x1 = Math.max(0, Math.min(canvasWidth - 1, Math.max(startX, endX)));
  const y1 = Math.max(0, Math.min(canvasHeight - 1, Math.max(startY, endY)));

  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  if (width <= 0 || height <= 0) return null;

  return { x: x0, y: y0, width, height };
}

/** 선택 영역 안의 픽셀을 잘라내어 클립보드 조각으로 만든다 */
export function copyRegion(
  pixels: string[],
  canvasWidth: number,
  region: SelectionRect
): PixelClipboard {
  const out: string[] = new Array(region.width * region.height);
  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      out[y * region.width + x] = pixels[(region.y + y) * canvasWidth + (region.x + x)] || '';
    }
  }
  return { width: region.width, height: region.height, pixels: out };
}

/** 선택 영역 안의 픽셀을 모두 비운 새 배열을 반환한다 */
export function clearRegion(
  pixels: string[],
  canvasWidth: number,
  region: SelectionRect
): string[] {
  const out = [...pixels];
  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      out[(region.y + y) * canvasWidth + (region.x + x)] = '';
    }
  }
  return out;
}

/**
 * 클립보드 조각을 (destX, destY) 위치에 붙여넣은 새 배열을 반환한다.
 * 캔버스 밖으로 나가는 부분은 잘라내고, 조각의 빈 픽셀은 기존 픽셀을 지우지 않는다.
 */
export function pasteRegion(
  pixels: string[],
  canvasWidth: number,
  canvasHeight: number,
  clip: PixelClipboard,
  destX: number,
  destY: number
): string[] {
  const out = [...pixels];
  for (let y = 0; y < clip.height; y++) {
    const targetY = destY + y;
    if (targetY < 0 || targetY >= canvasHeight) continue;
    for (let x = 0; x < clip.width; x++) {
      const targetX = destX + x;
      if (targetX < 0 || targetX >= canvasWidth) continue;
      const color = clip.pixels[y * clip.width + x];
      if (!color) continue; // 조각의 투명 부분은 아래 픽셀을 유지
      out[targetY * canvasWidth + targetX] = color;
    }
  }
  return out;
}
