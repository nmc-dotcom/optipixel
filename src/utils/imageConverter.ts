import { DitherType, ImageConversionSettings } from '../types';
import { colorDistance, hexToRgba, RGBA, rgbaToHex } from './pixelEngine';

// 4x4 Bayer Matrix (0-15 normalized to -0.5 ~ +0.5)
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/**
 * 이미지 파일을 HTMLImageElement로 로드
 */
export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 이미지 전처리 (밝기, 대비, 채도 조정)
 */
function adjustPixelColor(r: number, g: number, b: number, settings: ImageConversionSettings): [number, number, number] {
  // 1. 밝기 (-100 ~ 100)
  let nr = r + (settings.brightness * 255) / 100;
  let ng = g + (settings.brightness * 255) / 100;
  let nb = b + (settings.brightness * 255) / 100;

  // 2. 대비 (-100 ~ 100)
  const factor = (259 * (settings.contrast + 255)) / (255 * (259 - settings.contrast));
  nr = factor * (nr - 128) + 128;
  ng = factor * (ng - 128) + 128;
  nb = factor * (nb - 128) + 128;

  // 3. 채도 (-100 ~ 100)
  if (settings.saturation !== 0) {
    const gray = 0.2989 * nr + 0.5870 * ng + 0.1140 * nb;
    const satFactor = 1 + settings.saturation / 100;
    nr = gray + (nr - gray) * satFactor;
    ng = gray + (ng - gray) * satFactor;
    nb = gray + (nb - gray) * satFactor;
  }

  return [
    Math.max(0, Math.min(255, nr)),
    Math.max(0, Math.min(255, ng)),
    Math.max(0, Math.min(255, nb)),
  ];
}

/**
 * 주어진 색상에 가장 가까운 팔레트 색상 찾기 (Redmean 가중 거리 적용)
 */
function findClosestColor(color: RGBA, palette: RGBA[]): RGBA {
  let closest = palette[0];
  let minDistance = Infinity;

  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    const dist = colorDistance(color, p);
    if (dist < minDistance) {
      minDistance = dist;
      closest = p;
    }
  }

  return closest;
}

/**
 * Pyxelate 스타일 엣지 보존(Edge-Preserving) 다운스케일러
 * 단순 바이리니어 평균 축소 시 외곽선 및 얇은 디테일이 뭉개지는 현상을 방지
 */
