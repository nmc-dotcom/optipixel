import { hexToRgba, RGBA, rgbaToHex } from './pixelEngine';

/**
 * 색상 단위 필터를 픽셀 배열에 적용한다.
 *
 * 같은 입력 색은 언제나 같은 결과를 내므로 색상별로 한 번만 계산하고 그 문자열
 * 참조를 재사용한다. 팔레트가 좁은 도트 이미지에서는 변환 횟수가 픽셀 수가 아닌
 * 색상 수에 비례하게 되고(256×256 · 16색이면 65,536회 → 16회), 결과 배열도
 * 문자열 참조를 공유해 그만큼 가벼워진다. 필터 모달의 슬라이더 실시간
 * 미리보기가 이 경로를 프레임마다 태우기 때문에 체감 차이가 크다.
 *
 * 투명 픽셀('')은 변환하지 않고 그대로 둔다.
 */
function mapPixelColors(pixels: string[], transform: (hex: string) => string): string[] {
  const cache = new Map<string, string>();
  return pixels.map(pixel => {
    if (!pixel) return '';
    const cached = cache.get(pixel);
    if (cached !== undefined) return cached;
    const next = transform(pixel);
    cache.set(pixel, next);
    return next;
  });
}

/**
 * 레이어 픽셀에 색상 반전 적용
 */
export function filterInvert(pixels: string[]): string[] {
  return mapPixelColors(pixels, hex => {
    const { r, g, b, a } = hexToRgba(hex);
    return rgbaToHex(255 - r, 255 - g, 255 - b, a);
  });
}

/**
 * 레이어 픽셀에 흑백(Grayscale) 적용
 */
export function filterGrayscale(pixels: string[]): string[] {
  return mapPixelColors(pixels, hex => {
    const { r, g, b, a } = hexToRgba(hex);
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    return rgbaToHex(gray, gray, gray, a);
  });
}

/**
 * 밝기 조정
 */
export function filterBrightness(pixels: string[], delta: number): string[] {
  return mapPixelColors(pixels, hex => {
    const { r, g, b, a } = hexToRgba(hex);
    return rgbaToHex(
      Math.max(0, Math.min(255, r + delta)),
      Math.max(0, Math.min(255, g + delta)),
      Math.max(0, Math.min(255, b + delta)),
      a
    );
  });
}

/**
 * 대비(Contrast) 조정 (-100 ~ 100)
 */
export function filterContrast(pixels: string[], contrast: number): string[] {
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  return mapPixelColors(pixels, hex => {
    const { r, g, b, a } = hexToRgba(hex);
    const nr = Math.max(0, Math.min(255, Math.round(factor * (r - 128) + 128)));
    const ng = Math.max(0, Math.min(255, Math.round(factor * (g - 128) + 128)));
    const nb = Math.max(0, Math.min(255, Math.round(factor * (b - 128) + 128)));
    return rgbaToHex(nr, ng, nb, a);
  });
}

/**
 * 채도(Saturation) 조정 (-100 ~ 100)
 */
export function filterSaturation(pixels: string[], saturation: number): string[] {
  const satFactor = 1 + saturation / 100;
  return mapPixelColors(pixels, hex => {
    const { r, g, b, a } = hexToRgba(hex);
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    const nr = Math.max(0, Math.min(255, Math.round(gray + (r - gray) * satFactor)));
    const ng = Math.max(0, Math.min(255, Math.round(gray + (g - gray) * satFactor)));
    const nb = Math.max(0, Math.min(255, Math.round(gray + (b - gray) * satFactor)));
    return rgbaToHex(nr, ng, nb, a);
  });
}

/**
 * 밝기, 대비, 채도, 색조를 원본 픽셀로부터 단일 패스로 적용하는 복합 톤 필터
 */
