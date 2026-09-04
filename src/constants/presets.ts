import { PalettePreset } from '../types';

/** 캔버스 한 변의 최소 / 최대 픽셀 수 (커스텀 크기, 이미지 변환 타겟 공통) */
export const MIN_CANVAS_SIZE = 4;
export const MAX_CANVAS_SIZE = 256;

export const RESOLUTION_PRESETS = [
  { label: '8 × 8 (마이크로/아이콘)', width: 8, height: 8 },
  { label: '16 × 16 (레트로 스프라이트)', width: 16, height: 16 },
  { label: '24 × 24 (UI/뱃지)', width: 24, height: 24 },
  { label: '32 × 32 (표준 RPG 캐릭터)', width: 32, height: 32 },
  { label: '48 × 48 (디테일 스프라이트)', width: 48, height: 48 },
  { label: '64 × 64 (고해상도 도트)', width: 64, height: 64 },
  { label: '128 × 128 (대형 일러스트)', width: 128, height: 128 },
  { label: '256 × 256 (초대형 일러스트)', width: 256, height: 256 },
];

export const DEFAULT_PALETTES: PalettePreset[] = [
  {
    id: 'emerald-elegance',
    name: 'Emerald Executive',
    category: 'modern',
    colors: [
      '#064e3b', '#047857', '#059669', '#10b981', '#34d399', '#6ee7b7',
      '#0f172a', '#1e293b', '#334155', '#64748b', '#94a3b8', '#f8fafc',
      '#d97706', '#f59e0b', '#fbbf24', '#fef3c7', '#e11d48', '#8b5cf6',
    ],
  },
  {
    id: 'pico-8',
    name: 'PICO-8 (16색)',
    category: 'retro',
    colors: [
      '#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f',
      '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300', '#ffec27', '#00e436',
      '#29adff', '#83769c', '#ff77a8', '#ffccaa',
    ],
  },
  {
    id: 'gameboy',
    name: 'Game Boy Original (4색)',
    category: 'retro',
    colors: [
      '#0f380f', '#306230', '#8bac0f', '#9bbc0f',
    ],
  },
  {
    id: 'nes',
    name: 'NES Classic (32색)',
    category: 'retro',
    colors: [
      '#7c7c7c', '#0000fc', '#0000bc', '#4428bc', '#940084', '#a80020',
      '#a81000', '#881400', '#503000', '#007800', '#006800', '#005800',
      '#004058', '#000000', '#bcbcbc', '#0078f8', '#0058f8', '#6844fc',
      '#d800cc', '#e40058', '#f83800', '#e45c10', '#ac7c00', '#00b800',
      '#00a800', '#00a844', '#008888', '#f8b800', '#f8f8f8', '#3cbcfc',
      '#9878f8', '#f878f8',
    ],
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Neon',
    category: 'modern',
    colors: [
      '#050510', '#1b1b3a', '#3f1651', '#781c68', '#be1e2d', '#ff0055',
      '#ff5050', '#ffb800', '#ffee00', '#00ffcc', '#00d2ff', '#0066ff',
      '#2b00ff', '#8800ff', '#d900ff', '#ffffff',
    ],
  },
  {
    id: 'pastel',
    name: 'Pastel Kawaii',
    category: 'modern',
    colors: [
      '#ffe5ec', '#ffc2d1', '#ffb3c6', '#ff8fab', '#fb6f92', '#e8dff5',
      '#fce1e4', '#fcf4dd', '#ddfac8', '#c8facd', '#c8f7fa', '#c8e2fa',
      '#d2c8fa', '#f7c8fa', '#4a4e69', '#22223b',
    ],
  },
  {
    id: 'monochrome',
    name: 'Monochrome Shading',
    category: 'retro',
    colors: [
      '#000000', '#111111', '#222222', '#333333', '#444444', '#555555',
      '#666666', '#777777', '#888888', '#999999', '#aaaaaa', '#bbbbbb',
      '#cccccc', '#dddddd', '#eeeeee', '#ffffff',
    ],
  },
];

/**
 * 24x24 마법사/기사 캐릭터 기본 샘플 데이터 생성
 */
