import { Layer, LayerGroup, StripeExportSettings } from '../types';
import { hexToRgba } from './pixelEngine';

/**
 * 개별 레이어를 단일 ImageData로 렌더링
 */
function renderSingleLayerToCanvas(
  layer: Layer,
  width: number,
  height: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  const opacity = Math.max(0, Math.min(1, layer.opacity));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const color = layer.pixels[idx];
      if (!color) continue;

      const rgba = hexToRgba(color);
      const pIdx = idx * 4;
      data[pIdx] = rgba.r;
      data[pIdx + 1] = rgba.g;
      data[pIdx + 2] = rgba.b;
      data[pIdx + 3] = Math.round(rgba.a * opacity * 255);
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * 레이어들을 조합하여 스트라이프(스프라이트 스트립 / 시트) 캔버스 생성
 */
export function generateStripeCanvas(
  layers: Layer[],
  groups: LayerGroup[],
  width: number,
  height: number,
  settings: StripeExportSettings
): HTMLCanvasElement {
  const { layout, scale = 1, spacing = 0, backgroundColor, includeHiddenLayers } = settings;

  const groupVisibilityMap = new Map<string, boolean>();
  groups.forEach(g => groupVisibilityMap.set(g.id, g.visible));

  // 대상 레이어 필터링
  const targetLayers = layers.filter(l => {
    if (includeHiddenLayers) return true;
    if (!l.visible) return false;
    if (l.groupId && groupVisibilityMap.get(l.groupId) === false) return false;
    return true;
  });

  const frameCount = Math.max(1, targetLayers.length);
  const frameW = width * scale;
  const frameH = height * scale;

  let totalW = frameW;
  let totalH = frameH;
  let cols = frameCount;
  let rows = 1;

  if (layout === 'horizontal') {
    cols = frameCount;
    rows = 1;
    totalW = cols * frameW + (cols - 1) * spacing;
    totalH = frameH;
  } else if (layout === 'vertical') {
    cols = 1;
    rows = frameCount;
    totalW = frameW;
    totalH = rows * frameH + (rows - 1) * spacing;
  } else if (layout === 'grid') {
    cols = settings.columns && settings.columns > 0 ? settings.columns : Math.ceil(Math.sqrt(frameCount));
    rows = Math.ceil(frameCount / cols);
    totalW = cols * frameW + (cols - 1) * spacing;
    totalH = rows * frameH + (rows - 1) * spacing;
  }

  const canvas = document.createElement('canvas');
  canvas.width = totalW;
  canvas.height = totalH;
  const ctx = canvas.getContext('2d')!;

  // 픽셀 보간 끄기 (선명한 nearest-neighbor 픽셀 유지)
  ctx.imageSmoothingEnabled = false;

  // 배경색 처리
  if (backgroundColor && backgroundColor !== 'transparent') {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, totalW, totalH);
  } else {
    ctx.clearRect(0, 0, totalW, totalH);
  }

  // 각 프레임 그리기
  targetLayers.forEach((layer, index) => {
    let col = 0;
    let row = 0;

    if (layout === 'horizontal') {
      col = index;
      row = 0;
    } else if (layout === 'vertical') {
      col = 0;
      row = index;
    } else {
      col = index % cols;
      row = Math.floor(index / cols);
    }

    const posX = col * (frameW + spacing);
    const posY = row * (frameH + spacing);

    const layerCanvas = renderSingleLayerToCanvas(layer, width, height);
    ctx.drawImage(layerCanvas, 0, 0, width, height, posX, posY, frameW, frameH);
  });

  return canvas;
}

/**
 * 캔버스를 이미지 파일(PNG)로 다운로드 트리거
 */
export function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string = 'pixel-art.png') {
  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 'image/png');
}

/**
 * SVG 문자열을 파일로 다운로드
 */
export function downloadSvgFile(svgContent: string, filename: string = 'pixel-art.svg') {
  const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * JSON 텍스트 파일 다운로드
 */
export function downloadJsonFile(jsonContent: string, filename: string = 'spritesheet.json') {
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 2D 게임 엔진 (Phaser, PixiJS, TexturePacker) 호환 JSON Sprite Atlas 생성
 */
export function generateSpriteAtlasJson(
  layers: Layer[],
  groups: LayerGroup[],
  width: number,
  height: number,
  settings: StripeExportSettings,
  imageFilename: string = 'spritesheet.png'
): string {
  const { layout, scale = 1, spacing = 0, includeHiddenLayers } = settings;

  const groupVisibilityMap = new Map<string, boolean>();
  groups.forEach(g => groupVisibilityMap.set(g.id, g.visible));

  const targetLayers = layers.filter(l => {
    if (includeHiddenLayers) return true;
    if (!l.visible) return false;
    if (l.groupId && groupVisibilityMap.get(l.groupId) === false) return false;
    return true;
  });

  const frameCount = Math.max(1, targetLayers.length);
  const frameW = width * scale;
  const frameH = height * scale;

  let cols = frameCount;
  let rows = 1;
  let totalW = frameW;
  let totalH = frameH;

  if (layout === 'horizontal') {
    cols = frameCount;
    rows = 1;
    totalW = cols * frameW + (cols - 1) * spacing;
    totalH = frameH;
  } else if (layout === 'vertical') {
    cols = 1;
    rows = frameCount;
    totalW = frameW;
    totalH = rows * frameH + (rows - 1) * spacing;
  } else if (layout === 'grid') {
    cols = settings.columns && settings.columns > 0 ? settings.columns : Math.ceil(Math.sqrt(frameCount));
    rows = Math.ceil(frameCount / cols);
    totalW = cols * frameW + (cols - 1) * spacing;
    totalH = rows * frameH + (rows - 1) * spacing;
  }

  const frames: Record<string, any> = {};

  targetLayers.forEach((layer, index) => {
    let col = 0;
    let row = 0;

    if (layout === 'horizontal') {
      col = index;
      row = 0;
    } else if (layout === 'vertical') {
      col = 0;
      row = index;
    } else {
      col = index % cols;
      row = Math.floor(index / cols);
    }

    const posX = col * (frameW + spacing);
    const posY = row * (frameH + spacing);
    const frameName = `${layer.name.replace(/\s+/g, '_')}_${index}`;

    frames[frameName] = {
      frame: { x: posX, y: posY, w: frameW, h: frameH },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: frameW, h: frameH },
      sourceSize: { w: frameW, h: frameH },
      duration: 100 // default 100ms per frame
    };
  });

  const atlas = {
    meta: {
      app: 'PixelCraft Pro Sprite Engine',
      version: '1.0.0',
      image: imageFilename,
      format: 'RGBA8888',
      size: { w: totalW, h: totalH },
      scale: scale
    },
    frames
  };

  return JSON.stringify(atlas, null, 2);
}

/**
 * 웹용 CSS Sprite Steps() 애니메이션 코드 생성
 */
export function generateCssSpriteAnimation(
  width: number,
  height: number,
  frameCount: number,
  scale: number,
  fps: number = 8
): string {
  const scaledW = width * scale;
  const scaledH = height * scale;
  const totalOffset = scaledW * frameCount;
  const duration = (frameCount / fps).toFixed(2);

  return `/* CSS Sprite Animation */
.pixel-sprite {
  width: ${scaledW}px;
  height: ${scaledH}px;
  background-image: url('spritesheet.png');
  background-repeat: no-repeat;
  image-rendering: pixelated;
  animation: play-sprite ${duration}s steps(${frameCount}) infinite;
}

@keyframes play-sprite {
  from { background-position: 0px 0px; }
  to { background-position: -${totalOffset}px 0px; }
}`;
}