export function applyComprehensiveTone(
  pixels: string[],
  options: {
    brightness: number; // -100 ~ 100
    contrast: number;   // -100 ~ 100
    saturation: number; // -100 ~ 100
    hue: number;        // -180 ~ 180
  }
): string[] {
  const { brightness, contrast, saturation, hue } = options;
  if (brightness === 0 && contrast === 0 && saturation === 0 && hue === 0) {
    return pixels;
  }

  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const satFactor = 1 + saturation / 100;
  const hueShiftDegree = hue;

  return mapPixelColors(pixels, hex => {
    let { r, g, b, a } = hexToRgba(hex);

    // 1. Brightness
    if (brightness !== 0) {
      r = Math.max(0, Math.min(255, r + brightness * 1.5));
      g = Math.max(0, Math.min(255, g + brightness * 1.5));
      b = Math.max(0, Math.min(255, b + brightness * 1.5));
    }

    // 2. Contrast
    if (contrast !== 0) {
      r = Math.max(0, Math.min(255, Math.round(contrastFactor * (r - 128) + 128)));
      g = Math.max(0, Math.min(255, Math.round(contrastFactor * (g - 128) + 128)));
      b = Math.max(0, Math.min(255, Math.round(contrastFactor * (b - 128) + 128)));
    }

    // 3. Saturation
    if (saturation !== 0) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = Math.max(0, Math.min(255, Math.round(gray + (r - gray) * satFactor)));
      g = Math.max(0, Math.min(255, Math.round(gray + (g - gray) * satFactor)));
      b = Math.max(0, Math.min(255, Math.round(gray + (b - gray) * satFactor)));
    }

    // 4. Hue
    if (hueShiftDegree !== 0) {
      const rf = r / 255;
      const gf = g / 255;
      const bf = b / 255;
      const max = Math.max(rf, gf, bf);
      const min = Math.min(rf, gf, bf);
      let h = 0;
      let s = 0;
      const l = (max + min) / 2;

      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case rf: h = (gf - bf) / d + (gf < bf ? 6 : 0); break;
          case gf: h = (bf - rf) / d + 2; break;
          case bf: h = (rf - gf) / d + 4; break;
        }
        h /= 6;
      }

      h = (h + hueShiftDegree / 360) % 1;
      if (h < 0) h += 1;

      let nr = l;
      let ng = l;
      let nb = l;

      if (s !== 0) {
        const hue2rgb = (p: number, q: number, t: number) => {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1 / 6) return p + (q - p) * 6 * t;
          if (t < 1 / 2) return q;
          if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
          return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        nr = hue2rgb(p, q, h + 1 / 3);
        ng = hue2rgb(p, q, h);
        nb = hue2rgb(p, q, h - 1 / 3);
      }

      r = Math.round(nr * 255);
      g = Math.round(ng * 255);
      b = Math.round(nb * 255);
    }

    return rgbaToHex(r, g, b, a);
  });
}

/**
 * 색조(Hue) 회전
 */
export function filterHueShift(pixels: string[], degree: number): string[] {
  return mapPixelColors(pixels, hex => {
    const { r, g, b, a } = hexToRgba(hex);
    // RGB to HSL
    const rf = r / 255;
    const gf = g / 255;
    const bf = b / 255;
    const max = Math.max(rf, gf, bf);
    const min = Math.min(rf, gf, bf);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case rf: h = (gf - bf) / d + (gf < bf ? 6 : 0); break;
        case gf: h = (bf - rf) / d + 2; break;
        case bf: h = (rf - gf) / d + 4; break;
      }
      h /= 6;
    }

    // Shift Hue
    h = (h + degree / 360) % 1;
    if (h < 0) h += 1;

    // HSL to RGB
    let nr = l;
    let ng = l;
    let nb = l;

    if (s !== 0) {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      nr = hue2rgb(p, q, h + 1 / 3);
      ng = hue2rgb(p, q, h);
      nb = hue2rgb(p, q, h - 1 / 3);
    }

    return rgbaToHex(Math.round(nr * 255), Math.round(ng * 255), Math.round(nb * 255), a);
  });
}

