import { describe, expect, it } from 'vitest';
import {
  clearRegion,
  copyRegion,
  hexToRgba,
  magicWandErase,
  normalizeSelection,
  pasteRegion,
} from './pixelEngine';

/** 4x4 캔버스. 각 칸에 자기 인덱스를 색상처럼 넣어 어느 좌표에서 왔는지 추적한다. */
const W = 4;
const H = 4;
const grid = () => Array.from({ length: W * H }, (_, i) => `#${i.toString(16).padStart(6, '0')}`);

describe('normalizeSelection', () => {
  it('정방향 드래그를 사각 영역으로 변환한다', () => {
    expect(normalizeSelection(2, 2, 4, 5, 10, 10)).toEqual({ x: 2, y: 2, width: 3, height: 4 });
  });

  it('역방향으로 드래그해도 같은 영역이 된다', () => {
    expect(normalizeSelection(4, 5, 2, 2, 10, 10)).toEqual(normalizeSelection(2, 2, 4, 5, 10, 10));
  });

  it('한 점만 클릭하면 1x1 영역이다', () => {
    expect(normalizeSelection(3, 3, 3, 3, 10, 10)).toEqual({ x: 3, y: 3, width: 1, height: 1 });
  });

  it('캔버스 밖으로 넘친 드래그는 경계로 잘린다', () => {
    expect(normalizeSelection(-5, -5, 99, 99, 10, 10)).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });

  it('오른쪽 아래 끝 픽셀까지 포함한다', () => {
    expect(normalizeSelection(8, 8, 20, 20, 10, 10)).toEqual({ x: 8, y: 8, width: 2, height: 2 });
  });
});

describe('copyRegion', () => {
  it('영역 안의 픽셀을 올바른 좌표에서 가져온다', () => {
    // (1,1)=5, (2,1)=6, (1,2)=9, (2,2)=10
    const clip = copyRegion(grid(), W, { x: 1, y: 1, width: 2, height: 2 });
    expect(clip).toEqual({
      width: 2,
      height: 2,
      pixels: ['#000005', '#000006', '#000009', '#00000a'],
    });
  });
});

describe('clearRegion', () => {
  it('영역 안만 비우고 바깥은 유지한다', () => {
    const cleared = clearRegion(grid(), W, { x: 1, y: 1, width: 2, height: 2 });
    expect([cleared[5], cleared[6], cleared[9], cleared[10]]).toEqual(['', '', '', '']);
    expect([cleared[0], cleared[4], cleared[7], cleared[15]]).toEqual([
      '#000000',
      '#000004',
      '#000007',
      '#00000f',
    ]);
  });

  it('원본 배열을 변경하지 않는다', () => {
    const original = grid();
    clearRegion(original, W, { x: 1, y: 1, width: 2, height: 2 });
    expect(original[5]).toBe('#000005');
  });
});

describe('pasteRegion', () => {
  const clip = copyRegion(grid(), W, { x: 1, y: 1, width: 2, height: 2 });
  const empty = () => Array.from({ length: W * H }, () => '');

  it('지정한 위치에 붙여넣는다', () => {
    const pasted = pasteRegion(empty(), W, H, clip, 0, 0);
    expect([pasted[0], pasted[1], pasted[4], pasted[5]]).toEqual([
      '#000005',
      '#000006',
      '#000009',
      '#00000a',
    ]);
  });

  it('캔버스 밖으로 넘치는 부분은 잘라낸다', () => {
    const pasted = pasteRegion(empty(), W, H, clip, 3, 3);
    expect(pasted[15]).toBe('#000005');
    expect(pasted.filter(c => c !== '')).toHaveLength(1);
  });

  it('음수 좌표에 붙여넣어도 안전하게 잘린다', () => {
    const pasted = pasteRegion(empty(), W, H, clip, -1, -1);
    expect(pasted.filter(c => c !== '')).toHaveLength(1);
    expect(pasted[0]).toBe('#00000a'); // 조각의 (1,1)이 캔버스 (0,0)에 온다
  });

  it('조각의 투명한 부분은 아래 픽셀을 지우지 않는다', () => {
    const base = Array.from({ length: W * H }, () => '#ffffff');
    const holed = pasteRegion(base, W, H, { width: 2, height: 1, pixels: ['', '#123456'] }, 0, 0);
    expect([holed[0], holed[1]]).toEqual(['#ffffff', '#123456']);
  });
});