export function generateInitialPixels(width: number, height: number): string[] {
  const pixels: string[] = new Array(width * height).fill('');
  if (width < 16 || height < 16) return pixels;

  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);

  const setPixel = (x: number, y: number, color: string) => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      pixels[y * width + x] = color;
    }
  };

  // 16x16 레트로 슬라임/포션/캐릭터 픽셀아트 기본 렌더
  const offset = 4;
  // 외곽선 및 바디
  const outline = '#064e3b';
  const main = '#10b981';
  const highlight = '#6ee7b7';
  const dark = '#047857';
  const gold = '#fbbf24';
  const eye = '#0f172a';
  const shine = '#ffffff';

  // 아기자기한 에메랄드 크리스탈 슬라임
  const slimePattern = [
    { x: cx - 2, y: cy - 6, c: outline }, { x: cx - 1, y: cy - 6, c: outline }, { x: cx, y: cy - 6, c: outline }, { x: cx + 1, y: cy - 6, c: outline },
    { x: cx - 4, y: cy - 5, c: outline }, { x: cx - 3, y: cy - 5, c: main }, { x: cx - 2, y: cy - 5, c: highlight }, { x: cx - 1, y: cy - 5, c: highlight }, { x: cx, y: cy - 5, c: main }, { x: cx + 1, y: cy - 5, c: main }, { x: cx + 2, y: cy - 5, c: outline },
    { x: cx - 5, y: cy - 4, c: outline }, { x: cx - 4, y: cy - 4, c: highlight }, { x: cx - 3, y: cy - 4, c: shine }, { x: cx - 2, y: cy - 4, c: highlight }, { x: cx - 1, y: cy - 4, c: main }, { x: cx, y: cy - 4, c: main }, { x: cx + 1, y: cy - 4, c: main }, { x: cx + 2, y: cy - 4, c: main }, { x: cx + 3, y: cy - 4, c: outline },
    // 눈 위치
    { x: cx - 6, y: cy - 3, c: outline }, { x: cx - 5, y: cy - 3, c: highlight }, { x: cx - 4, y: cy - 3, c: highlight }, { x: cx - 3, y: cy - 3, c: eye }, { x: cx - 2, y: cy - 3, c: main }, { x: cx - 1, y: cy - 3, c: main }, { x: cx, y: cy - 3, c: eye }, { x: cx + 1, y: cy - 3, c: main }, { x: cx + 2, y: cy - 3, c: main }, { x: cx + 3, y: cy - 3, c: outline },
    { x: cx - 6, y: cy - 2, c: outline }, { x: cx - 5, y: cy - 2, c: main }, { x: cx - 4, y: cy - 2, c: eye }, { x: cx - 3, y: cy - 2, c: shine }, { x: cx - 2, y: cy - 2, c: main }, { x: cx - 1, y: cy - 2, c: eye }, { x: cx, y: cy - 2, c: shine }, { x: cx + 1, y: cy - 2, c: main }, { x: cx + 2, y: cy - 2, c: main }, { x: cx + 3, y: cy - 2, c: outline },
    // 볼터치와 미소
    { x: cx - 7, y: cy - 1, c: outline }, { x: cx - 6, y: cy - 1, c: main }, { x: cx - 5, y: cy - 1, c: '#fbbf24' }, { x: cx - 4, y: cy - 1, c: main }, { x: cx - 3, y: cy - 1, c: main }, { x: cx - 2, y: cy - 1, c: dark }, { x: cx - 1, y: cy - 1, c: main }, { x: cx, y: cy - 1, c: '#fbbf24' }, { x: cx + 1, y: cy - 1, c: main }, { x: cx + 2, y: cy - 1, c: dark }, { x: cx + 3, y: cy - 1, c: outline },
    { x: cx - 7, y: cy, c: outline }, { x: cx - 6, y: cy, c: main }, { x: cx - 5, y: cy, c: main }, { x: cx - 4, y: cy, c: main }, { x: cx - 3, y: cy, c: dark }, { x: cx - 2, y: cy, c: dark }, { x: cx - 1, y: cy, c: dark }, { x: cx, y: cy, c: main }, { x: cx + 1, y: cy, c: main }, { x: cx + 2, y: cy, c: dark }, { x: cx + 3, y: cy, c: outline },
    // 바닥 굴곡
    { x: cx - 6, y: cy + 1, c: outline }, { x: cx - 5, y: cy + 1, c: dark }, { x: cx - 4, y: cy + 1, c: dark }, { x: cx - 3, y: cy + 1, c: dark }, { x: cx - 2, y: cy + 1, c: dark }, { x: cx - 1, y: cy + 1, c: dark }, { x: cx, y: cy + 1, c: dark }, { x: cx + 1, y: cy + 1, c: dark }, { x: cx + 2, y: cy + 1, c: dark }, { x: cx + 3, y: cy + 1, c: outline },
    { x: cx - 5, y: cy + 2, c: outline }, { x: cx - 4, y: cy + 2, c: outline }, { x: cx - 3, y: cy + 2, c: outline }, { x: cx - 2, y: cy + 2, c: outline }, { x: cx - 1, y: cy + 2, c: outline }, { x: cx, y: cy + 2, c: outline }, { x: cx + 1, y: cy + 2, c: outline }, { x: cx + 2, y: cy + 2, c: outline },
    // 머리 위 골드 크라운
    { x: cx - 3, y: cy - 8, c: gold }, { x: cx - 1, y: cy - 8, c: gold }, { x: cx + 1, y: cy - 8, c: gold },
    { x: cx - 3, y: cy - 7, c: gold }, { x: cx - 2, y: cy - 7, c: gold }, { x: cx - 1, y: cy - 7, c: gold }, { x: cx, y: cy - 7, c: gold }, { x: cx + 1, y: cy - 7, c: gold },
  ];

  slimePattern.forEach(p => setPixel(p.x, p.y, p.c));
  return pixels;
}
