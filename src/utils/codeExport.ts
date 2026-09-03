import { CodeExportFormat, Layer, LayerGroup } from '../types';
import { compositeLayers, hexToRgba } from './pixelEngine';

/**
 * RGB to RGB565 (16-bit color for Arduino / Embedded displays)
 */
function hexToRgb565(hex: string): string {
  if (!hex) return '0x0000';
  const { r, g, b } = hexToRgba(hex);
  const r5 = (r >> 3) & 0x1F;
  const g6 = (g >> 2) & 0x3F;
  const b5 = (b >> 3) & 0x1F;
  const val = (r5 << 11) | (g6 << 5) | b5;
  return '0x' + val.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * 복합 레이어에서 압축된 유효 픽셀 목록 추출
 */
function getCompositedPixelArray(
  layers: Layer[],
  groups: LayerGroup[],
  width: number,
  height: number
): { x: number; y: number; hex: string }[] {
  const imgData = compositeLayers(layers, groups, width, height);
  const data = imgData.data;
  const pixels: { x: number; y: number; hex: string }[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const a = data[idx + 3] / 255;
      if (a > 0.05) {
        const toHex = (n: number) => n.toString(16).padStart(2, '0');
        const hex = `#${toHex(data[idx])}${toHex(data[idx + 1])}${toHex(data[idx + 2])}`;
        pixels.push({ x, y, hex });
      }
    }
  }

  return pixels;
}

/**
 * 각 언어/포맷별 소스코드 생성기
 */
export function generateSourceCode(
  layers: Layer[],
  groups: LayerGroup[],
  width: number,
  height: number,
  format: CodeExportFormat
): string {
  const pixelList = getCompositedPixelArray(layers, groups, width, height);

  switch (format) {
    case 'css': {
      const pixelSize = 4; // 기본 4px 스케일
      const shadows = pixelList
        .map(p => `${(p.x + 1) * pixelSize}px ${(p.y + 1) * pixelSize}px 0 0 ${p.hex}`)
        .join(',\n    ');

      return `/* PixelCraft Pro - Pure CSS Box-Shadow Pixel Art */
.pixel-art {
  width: ${pixelSize}px;
  height: ${pixelSize}px;
  margin-top: -${pixelSize}px;
  margin-left: -${pixelSize}px;
  box-shadow:
    ${shadows || 'none'};
}

/* HTML 사용 예시:
<div style="width: ${width * pixelSize}px; height: ${height * pixelSize}px; overflow: hidden;">
  <div class="pixel-art"></div>
</div>
*/`;
    }

    case 'svg': {
      const rects = pixelList
        .map(p => `  <rect x="${p.x}" y="${p.y}" width="1" height="1" fill="${p.hex}" />`)
        .join('\n');

      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges" width="${width * 8}" height="${height * 8}">
<!-- PixelCraft Pro Generated Vector SVG -->
${rects}
</svg>`;
    }

    case 'canvas': {
      return `/**
 * PixelCraft Pro - HTML5 Canvas 2D 렌더러
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} scale 픽셀 확대 배율 (기본값: 4)
 * @param {number} offsetX 그리기 시작 X 좌표
 * @param {number} offsetY 그리기 시작 Y 좌표
 */
function renderPixelArt(ctx, scale = 4, offsetX = 0, offsetY = 0) {
  const pixels = ${JSON.stringify(pixelList.map(p => [p.x, p.y, p.hex]))};
  
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  
  for (let i = 0; i < pixels.length; i++) {
    const [x, y, color] = pixels[i];
    ctx.fillStyle = color;
    ctx.fillRect(offsetX + x * scale, offsetY + y * scale, scale, scale);
  }
  
  ctx.restore();
}

// 사용 예시:
// const canvas = document.getElementById('myCanvas');
// const ctx = canvas.getContext('2d');
// renderPixelArt(ctx, 8, 0, 0);`;
    }

    case 'js-matrix': {
      // 2차원 배열 구조 생성
      const matrix: string[][] = Array.from({ length: height }, () => Array(width).fill(''));
      pixelList.forEach(p => {
        matrix[p.y][p.x] = p.hex;
      });

      return `/**
 * PixelCraft Pro - 2D Pixel Matrix (${width}x${height})
 */
export const PIXEL_ART_METADATA = {
  width: ${width},
  height: ${height},
  pixelCount: ${pixelList.length},
};

export const PIXEL_MATRIX: string[][] = ${JSON.stringify(matrix, null, 2)};`;
    }

    case 'arduino-c': {
      const imgData = compositeLayers(layers, groups, width, height);
      const data = imgData.data;
      const rgb565Array: string[] = [];

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const a = data[idx + 3];
          if (a < 32) {
            rgb565Array.push('0x0000');
          } else {
            const toHex = (n: number) => n.toString(16).padStart(2, '0');
            const hex = `#${toHex(data[idx])}${toHex(data[idx + 1])}${toHex(data[idx + 2])}`;
            rgb565Array.push(hexToRgb565(hex));
          }
        }
      }

      // 16개씩 줄바꿈
      const lines: string[] = [];
      for (let i = 0; i < rgb565Array.length; i += 16) {
        lines.push('  ' + rgb565Array.slice(i, i + 16).join(', '));
      }

      return `// ========================================================
// PixelCraft Pro - Arduino / TFT_eSPI RGB565 Sprite Data
// Width: ${width} px, Height: ${height} px, Size: ${width * height} words
// ========================================================
#include <Arduino.h>

#define SPRITE_WIDTH  ${width}
#define SPRITE_HEIGHT ${height}

const uint16_t sprite_bitmap[${width * height}] PROGMEM = {
${lines.join(',\n')}
};

// 사용 예시 (Adafruit_GFX / TFT_eSPI):
// tft.drawRGBBitmap(x, y, sprite_bitmap, SPRITE_WIDTH, SPRITE_HEIGHT);`;
    }

    default:
      return '';
  }
}