function performEdgePreservingDownsample(
  img: HTMLImageElement,
  cropArea: { sx: number; sy: number; sWidth: number; sHeight: number },
  targetWidth: number,
  targetHeight: number,
  edgePreservationStrength: number // 0 ~ 100
): { r: Float32Array; g: Float32Array; b: Float32Array; a: Float32Array } {
  // 1. 소스 영역을 임시 캔버스에 원본 정밀도로 렌더링
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = cropArea.sWidth;
  srcCanvas.height = cropArea.sHeight;
  const sCtx = srcCanvas.getContext('2d', { willReadFrequently: true })!;
  sCtx.drawImage(
    img,
    cropArea.sx,
    cropArea.sy,
    cropArea.sWidth,
    cropArea.sHeight,
    0,
    0,
    cropArea.sWidth,
    cropArea.sHeight
  );

  const sImgData = sCtx.getImageData(0, 0, cropArea.sWidth, cropArea.sHeight);
  const sData = sImgData.data;
  const sW = cropArea.sWidth;
  const sH = cropArea.sHeight;

  const outR = new Float32Array(targetWidth * targetHeight);
  const outG = new Float32Array(targetWidth * targetHeight);
  const outB = new Float32Array(targetWidth * targetHeight);
  const outA = new Float32Array(targetWidth * targetHeight);

  const tileW = sW / targetWidth;
  const tileH = sH / targetHeight;
  const edgeWeight = Math.min(1, Math.max(0, edgePreservationStrength / 100));

  for (let ty = 0; ty < targetHeight; ty++) {
    const y0 = Math.floor(ty * tileH);
    const y1 = Math.min(sH, Math.ceil((ty + 1) * tileH));

    for (let tx = 0; tx < targetWidth; tx++) {
      const x0 = Math.floor(tx * tileW);
      const x1 = Math.min(sW, Math.ceil((tx + 1) * tileW));

      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumA = 0;
      let count = 0;

      // 타일 내 픽셀 수집
      for (let sy = y0; sy < y1; sy++) {
        const rowIdx = sy * sW;
        for (let sx = x0; sx < x1; sx++) {
          const idx = (rowIdx + sx) * 4;
          const a = sData[idx + 3] / 255;
          if (a > 0.05) {
            sumR += sData[idx];
            sumG += sData[idx + 1];
            sumB += sData[idx + 2];
            sumA += a;
            count++;
          }
        }
      }

      const outIdx = ty * targetWidth + tx;

      if (count === 0) {
        outR[outIdx] = 0;
        outG[outIdx] = 0;
        outB[outIdx] = 0;
        outA[outIdx] = 0;
        continue;
      }

      const avgR = sumR / count;
      const avgG = sumG / count;
      const avgB = sumB / count;
      const avgA = sumA / count;

      if (edgeWeight <= 0.01) {
        // 엣지 보존 미사용 시 단순 평균 채택
        outR[outIdx] = avgR;
        outG[outIdx] = avgG;
        outB[outIdx] = avgB;
        outA[outIdx] = avgA;
      } else {
        // Pyxelate 스타일: 타일 내부에서 평균과의 색상 분산(기울기/엣지 피크)이 가장 강한 지점 샘플링
        let maxDelta = -1;
        let peakR = avgR;
        let peakG = avgG;
        let peakB = avgB;

        for (let sy = y0; sy < y1; sy++) {
          const rowIdx = sy * sW;
          for (let sx = x0; sx < x1; sx++) {
            const idx = (rowIdx + sx) * 4;
            const a = sData[idx + 3] / 255;
            if (a > 0.1) {
              const dr = sData[idx] - avgR;
              const dg = sData[idx + 1] - avgG;
              const db = sData[idx + 2] - avgB;
              const delta = dr * dr + dg * dg + db * db;
              if (delta > maxDelta) {
                maxDelta = delta;
                peakR = sData[idx];
                peakG = sData[idx + 1];
                peakB = sData[idx + 2];
              }
            }
          }
        }

        // 평균 색상과 엣지 피크 색상을 강도에 따라 블렌딩하여 선명도 유지
        outR[outIdx] = avgR * (1 - edgeWeight * 0.7) + peakR * (edgeWeight * 0.7);
        outG[outIdx] = avgG * (1 - edgeWeight * 0.7) + peakG * (edgeWeight * 0.7);
        outB[outIdx] = avgB * (1 - edgeWeight * 0.7) + peakB * (edgeWeight * 0.7);
        outA[outIdx] = avgA;
      }
    }
  }

  return { r: outR, g: outG, b: outB, a: outA };
}

/**
 * 도미넌트 컬러(최빈값) 다운스케일러
 * 타일 내부 색상을 평균/블렌딩하지 않고 가장 많이 등장한 색상을 그대로 채택한다.
 * 이미 색상이 균일한 픽셀 아트(특히 업스케일된 이미지)를 축소할 때, 평균으로 인해
 * 원본에 없던 새로운 혼합 색상이 생기는 것을 방지한다.
 */
