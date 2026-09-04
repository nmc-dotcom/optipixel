export type ToolType =
  | 'brush'
  | 'eraser'
  | 'bucket'
  | 'picker'
  | 'line'
  | 'rect'
  | 'circle'
  | 'move'
  | 'select'
  | 'wand';

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

/**
 * 애니메이션 프레임. 자기만의 레이어 스택과 그룹을 소유한다.
 *
 * 예전에는 레이어 하나가 곧 프레임 하나였기 때문에 한 프레임 안에
 * 배경/캐릭터처럼 여러 레이어를 둘 수 없었다. 이제 레이어는 프레임에
 * 속하고, 타임라인은 프레임을, 레이어 패널은 활성 프레임의 레이어를 다룬다.
 */
export interface Frame {
  id: string;
  name: string;
  layers: Layer[];
  groups: LayerGroup[];
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
  frames: Frame[];
  width: number;
  height: number;
  description: string;
}

export type DitherType = 'none' | 'floyd-steinberg' | 'bayer4x4' | 'atkinson';

export type DownscaleMethod = 'edge-preserving' | 'dominant';

/** 이미지를 타겟 캔버스에 맞추는 방식. 'manual'은 사용자가 위치/크기를 직접 지정한다 */
export type ImageFitMode = 'fit' | 'stretch' | 'crop' | 'manual';

export interface ImageConversionSettings {
  targetWidth: number;
  targetHeight: number;
  fitMode: ImageFitMode;
  /** fitMode가 'manual'일 때 배치 배율 (%). 100 = 'fit' 기준 크기 */
  placementScale: number;
  /** fitMode가 'manual'일 때 이미지 좌상단의 캔버스 픽셀 좌표 (음수 = 캔버스 밖으로 밀림) */
  placementX: number;
  placementY: number;
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
