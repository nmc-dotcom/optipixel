import { describe, expect, it } from 'vitest';
import { removeBackgroundFromEdges, removeColorGlobally } from './filterEngine';
import { magicWandErase } from './pixelEngine';

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

  it('가장자리에 스치는 피사체 색을 배경으로 오인하지 않는다', () => {
    // 인물 사진처럼 피사체(B)가 왼쪽 가장자리에 걸쳐 있는 경우.
    // 가장자리를 지배하는 색(S)만 배경으로 봐야 하며,
    // 소수 지분인 B가 배경 표본이 되어 그림 전체를 지워버리면 안 된다.
    const rows = [
      'SSSSSS',
      'SSBBSS',
      'SSBBSS',
      'BSSSSS', // 피사체가 왼쪽 가장자리에 닿음
      'BSSSSS',
      'SSSSSS',
    ];
    const out = removeBackgroundFromEdges(parse(rows, map), 6, 6, 10);

    // 배경만 사라지고 피사체 6칸(가운데 4 + 가장자리 2)은 남는다
    expect(out.filter(c => c === BODY)).toHaveLength(6);
    expect(out.filter(c => c === SKY)).toHaveLength(0);
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

describe('magicWandErase', () => {
  const map = { S: SKY, s: SKY_DITHER, B: BODY };

  it('클릭한 지점과 이어진 같은 색 영역만 지운다', () => {
    const rows = ['SSSSS', 'SSBSS', 'SBBBS', 'SSBSS', 'SSSSS'];
    const out = magicWandErase(parse(rows, map), 5, 5, 0, 0, 10);

    expect(render(out, 5, 5, map)).toBe(['.....', '..B..', '.BBB.', '..B..', '.....'].join('\n'));
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

    expect(render(out, 3, 3, map)).toBe(['.BS', '.BS', '.BS'].join('\n'));
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