function performDominantColorDownsample(
  img: HTMLImageElement,
  cropArea: { sx: number; sy: number; sWidth: number; sHeight: number },
  targetWidth: number,
  targetHeight: number
): { r: Float32Array; g: Float32Array; b: Float32Array; a: Float32Array } {
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = cropArea.sWidth;
  srcCanvas.height = cropArea.sHeight;
  const sCtx = srcCanvas.getContext('2d', { willReadFrequently: true })!;
  sCtx.drawImage(
    img,
    cropArea.sx,
    cropArea.sy,
    cropArea.sWidth,
    cropArea.sHeight,
    0,
    0,
    cropArea.sWidth,
    cropArea.sHeight
  );

  const sImgData = sCtx.getImageData(0, 0, cropArea.sWidth, cropArea.sHeight);
  const sData = sImgData.data;
  const sW = cropArea.sWidth;
  const sH = cropArea.sHeight;

  const outR = new Float32Array(targetWidth * targetHeight);
  const outG = new Float32Array(targetWidth * targetHeight);
  const outB = new Float32Array(targetWidth * targetHeight);
  const outA = new Float32Array(targetWidth * targetHeight);

  const tileW = sW / targetWidth;
  const tileH = sH / targetHeight;

  for (let ty = 0; ty < targetHeight; ty++) {
    const y0 = Math.floor(ty * tileH);
    const y1 = Math.min(sH, Math.ceil((ty + 1) * tileH));

    for (let tx = 0; tx < targetWidth; tx++) {
      const x0 = Math.floor(tx * tileW);
      const x1 = Math.min(sW, Math.ceil((tx + 1) * tileW));

      const colorCounts = new Map<string, { count: number; r: number; g: number; b: number }>();
      let coveredCount = 0;
      let totalCount = 0;

      for (let sy = y0; sy < y1; sy++) {
        const rowIdx = sy * sW;
        for (let sx = x0; sx < x1; sx++) {
          const idx = (rowIdx + sx) * 4;
          totalCount++;
          const a = sData[idx + 3] / 255;
          if (a <= 0.05) continue;
          coveredCount++;
          const key = `${sData[idx]},${sData[idx + 1]},${sData[idx + 2]}`;
          const existing = colorCounts.get(key);
          if (existing) {
            existing.count++;
          } else {
            colorCounts.set(key, { count: 1, r: sData[idx], g: sData[idx + 1], b: sData[idx + 2] });
          }
        }
      }

      if (coveredCount === 0) continue; // 기본값 0 (완전 투명) 유지

      let dominant = { count: 0, r: 0, g: 0, b: 0 };
      for (const entry of colorCounts.values()) {
        if (entry.count > dominant.count) dominant = entry;
      }

      const outIdx = ty * targetWidth + tx;
      outR[outIdx] = dominant.r;
      outG[outIdx] = dominant.g;
      outB[outIdx] = dominant.b;
      outA[outIdx] = coveredCount / totalCount;
    }
  }

  return { r: outR, g: outG, b: outB, a: outA };
}

/**
 * 고립된 1px 단독 노이즈(소금-후추 노이즈) 제거 클린업 패스
 */
function cleanupOrphanPixelsPass(pixels: string[], width: number, height: number): string[] {
  const result = [...pixels];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const current = result[idx];
      if (!current) continue; // 투명 픽셀은 건너뜀

      // 8방향 이웃 픽셀 색상 빈도수 계측
      const neighborColors: { [color: string]: number } = {};
      let matchingNeighbors = 0;
      let totalValidNeighbors = 0;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nColor = pixels[ny * width + nx];
            if (nColor) {
              totalValidNeighbors++;
              if (nColor === current) {
                matchingNeighbors++;
              }
              neighborColors[nColor] = (neighborColors[nColor] || 0) + 1;
            }
          }
        }
      }

      // 8방향 이웃 중 자신과 같은 색상이 0개(완전 고립)이고 이웃 픽셀이 충분할 경우
      if (matchingNeighbors === 0 && totalValidNeighbors >= 3) {
        let maxCount = 0;
        let dominantColor = current;
        for (const [color, count] of Object.entries(neighborColors)) {
          if (count > maxCount) {
            maxCount = count;
            dominantColor = color;
          }
        }
        result[idx] = dominantColor;
      }
    }
  }

  return result;
}

/**
 * 이미지를 도트 그래픽(픽셀 배열)으로 변환하는 최고 성능 하이브리드 엔진
 */
