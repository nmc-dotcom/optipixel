import { describe, expect, it } from 'vitest';
import { Layer } from '../types';
import { deserializeProject, ProjectState, serializeProject } from './projectStorage';

function makeLayer(id: string, w: number, h: number, fill: (x: number, y: number) => string): Layer {
  return {
    id,
    name: `레이어 ${id}`,
    groupId: null,
    visible: true,
    locked: false,
    opacity: 1,
    pixels: Array.from({ length: w * h }, (_, i) => fill(i % w, Math.floor(i / w))),
  };
}

function makeProject(w: number, h: number, layerCount: number): ProjectState {
  const palette = ['#10b981', '#064e3b', '#f8fafc'];
  return {
    width: w,
    height: h,
    activeLayerId: 'layer-0',
    groups: [],
    layers: Array.from({ length: layerCount }, (_, li) =>
      makeLayer(`layer-${li}`, w, h, (x, y) =>
        // 가운데에만 그림이 있고 나머지는 비어 있는, 실제 스프라이트와 비슷한 형태
        x > w / 3 && x < (w * 2) / 3 && y > h / 3 && y < (h * 2) / 3
          ? palette[(x + y + li) % palette.length]
          : ''
      )
    ),
  };
}

describe('serializeProject / deserializeProject', () => {
  it('모든 픽셀이 손실 없이 왕복한다', () => {
    const state = makeProject(32, 32, 4);
    const restored = deserializeProject(JSON.parse(JSON.stringify(serializeProject(state))));

    expect(restored).not.toBeNull();
    expect(restored!.width).toBe(32);
    expect(restored!.height).toBe(32);
    expect(restored!.layers).toHaveLength(4);
    for (let i = 0; i < state.layers.length; i++) {
      expect(restored!.layers[i].pixels).toEqual(state.layers[i].pixels);
    }
  });

  it('레이어 메타데이터를 보존한다', () => {
    const state = makeProject(8, 8, 1);
    state.layers[0] = { ...state.layers[0], name: '배경', visible: false, locked: true, opacity: 0.5 };

    const restored = deserializeProject(serializeProject(state))!;
    expect(restored.layers[0]).toMatchObject({
      name: '배경',
      visible: false,
      locked: true,
      opacity: 0.5,
    });
  });

  it('RLE로 원본 JSON보다 작게 압축한다', () => {
    const state = makeProject(64, 64, 8);
    const rawSize = JSON.stringify(state).length;
    const packedSize = JSON.stringify(serializeProject(state)).length;
    expect(packedSize).toBeLessThan(rawSize / 2);
  });
});

describe('deserializeProject 방어', () => {
  it('형식이 아닌 값은 거부한다', () => {
    expect(deserializeProject(null)).toBeNull();
    expect(deserializeProject({})).toBeNull();
    expect(deserializeProject('문자열')).toBeNull();
    expect(deserializeProject({ format: 'something-else', width: 8, height: 8, layers: [] })).toBeNull();
  });

  it('레이어가 없으면 거부한다', () => {
    const valid = serializeProject(makeProject(8, 8, 1));
    expect(deserializeProject({ ...valid, layers: [] })).toBeNull();
  });

  it('비상식적인 캔버스 크기는 거부한다', () => {
    const valid = serializeProject(makeProject(8, 8, 1));
    expect(deserializeProject({ ...valid, width: 9999, height: 9999 })).toBeNull();
    expect(deserializeProject({ ...valid, width: 0, height: 0 })).toBeNull();
  });

  it('과도한 RLE 반복 횟수를 캔버스 크기로 제한한다', () => {
    const valid = serializeProject(makeProject(8, 8, 1));
    const bomb = deserializeProject({
      ...valid,
      layers: [{ ...valid.layers[0], rle: [[1_000_000_000, '#ffffff']] }],
    });
    expect(bomb!.layers[0].pixels).toHaveLength(8 * 8);
  });

  it('RLE가 짧으면 남은 픽셀을 빈 값으로 채운다', () => {
    const valid = serializeProject(makeProject(8, 8, 1));
    const short = deserializeProject({
      ...valid,
      layers: [{ ...valid.layers[0], rle: [[2, '#ffffff']] }],
    });
    expect(short!.layers[0].pixels).toHaveLength(8 * 8);
    expect(short!.layers[0].pixels[63]).toBe('');
  });

  it('활성 레이어 id가 유효하지 않으면 실제 존재하는 레이어로 되돌린다', () => {
    const valid = serializeProject(makeProject(8, 8, 2));
    const restored = deserializeProject({ ...valid, activeLayerId: '존재하지-않음' })!;
    expect(restored.layers.some(l => l.id === restored.activeLayerId)).toBe(true);
  });
});
