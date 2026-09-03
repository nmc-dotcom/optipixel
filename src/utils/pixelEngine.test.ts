import { describe, expect, it } from 'vitest';
import { clearRegion, copyRegion, hexToRgba, normalizeSelection, pasteRegion } from './pixelEngine';

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