export function convertImageToPixels(
  img: HTMLImageElement,
  settings: ImageConversionSettings,
  targetPaletteHex: string[]
): { pixels: string[]; width: number; height: number } {
  const {
    targetWidth,
    targetHeight,
    fitMode,
    dither,
    colorCount,
    useCurrentPalette,
    edgePreservation = 40,
    cleanupOrphanPixels = true,
    downscaleMethod = 'edge-preserving',
    alphaThreshold = 50,
  } = settings;

  const runDownsample = (
    cropArea: { sx: number; sy: number; sWidth: number; sHeight: number },
    tw: number,
    th: number
  ) =>
    downscaleMethod === 'dominant'
      ? performDominantColorDownsample(img, cropArea, tw, th)
      : performEdgePreservingDownsample(img, cropArea, tw, th, edgePreservation);

  let sx = 0;
  let sy = 0;
  let sWidth = img.width;
  let sHeight = img.height;

  // 'fit'은 원본 전체를 자르지 않고 사용하며, 아래에서 레터박스/필러박스로
  // 여백을 채운다 (크롭하지 않음 — sx/sy/sWidth/sHeight는 원본 그대로 둔다).
  if (fitMode === 'crop') {
    const imgAspect = img.width / img.height;
    const targetAspect = targetWidth / targetHeight;
    if (imgAspect > targetAspect) {
      sWidth = Math.round(img.height * targetAspect);
      sx = Math.floor((img.width - sWidth) / 2);
    } else {
      sHeight = Math.round(img.width / targetAspect);
      sy = Math.floor((img.height - sHeight) / 2);
    }
  }

  // 1. Pyxelate 스타일 엣지 보존 다운스케일링 수행
  let rawR: Float32Array;
  let rawG: Float32Array;
  let rawB: Float32Array;
  let rawA: Float32Array;

  if (fitMode === 'fit') {
    // 원본 종횡비를 유지한 내부 크기로 다운스케일 후, 목표 캔버스 중앙에
    // 배치하고 나머지는 투명 여백(레터박스/필러박스)으로 채운다.
    const imgAspect = sWidth / sHeight;
    const targetAspect = targetWidth / targetHeight;
    const innerWidth = imgAspect > targetAspect
      ? targetWidth
      : Math.max(1, Math.round(targetHeight * imgAspect));
    const innerHeight = imgAspect > targetAspect
      ? Math.max(1, Math.round(targetWidth / imgAspect))
      : targetHeight;

    const inner = runDownsample({ sx, sy, sWidth, sHeight }, innerWidth, innerHeight);

    rawR = new Float32Array(targetWidth * targetHeight);
    rawG = new Float32Array(targetWidth * targetHeight);
    rawB = new Float32Array(targetWidth * targetHeight);
    rawA = new Float32Array(targetWidth * targetHeight); // 기본값 0 = 투명 여백

    const padX = Math.floor((targetWidth - innerWidth) / 2);
    const padY = Math.floor((targetHeight - innerHeight) / 2);
    for (let y = 0; y < innerHeight; y++) {
      for (let x = 0; x < innerWidth; x++) {
        const srcIdx = y * innerWidth + x;
        const dstIdx = (y + padY) * targetWidth + (x + padX);
        rawR[dstIdx] = inner.r[srcIdx];
        rawG[dstIdx] = inner.g[srcIdx];
        rawB[dstIdx] = inner.b[srcIdx];
        rawA[dstIdx] = inner.a[srcIdx];
      }
    }
  } else {
    ({ r: rawR, g: rawG, b: rawB, a: rawA } = runDownsample({ sx, sy, sWidth, sHeight }, targetWidth, targetHeight));
  }

  // 2. 전처리(밝기, 대비, 채도) 버퍼 구축
  const bufferR = new Float32Array(targetWidth * targetHeight);
  const bufferG = new Float32Array(targetWidth * targetHeight);
  const bufferB = new Float32Array(targetWidth * targetHeight);
  const bufferA = new Float32Array(targetWidth * targetHeight);

  for (let i = 0; i < targetWidth * targetHeight; i++) {
    const a = rawA[i];
    if (a < 0.05) {
      bufferA[i] = 0;
    } else {
      const [adjR, adjG, adjB] = adjustPixelColor(rawR[i], rawG[i], rawB[i], settings);
      bufferR[i] = adjR;
      bufferG[i] = adjG;
      bufferB[i] = adjB;
      bufferA[i] = a;
    }
  }

  // 3. 팔레트 구성
  // colorCount가 256(풀 컬러)이거나 0(무제한)이어도, 디더링 알고리즘이
  // 선택되어 있으면 디더링이 실제로 동작하도록 팔레트를 추출한다
  // (디더링은 목표 팔레트가 있어야만 의미가 있다).
  let activePalette: RGBA[] = [];
  if (useCurrentPalette && targetPaletteHex.length > 0) {
    activePalette = targetPaletteHex.map(hexToRgba);
  } else if (colorCount > 0) {
    activePalette = extractPaletteFromBuffers(bufferR, bufferG, bufferB, bufferA, colorCount);
  } else if (dither !== 'none') {
    activePalette = extractPaletteFromBuffers(bufferR, bufferG, bufferB, bufferA, 256);
  }

  let resultPixels: string[] = new Array(targetWidth * targetHeight).fill('');

  // 알파 이진화 임계값: 타일 커버리지가 이 값 미만이면 완전 투명, 이상이면
  // 완전 불투명으로 처리한다 (부드럽게 섞인 반투명 가장자리를 방지).
  const alphaCut = Math.max(0, Math.min(100, alphaThreshold)) / 100;

  // 4-A. Atkinson Dithering (Macintosh / Game Boy 레트로 스타일 - 에러 75% 6방향 분산)
  if (dither === 'atkinson' && activePalette.length > 0) {
    for (let y = 0; y < targetHeight; y++) {
      for (let x = 0; x < targetWidth; x++) {
        const idx = y * targetWidth + x;
        if (bufferA[idx] < alphaCut) continue;

        const current: RGBA = {
          r: Math.max(0, Math.min(255, bufferR[idx])),
          g: Math.max(0, Math.min(255, bufferG[idx])),
          b: Math.max(0, Math.min(255, bufferB[idx])),
          a: 1,
        };

        const closest = findClosestColor(current, activePalette);
        resultPixels[idx] = rgbaToHex(closest.r, closest.g, closest.b, 1);

        const errR = current.r - closest.r;
        const errG = current.g - closest.g;
        const errB = current.b - closest.b;

        // Atkinson matrix (1/8 each):
        // (x+1, y), (x+2, y), (x-1, y+1), (x, y+1), (x+1, y+1), (x, y+2)
        const distribute = (nx: number, ny: number) => {
          if (nx >= 0 && nx < targetWidth && ny >= 0 && ny < targetHeight) {
            const nIdx = ny * targetWidth + nx;
            if (bufferA[nIdx] > 0) {
              bufferR[nIdx] += errR * 0.125;
              bufferG[nIdx] += errG * 0.125;
              bufferB[nIdx] += errB * 0.125;
            }
          }
        };

        distribute(x + 1, y);
        distribute(x + 2, y);
        distribute(x - 1, y + 1);
        distribute(x, y + 1);
        distribute(x + 1, y + 1);
        distribute(x, y + 2);
      }
    }
  }
  // 4-B. Floyd-Steinberg Dithering (부드러운 그라데이션)
  else if (dither === 'floyd-steinberg' && activePalette.length > 0) {
    for (let y = 0; y < targetHeight; y++) {
      for (let x = 0; x < targetWidth; x++) {
        const idx = y * targetWidth + x;
        if (bufferA[idx] < alphaCut) continue;

        const current: RGBA = {
          r: Math.max(0, Math.min(255, bufferR[idx])),
          g: Math.max(0, Math.min(255, bufferG[idx])),
          b: Math.max(0, Math.min(255, bufferB[idx])),
          a: 1,
        };

        const closest = findClosestColor(current, activePalette);
        resultPixels[idx] = rgbaToHex(closest.r, closest.g, closest.b, 1);

        const errR = current.r - closest.r;
        const errG = current.g - closest.g;
        const errB = current.b - closest.b;

        const distribute = (nx: number, ny: number, factor: number) => {
          if (nx >= 0 && nx < targetWidth && ny >= 0 && ny < targetHeight) {
            const nIdx = ny * targetWidth + nx;
            if (bufferA[nIdx] > 0) {
              bufferR[nIdx] += errR * factor;
              bufferG[nIdx] += errG * factor;
              bufferB[nIdx] += errB * factor;
            }
          }
        };

        distribute(x + 1, y, 7 / 16);
        distribute(x - 1, y + 1, 3 / 16);
        distribute(x, y + 1, 5 / 16);
        distribute(x + 1, y + 1, 1 / 16);
      }
    }
  }
  // 4-C. Bayer 4x4 Ordered Dithering (규칙적 레트로 격자 패턴)
  else if (dither === 'bayer4x4' && activePalette.length > 0) {
    for (let y = 0; y < targetHeight; y++) {
      for (let x = 0; x < targetWidth; x++) {
        const idx = y * targetWidth + x;
        if (bufferA[idx] < alphaCut) continue;

        const bayerVal = (BAYER_4X4[y % 4][x % 4] / 15 - 0.5) * 48;
        const current: RGBA = {
          r: Math.max(0, Math.min(255, bufferR[idx] + bayerVal)),
          g: Math.max(0, Math.min(255, bufferG[idx] + bayerVal)),
          b: Math.max(0, Math.min(255, bufferB[idx] + bayerVal)),
          a: 1,
        };

        const closest = findClosestColor(current, activePalette);
        resultPixels[idx] = rgbaToHex(closest.r, closest.g, closest.b, 1);
      }
    }
  }
  // 4-D. No Dithering (플랫 도트)
  else {
    for (let y = 0; y < targetHeight; y++) {
      for (let x = 0; x < targetWidth; x++) {
        const idx = y * targetWidth + x;
        if (bufferA[idx] < alphaCut) continue;

        const current: RGBA = {
          r: Math.max(0, Math.min(255, bufferR[idx])),
          g: Math.max(0, Math.min(255, bufferG[idx])),
          b: Math.max(0, Math.min(255, bufferB[idx])),
          a: 1,
        };

        if (activePalette.length > 0) {
          const closest = findClosestColor(current, activePalette);
          resultPixels[idx] = rgbaToHex(closest.r, closest.g, closest.b, 1);
        } else {
          resultPixels[idx] = rgbaToHex(current.r, current.g, current.b, 1);
        }
      }
    }
  }

  // 5. 단독 고립 픽셀 노이즈 클린업 패스
  if (cleanupOrphanPixels) {
    resultPixels = cleanupOrphanPixelsPass(resultPixels, targetWidth, targetHeight);
  }

  return { pixels: resultPixels, width: targetWidth, height: targetHeight };
}

