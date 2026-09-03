export type ToolType =
  | 'brush'
  | 'eraser'
  | 'bucket'
  | 'picker'
  | 'line'
  | 'rect'
  | 'circle'
  | 'move'
  | 'select';

/** 사각 선택 영역 (캔버스 픽셀 좌표) */
export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 복사/잘라내기한 픽셀 조각 */
export interface PixelClipboard {
  width: number;
  height: number;
  pixels: string[]; // 길이 = width * height
}

export interface LayerGroup {
  id: string;
  name: string;
  visible: boolean;
  collapsed: boolean;
}

export interface Layer {
  id: string;
  name: string;
  groupId?: string | null;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0.0 - 1.0
  pixels: string[]; // Length = width * height, stored as HEX ("#RRGGBB" or "#RRGGBBAA") or "" for transparent
}

export interface CanvasDimensions {
  width: number;
  height: number;
}

export interface PalettePreset {
  id: string;
  name: string;
  category: 'retro' | 'modern' | 'custom';
  colors: string[];
}

export interface HistoryStep {
  layers: Layer[];
  groups: LayerGroup[];
  width: number;
  height: number;
  description: string;
}

export type DitherType = 'none' | 'floyd-steinberg' | 'bayer4x4' | 'atkinson';

export type DownscaleMethod = 'edge-preserving' | 'dominant';

export interface ImageConversionSettings {
  targetWidth: number;
  targetHeight: number;
  fitMode: 'fit' | 'stretch' | 'crop';
  colorCount: number; // e.g. 4, 8, 16, 32, 64, 256 (0 = unlimited)
  useCurrentPalette: boolean;
  dither: DitherType;
  brightness: number; // -100 to 100
  contrast: number; // -100 to 100
  saturation: number; // -100 to 100
  edgePreservation: number; // 0 to 100 (Pyxelate-style edge magnitude preservation)
  cleanupOrphanPixels: boolean; // Filter isolated lone pixels
  downscaleMethod: DownscaleMethod; // 타일당 색상 결정 방식: 엣지 보존 블렌드 vs 도미넌트(최빈) 색상
  alphaThreshold: number; // 0-100. 이 값 미만의 타일 커버리지는 완전 투명으로 이진화
}

export type CodeExportFormat = 'css' | 'canvas' | 'svg' | 'js-matrix' | 'arduino-c';

export type StripeExportLayout = 'horizontal' | 'vertical' | 'grid';

export interface StripeExportSettings {
  layout: StripeExportLayout;
  columns?: number;
  scale: number;
  spacing: number;
  backgroundColor: string; // "transparent" or hex
  includeHiddenLayers: boolean;
}
