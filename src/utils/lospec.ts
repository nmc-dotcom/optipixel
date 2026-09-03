import { PalettePreset } from '../types';

const HEX_COLOR_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

/**
 * 사용자가 입력한 값에서 Lospec 팔레트 슬러그를 뽑아낸다.
 * 슬러그("pico-8")와 전체 주소를 모두 받아들이며,
 * Lospec 팔레트 주소가 아니면 null을 반환한다.
 */
export function parseLospecSlug(raw: string): string | null {
  const slug = raw
    .trim()
    .replace(/^https?:\/\/(www\.)?lospec\.com\/palette-list\//i, '')
    .replace(/\.(json|csv)$/i, '')
    .replace(/[/?#].*$/, '')
    .trim()
    .toLowerCase();

  return /^[a-z0-9-]+$/.test(slug) ? slug : null;
}

/**
 * Lospec API 응답을 앱의 팔레트 형식으로 변환한다.
 * Lospec은 색상을 "#" 없이 돌려주므로 붙여준 뒤 hex 형식을 검증한다.
 * 유효한 색상이 하나도 없으면 null을 반환한다.
 */
export function toPaletteFromLospec(data: unknown, slug: string): PalettePreset | null {
  const raw = data as { name?: unknown; colors?: unknown };

  const colors = Array.isArray(raw?.colors)
    ? raw.colors
        .filter((c: unknown): c is string => typeof c === 'string')
        .map((c: string) => (c.startsWith('#') ? c : `#${c}`))
        .filter((c: string) => HEX_COLOR_RE.test(c))
    : [];

  if (colors.length === 0) return null;

  return {
    id: `custom-lospec-${slug}-${Date.now()}`,
    name: typeof raw?.name === 'string' && raw.name.trim() ? raw.name : slug,
    category: 'custom',
    colors,
  };
}

export const LOSPEC_PALETTE_URL = (slug: string) => `https://lospec.com/palette-list/${slug}.json`;
