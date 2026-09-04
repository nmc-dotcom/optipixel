import { describe, expect, it } from 'vitest';
import {
  computeImagePlacement,
  createHexInterner,
  MAX_PLACEMENT_SCALE,
  MIN_PLACEMENT_SCALE,
} from './imageConverter';

describe('computeImagePlacement', () => {
  describe('자동 배치 (fit)', () => {
    it('가로가 긴 이미지는 폭을 채우고 위아래로 레터박스를 남긴다', () => {
      // 200x100 원본을 64x64 캔버스에 → 64x32, 세로 중앙
      expect(computeImagePlacement(200, 100, 64, 64)).toEqual({
        x: 0,
        y: 16,
        width: 64,
        height: 32,
      });
    });

    it('세로가 긴 이미지는 높이를 채우고 좌우로 필러박스를 남긴다', () => {
      expect(computeImagePlacement(100, 200, 64, 64)).toEqual({
        x: 16,
        y: 0,
        width: 32,
        height: 64,
      });
    });

    it('종횡비가 같으면 캔버스를 정확히 채운다', () => {
      expect(computeImagePlacement(512, 512, 32, 32)).toEqual({
        x: 0,
        y: 0,
        width: 32,
        height: 32,
      });
    });

    it('극단적인 비율에서도 한 변이 0이 되지 않는다', () => {
      const placement = computeImagePlacement(4000, 4, 32, 32);
      expect(placement.height).toBeGreaterThanOrEqual(1);
      expect(placement.width).toBe(32);
    });
  });

  describe('수동 배치 (manual)', () => {
    it('배율 100%는 fit 크기와 동일하고 오프셋만 사용자 값을 따른다', () => {
      const fit = computeImagePlacement(200, 100, 64, 64);
      const manual = computeImagePlacement(200, 100, 64, 64, {
        scale: 100,
        offsetX: 5,
        offsetY: -3,
      });
      expect(manual.width).toBe(fit.width);
      expect(manual.height).toBe(fit.height);
      expect(manual).toMatchObject({ x: 5, y: -3 });
    });

    it('배율을 올리면 fit 크기 기준으로 비례해 커진다', () => {
      expect(computeImagePlacement(100, 100, 64, 64, { scale: 200, offsetX: 0, offsetY: 0 }))
        .toMatchObject({ width: 128, height: 128 });
      expect(computeImagePlacement(100, 100, 64, 64, { scale: 50, offsetX: 0, offsetY: 0 }))
        .toMatchObject({ width: 32, height: 32 });
    });

    it('배율은 허용 범위 밖으로 나가지 않는다', () => {
      const tooSmall = computeImagePlacement(100, 100, 64, 64, { scale: 0, offsetX: 0, offsetY: 0 });
      const tooBig = computeImagePlacement(100, 100, 64, 64, { scale: 10000, offsetX: 0, offsetY: 0 });
      expect(tooSmall.width).toBe(Math.round(64 * (MIN_PLACEMENT_SCALE / 100)));
      expect(tooBig.width).toBe(Math.round(64 * (MAX_PLACEMENT_SCALE / 100)));
    });

    it('음수 배율에서도 한 변이 최소 1픽셀은 유지된다', () => {
      const placement = computeImagePlacement(100, 100, 8, 8, { scale: -50, offsetX: 0, offsetY: 0 });
      expect(placement.width).toBeGreaterThanOrEqual(1);
      expect(placement.height).toBeGreaterThanOrEqual(1);
    });

    it('소수 오프셋은 픽셀 격자에 맞춰 반올림된다', () => {
      expect(computeImagePlacement(100, 100, 64, 64, { scale: 100, offsetX: 3.6, offsetY: -2.4 }))
        .toMatchObject({ x: 4, y: -2 });
    });

    it('캔버스 밖 좌표도 그대로 돌려준다 (잘라내기는 변환 단계의 몫)', () => {
      expect(computeImagePlacement(100, 100, 64, 64, { scale: 100, offsetX: -80, offsetY: 200 }))
        .toMatchObject({ x: -80, y: 200 });
    });
  });
});

describe('createHexInterner', () => {
  it('같은 색은 항상 동일한 문자열 객체를 돌려준다', () => {
    const toHex = createHexInterner();
    const first = toHex(255, 128, 0);
    const second = toHex(255, 128, 0);
    // 값이 같은 게 아니라 참조가 같아야 픽셀 배열의 메모리가 실제로 줄어든다
    expect(second).toBe(first);
  });

  it('rgbaToHex와 같은 문자열을 만든다', () => {
    const toHex = createHexInterner();
    expect(toHex(255, 128, 0)).toBe('#ff8000');
    expect(toHex(0, 0, 0)).toBe('#000000');
  });

  it('소수 채널은 반올림해 같은 캐시 항목을 공유한다', () => {
    const toHex = createHexInterner();
    expect(toHex(17.4, 34.4, 51.4)).toBe(toHex(17, 34, 51));
  });

  it('범위를 벗어난 채널은 0~255로 클램프된다', () => {
    const toHex = createHexInterner();
    expect(toHex(-40, 300, 128)).toBe('#00ff80');
  });

  it('서로 다른 색은 구분한다', () => {
    const toHex = createHexInterner();
    expect(toHex(1, 2, 3)).not.toBe(toHex(3, 2, 1));
  });
});