/**
 * 버퍼로부터 K-Means 군집화를 통한 색상 팔레트 추출 (Redmean 색차 기준)
 */
function extractPaletteFromBuffers(
  bufR: Float32Array,
  bufG: Float32Array,
  bufB: Float32Array,
  bufA: Float32Array,
  k: number
): RGBA[] {
  const samples: RGBA[] = [];
  const len = bufR.length;

  for (let i = 0; i < len; i++) {
    if (bufA[i] > 0.2) {
      samples.push({
        r: Math.round(bufR[i]),
        g: Math.round(bufG[i]),
        b: Math.round(bufB[i]),
        a: 1,
      });
    }
  }

  if (samples.length === 0) {
    return [
      { r: 0, g: 0, b: 0, a: 1 },
      { r: 255, g: 255, b: 255, a: 1 },
    ];
  }

  if (samples.length <= k) {
    return samples;
  }

  // 균등 간격 시드 추출
  const centroids: RGBA[] = [];
  const step = Math.floor(samples.length / k);
  for (let i = 0; i < k; i++) {
    centroids.push({ ...samples[i * step] });
  }

  // 4회 반복 정제
  for (let iter = 0; iter < 4; iter++) {
    const sums = centroids.map(() => ({ r: 0, g: 0, b: 0, count: 0 }));
    for (let s = 0; s < samples.length; s += 2) {
      const p = samples[s];
      let bestDist = Infinity;
      let bestIdx = 0;
      for (let c = 0; c < centroids.length; c++) {
        const dist = colorDistance(p, centroids[c]);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = c;
        }
      }
      sums[bestIdx].r += p.r;
      sums[bestIdx].g += p.g;
      sums[bestIdx].b += p.b;
      sums[bestIdx].count++;
    }

    for (let c = 0; c < centroids.length; c++) {
      if (sums[c].count > 0) {
        centroids[c] = {
          r: Math.round(sums[c].r / sums[c].count),
          g: Math.round(sums[c].g / sums[c].count),
          b: Math.round(sums[c].b / sums[c].count),
          a: 1,
        };
      }
    }
  }

  return centroids;
}

