import { describe, expect, it } from 'vitest';
import { removeBackgroundFromEdges, removeColorGlobally } from './filterEngine';

const SKY = '#87ceeb';
const SKY_DITHER = '#7ec4e0'; // 하늘과 거리 30 (디더링 수준)
const BODY = '#f5c9a0'; // 하늘과 거리가 먼 피사체 색

/** 격자 문자열을 픽셀 배열로 (. = 투명) */
function parse(rows: string[], map: Record<string, string>): string[] {
  return rows.flatMap(row => [...row].map(ch => (ch === '.' ? '' : map[ch])));
}

function render(pixels: string[], w: number, h: number, map: Record<string, string>): string {
  const reverse = new Map(Object.entries(map).map(([k, v]) => [v, k]));
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => {
      const c = pixels[y * w + x];
      return c === '' ? '.' : reverse.get(c) ?? '?';
    }).join('')
  ).join('\n');
}

describe('removeBackgroundFromEdges', () => {
  const map = { S: SKY, s: SKY_DITHER, B: BODY };

  it('가장자리에 닿은 배경을 지우고 피사체는 남긴다', () => {
    const rows = ['SSSSS', 'SSBSS', 'SBBBS', 'SSBSS', 'SSSSS'];
    const out = removeBackgroundFromEdges(parse(rows, map), 5, 5, 10);

    expect(render(out, 5, 5, map)).toBe(['.....', '..B..', '.BBB.', '..B..', '.....'].join('\n'));
  });

  it('허용 오차 안의 디더링된 배경도 함께 지운다', () => {
    // 배경이 두 색으로 디더링된 경우 (거리 30)
    const rows = ['SsSsS', 'sSBSs', 'SBBBS', 'sSBSs', 'SsSsS'];
    const out = removeBackgroundFromEdges(parse(rows, map), 5, 5, 20); // 20% = 거리 60

    expect(out.filter(c => c === SKY || c === SKY_DITHER)).toHaveLength(0);
    expect(out.filter(c => c === BODY)).toHaveLength(5);
  });

  it('허용 오차가 0이면 가장자리와 정확히 같은 색만 지운다', () => {
    // 가장자리는 전부 S. 안쪽 s는 S와 거리 30이라 오차 0에서는 배경이 아니다.
    const rows = ['SSSSS', 'SsBsS', 'SSBSS', 'SsBsS', 'SSSSS'];
    const out = removeBackgroundFromEdges(parse(rows, map), 5, 5, 0);

    expect(render(out, 5, 5, map)).toBe(['.....', '.sBs.', '..B..', '.sBs.', '.....'].join('\n'));
  });

  it('같은 그림이라도 허용 오차를 올리면 비슷한 배경색까지 지운다', () => {
    const rows = ['SSSSS', 'SsBsS', 'SSBSS', 'SsBsS', 'SSSSS'];
    const out = removeBackgroundFromEdges(parse(rows, map), 5, 5, 20); // 20% = 거리 60 > 30

    expect(render(out, 5, 5, map)).toBe(['.....', '..B..', '..B..', '..B..', '.....'].join('\n'));
  });

  it('피사체 안쪽에 갇힌 배경색은 남긴다 (가장자리와 이어지지 않음)', () => {
    // 가운데 S는 피사체로 완전히 둘러싸여 가장자리와 연결되지 않는다
    const rows = ['SSSSS', 'SBBBS', 'SBSBS', 'SBBBS', 'SSSSS'];
    const out = removeBackgroundFromEdges(parse(rows, map), 5, 5, 10);

    expect(render(out, 5, 5, map)).toBe(['.....', '.BBB.', '.BSB.', '.BBB.', '.....'].join('\n'));
  });

  it('대각선으로만 이어진 배경은 새어 나가지 않는다 (4방향 탐색)', () => {
    // 가운데 S는 상하좌우가 모두 피사체(B)로 막혀 있고, 바깥 배경과는 대각선으로만 닿아 있다.
    // 8방향 탐색이었다면 지워졌겠지만 4방향이므로 남아야 한다.
    const rows = ['SSSSS', 'SSBSS', 'SBSBS', 'SSBSS', 'SSSSS'];
    const out = removeBackgroundFromEdges(parse(rows, map), 5, 5, 10);

    expect(render(out, 5, 5, map)).toBe(['.....', '..B..', '.BSB.', '..B..', '.....'].join('\n'));
  });

  it('이미 전부 투명한 이미지는 그대로 둔다', () => {
    const empty = Array.from({ length: 9 }, () => '');
    expect(removeBackgroundFromEdges(empty, 3, 3, 20)).toEqual(empty);
  });

  it('원본 배열을 변경하지 않는다', () => {
    const rows = ['SSS', 'SBS', 'SSS'];
    const input = parse(rows, map);
    removeBackgroundFromEdges(input, 3, 3, 10);
    expect(input.filter(c => c === SKY)).toHaveLength(8);
  });
});

describe('removeColorGlobally', () => {
  it('위치와 무관하게 같은 색을 모두 지운다', () => {
    // 피사체에 둘러싸인 배경색까지 지워진다
    const pixels = [SKY, BODY, SKY, BODY, SKY, BODY, SKY, BODY, SKY];
    const out = removeColorGlobally(pixels, SKY, 10);

    expect(out.filter(c => c === SKY)).toHaveLength(0);
    expect(out.filter(c => c === BODY)).toHaveLength(4);
  });

  it('허용 오차 안의 비슷한 색도 지운다', () => {
    const pixels = [SKY, SKY_DITHER, BODY];
    expect(removeColorGlobally(pixels, SKY, 20)).toEqual(['', '', BODY]);
  });

  it('허용 오차가 낮으면 비슷한 색을 남긴다', () => {
    const pixels = [SKY, SKY_DITHER, BODY];
    expect(removeColorGlobally(pixels, SKY, 1)).toEqual(['', SKY_DITHER, BODY]);
  });

  it('대상 색이 없으면 아무것도 지우지 않는다', () => {
    const pixels = [SKY, BODY];
    expect(removeColorGlobally(pixels, '', 50)).toEqual(pixels);
  });
});
