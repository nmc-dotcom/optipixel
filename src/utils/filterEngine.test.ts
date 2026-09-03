import { describe, expect, it } from 'vitest';
import { filterGenerateOutline } from './filterEngine';

const OUTLINE = '#ff0000';
const BODY = '#ffffff';

/** 픽셀 배열을 사람이 읽을 수 있는 격자 문자열로 (. 투명 / W 몸통 / O 외곽선) */
function render(pixels: string[], w: number, h: number): string {
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => {
      const c = pixels[y * w + x];
      if (!c) return '.';
      return c === OUTLINE ? 'O' : 'W';
    }).join('')
  ).join('\n');
}

describe('filterGenerateOutline', () => {
  it('픽셀 하나를 8방향으로 둘러싼다', () => {
    const w = 5;
    const h = 5;
    const pixels = Array.from({ length: w * h }, (_, i) => (i === 12 ? BODY : ''));

    expect(render(filterGenerateOutline(pixels, w, h, OUTLINE), w, h)).toBe(
      ['.....', '.OOO.', '.OWO.', '.OOO.', '.....'].join('\n')
    );
  });

  it('기존 픽셀을 덮어쓰지 않는다', () => {
    const w = 3;
    const h = 3;
    const pixels = Array.from({ length: w * h }, () => BODY);
    // 전부 채워져 있으면 외곽선이 들어갈 투명 픽셀이 없다
    expect(filterGenerateOutline(pixels, w, h, OUTLINE)).toEqual(pixels);
  });

  it('캔버스 가장자리에 붙은 스프라이트도 경계를 넘지 않는다', () => {
    const w = 3;
    const h = 3;
    const pixels = Array.from({ length: w * h }, (_, i) => (i === 0 ? BODY : ''));

    // (0,0)의 이웃 중 캔버스 안쪽인 (1,0) (0,1) (1,1)만 칠해진다
    expect(render(filterGenerateOutline(pixels, w, h, OUTLINE), w, h)).toBe(
      ['WO.', 'OO.', '...'].join('\n')
    );
  });

  it('빈 캔버스는 그대로 둔다', () => {
    const pixels = Array.from({ length: 9 }, () => '');
    expect(filterGenerateOutline(pixels, 3, 3, OUTLINE)).toEqual(pixels);
  });

  it('지정한 색으로 외곽선을 그린다', () => {
    const w = 3;
    const h = 3;
    const pixels = Array.from({ length: w * h }, (_, i) => (i === 4 ? BODY : ''));
    const out = filterGenerateOutline(pixels, w, h, '#123456');

    expect(out.filter(c => c === '#123456')).toHaveLength(8);
    expect(out[4]).toBe(BODY);
  });

  it('원본 배열을 변경하지 않는다', () => {
    const w = 3;
    const h = 3;
    const pixels = Array.from({ length: w * h }, (_, i) => (i === 4 ? BODY : ''));
    filterGenerateOutline(pixels, w, h, OUTLINE);
    expect(pixels.filter(c => c !== '')).toEqual([BODY]);
  });

  it('한 번에 1px만 확장한다 (연쇄 확장 없음)', () => {
    const w = 7;
    const h = 7;
    const pixels = Array.from({ length: w * h }, (_, i) => (i === 24 ? BODY : ''));
    const out = filterGenerateOutline(pixels, w, h, OUTLINE);

    // 3x3 링(8칸)만 칠해져야 하고, 그 바깥 5x5 링까지 번지면 안 된다
    expect(out.filter(c => c === OUTLINE)).toHaveLength(8);
  });
});
