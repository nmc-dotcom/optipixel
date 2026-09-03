export type ToolType = 
  | 'brush' 
  | 'eraser' 
  | 'bucket' 
  | 'picker' 
  | 'line' 
  | 'rect' 
  | 'circle' 
  | 'move';

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