describe('hexToRgba', () => {
  it('#RRGGBB를 불투명 색으로 변환한다', () => {
    expect(hexToRgba('#10b981')).toEqual({ r: 0x10, g: 0xb9, b: 0x81, a: 1 });
  });

  it('3자리 축약형을 확장한다', () => {
    expect(hexToRgba('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  it('빈 문자열과 잘못된 값은 투명으로 처리한다', () => {
    expect(hexToRgba('')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(hexToRgba('#zzzzzz')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it('캐시된 결과를 반환해도 값이 동일하다', () => {
    // 캐시는 같은 객체를 공유하므로, 호출자가 변형하지 않는 한 값이 같아야 한다
    expect(hexToRgba('#abcdef')).toEqual(hexToRgba('#abcdef'));
  });
});

const SKY = '#87ceeb';
const SKY_DITHER = '#7ec4e0'; // 하늘과 거리 30 (디더링 수준)
const BODY = '#f5c9a0'; // 하늘과 거리가 먼 피사체 색

/** 격자 문자열을 픽셀 배열로 (. = 투명) */
function parse(rows: string[], map: Record<string, string>): string[] {
  return rows.flatMap(row => [...row].map(ch => (ch === '.' ? '' : map[ch])));
}

function renderGrid(pixels: string[], w: number, h: number, map: Record<string, string>): string {
  const reverse = new Map(Object.entries(map).map(([k, v]) => [v, k]));
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => {
      const c = pixels[y * w + x];
      return c === '' ? '.' : reverse.get(c) ?? '?';
    }).join('')
  ).join('\n');
}

describe('magicWandErase', () => {
  const map = { S: SKY, s: SKY_DITHER, B: BODY };

  it('클릭한 지점과 이어진 같은 색 영역만 지운다', () => {
    const rows = ['SSSSS', 'SSBSS', 'SBBBS', 'SSBSS', 'SSSSS'];
    const out = magicWandErase(parse(rows, map), 5, 5, 0, 0, 10);

    expect(renderGrid(out, 5, 5, map)).toBe(['.....', '..B..', '.BBB.', '..B..', '.....'].join('\n'));
  });

  it('피사체가 가장자리에 닿아 있어도 안전하다 (자동 제거와 달리 사용자가 배경을 직접 지목)', () => {
    // 피사체 B가 왼쪽 가장자리에 걸쳐 있는 상황.
    // 배경(3,0)을 클릭하면 배경만 사라지고 피사체는 온전히 남는다.
    const rows = ['SSSSS', 'BBSSS', 'BBSSS', 'SSSSS'];
    const out = magicWandErase(parse(rows, map), 5, 4, 3, 0, 10);

    expect(out.filter(c => c === BODY)).toHaveLength(4);
    expect(out.filter(c => c === SKY)).toHaveLength(0);
  });

  it('허용 오차 안의 비슷한 색까지 이어서 지운다', () => {
    const rows = ['SsSsS', 'sSBSs', 'SBBBS'];
    const out = magicWandErase(parse(rows, map), 5, 3, 0, 0, 20);

    expect(out.filter(c => c === SKY || c === SKY_DITHER)).toHaveLength(0);
    expect(out.filter(c => c === BODY)).toHaveLength(4);
  });

  it('허용 오차가 0이면 정확히 같은 색만 따라간다', () => {
    const rows = ['SsS', 'SSS'];
    const out = magicWandErase(parse(rows, map), 3, 2, 0, 0, 0);

    // 클릭한 S와 정확히 같은 색만 사라지고, 사이에 낀 s는 남는다
    expect(out.filter(c => c === SKY_DITHER)).toHaveLength(1);
  });

  it('떨어져 있는 같은 색은 건드리지 않는다', () => {
    // 왼쪽 S 덩어리와 오른쪽 S 덩어리가 피사체로 완전히 분리되어 있다
    const rows = ['SBS', 'SBS', 'SBS'];
    const out = magicWandErase(parse(rows, map), 3, 3, 0, 0, 10);

    expect(renderGrid(out, 3, 3, map)).toBe(['.BS', '.BS', '.BS'].join('\n'));
  });

  it('이미 투명한 곳을 클릭하면 아무 일도 하지 않는다', () => {
    const pixels = ['', BODY, ''];
    expect(magicWandErase(pixels, 3, 1, 0, 0, 20)).toEqual(pixels);
  });

  it('캔버스 밖 좌표는 무시한다', () => {
    const pixels = [SKY, SKY, SKY, SKY];
    expect(magicWandErase(pixels, 2, 2, 5, 5, 20)).toEqual(pixels);
    expect(magicWandErase(pixels, 2, 2, -1, 0, 20)).toEqual(pixels);
  });

  it('원본 배열을 변경하지 않는다', () => {
    const input = parse(['SS', 'SS'], map);
    magicWandErase(input, 2, 2, 0, 0, 10);
    expect(input.filter(c => c === SKY)).toHaveLength(4);
  });
});