/**
 * 1px 외곽선(아웃라인) 자동 생성 필터
 */
export function filterGenerateOutline(
  pixels: string[],
  width: number,
  height: number,
  outlineColor: string = '#0f172a'
): string[] {
  const result = [...pixels];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      // 투명한 픽셀인 경우, 상하좌우 대각선에 불투명 픽셀이 있는지 확인
      if (!pixels[idx]) {
        let hasNeighbor = false;
        const neighbors = [
          [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1],
          [x + 1, y + 1], [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1]
        ];

        for (const [nx, ny] of neighbors) {
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nIdx = ny * width + nx;
            if (pixels[nIdx]) {
              hasNeighbor = true;
              break;
            }
          }
        }

        if (hasNeighbor) {
          result[idx] = outlineColor;
        }
      }
    }
  }

  return result;
}

/**
 * 좌우 반전
 */
export function filterFlipHorizontal(pixels: string[], width: number, height: number): string[] {
  const result = new Array(width * height).fill('');
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      result[y * width + (width - 1 - x)] = pixels[y * width + x];
    }
  }
  return result;
}

/**
 * 상하 반전
 */
export function filterFlipVertical(pixels: string[], width: number, height: number): string[] {
  const result = new Array(width * height).fill('');
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      result[(height - 1 - y) * width + x] = pixels[y * width + x];
    }
  }
  return result;
}

/**
 * 시계 방향 90도 회전 (정사각형 캔버스 기준 또는 전치)
 */
export function filterRotate90(pixels: string[], width: number, height: number): { pixels: string[]; width: number; height: number } {
  const newWidth = height;
  const newHeight = width;
  const result = new Array(newWidth * newHeight).fill('');

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const newX = height - 1 - y;
      const newY = x;
      result[newY * newWidth + newX] = pixels[y * width + x];
    }
  }

  return { pixels: result, width: newWidth, height: newHeight };
}

/**
 * 임의 각도 회전 (Nearest-Neighbor 역방향 샘플링 기반 도트 보존)
 * @param pixels 원본 픽셀 배열
 * @param width 캔버스 가로 너비
 * @param height 캔버스 세로 높이
 * @param degrees 회전 각도 (도 단위, 시계 방향)
 */
export function filterRotateAngle(
  pixels: string[],
  width: number,
  height: number,
  degrees: number
): string[] {
  const normDeg = ((Math.round(degrees) % 360) + 360) % 360;
  if (normDeg === 0) return [...pixels];

  // 180도 정밀 반전
  if (normDeg === 180) {
    const result = new Array(width * height).fill('');
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        result[(height - 1 - y) * width + (width - 1 - x)] = pixels[y * width + x];
      }
    }
    return result;
  }

  // 90도 (정사각형일 때)
  if (normDeg === 90 && width === height) {
    const result = new Array(width * height).fill('');
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        result[x * width + (width - 1 - y)] = pixels[y * width + x];
      }
    }
    return result;
  }

  // 270도 (정사각형일 때)
  if (normDeg === 270 && width === height) {
    const result = new Array(width * height).fill('');
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        result[(height - 1 - x) * width + y] = pixels[y * width + x];
      }
    }
    return result;
  }

  const result = new Array(width * height).fill('');
  const rad = (-normDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;

  for (let y = 0; y < height; y++) {
    const dy = y - cy;
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const sx = Math.round(cx + dx * cos - dy * sin);
      const sy = Math.round(cy + dx * sin + dy * cos);

      if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
        result[y * width + x] = pixels[sy * width + sx] || '';
      }
    }
  }

  return result;
}

/**
 * 픽셀 이동 (Shift DX, DY)
 */
export function filterShift(pixels: string[], width: number, height: number, dx: number, dy: number): string[] {
  const result = new Array(width * height).fill('');
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        result[ny * width + nx] = pixels[y * width + x];
      }
    }
  }
  return result;
}