export interface DetectedPixelScale {
  scaleX: number;
  scaleY: number;
  suggestedWidth: number;
  suggestedHeight: number;
  confidence: number; // 0 ~ 1
}

/**
 * 업스케일된 픽셀 아트에서 원본 "진짜" 픽셀 크기를 역추정한다 (runs 기반 감지).
 * 각 행/열을 스캔하며 동일 색상이 연속되는 구간(run)의 길이를 수집한 뒤,
 * 대부분의 run 길이를 나누어떨어지게 하는 가장 큰 배율 N을 찾는다.
 * 사진처럼 업스케일되지 않은 이미지에서는 일관된 배율이 나오지 않으므로 null을 반환한다.
 */
export function detectPixelScale(img: HTMLImageElement): DetectedPixelScale | null {
  const w = img.width;
  const h = img.height;
  if (w < 4 || h < 4) return null;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;

  const COLOR_TOLERANCE = 10; // 채널당 허용 오차 (JPEG 압축 노이즈 대응)

  const sameColor = (i1: number, i2: number) =>
    Math.abs(data[i1] - data[i2]) <= COLOR_TOLERANCE &&
    Math.abs(data[i1 + 1] - data[i2 + 1]) <= COLOR_TOLERANCE &&
    Math.abs(data[i1 + 2] - data[i2 + 2]) <= COLOR_TOLERANCE &&
    Math.abs(data[i1 + 3] - data[i2 + 3]) <= COLOR_TOLERANCE;

  // 성능을 위해 최대 200개 라인만 샘플링하여 각 라인의 동일 색상 연속 구간(run) 길이를 수집
  const collectRuns = (lineCount: number, lineLength: number, getIndex: (line: number, pos: number) => number): number[] => {
    const runs: number[] = [];
    const step = Math.max(1, Math.floor(lineCount / 200));
    for (let line = 0; line < lineCount; line += step) {
      let runStart = 0;
      for (let pos = 1; pos <= lineLength; pos++) {
        const prevIdx = getIndex(line, pos - 1) * 4;
        const isBoundary = pos === lineLength || !sameColor(prevIdx, getIndex(line, pos) * 4);
        if (isBoundary) {
          runs.push(pos - runStart);
          runStart = pos;
        }
      }
    }
    return runs;
  };

  const horizontalRuns = collectRuns(h, w, (row, col) => row * w + col);
  const verticalRuns = collectRuns(w, h, (col, row) => row * w + col);

  const detectScale = (runs: number[]): { scale: number; confidence: number } => {
    if (runs.length < 8) return { scale: 1, confidence: 0 };

    const maxRun = Math.max(...runs);
    const maxCandidate = Math.min(64, Math.floor(maxRun / 2));

    for (let n = maxCandidate; n >= 2; n--) {
      const matches = runs.reduce((acc, r) => acc + (r % n === 0 ? 1 : 0), 0);
      const confidence = matches / runs.length;
      if (confidence >= 0.85) {
        return { scale: n, confidence };
      }
    }
    return { scale: 1, confidence: 0 };
  };

  const { scale: scaleX, confidence: confX } = detectScale(horizontalRuns);
  const { scale: scaleY, confidence: confY } = detectScale(verticalRuns);

  if (scaleX < 2 || scaleY < 2) return null;

  return {
    scaleX,
    scaleY,
    suggestedWidth: Math.max(1, Math.round(w / scaleX)),
    suggestedHeight: Math.max(1, Math.round(h / scaleY)),
    confidence: Math.min(confX, confY),
  };
}
