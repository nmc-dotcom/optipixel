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

const PALETTE = ['#10b981', '#064e3b', '#f8fafc'];

/** 가운데에만 그림이 있고 나머지는 비어 있는, 실제 스프라이트와 비슷한 레이어 */
function makeSpriteLayer(id: string, w: number, h: number, seed: number): Layer {
  return makeLayer(id, w, h, (x, y) =>
    x > w / 3 && x < (w * 2) / 3 && y > h / 3 && y < (h * 2) / 3
      ? PALETTE[(x + y + seed) % PALETTE.length]
      : ''
  );
}

function makeProject(w: number, h: number, layerCount: number, frameCount: number = 1): ProjectState {
  const frames = Array.from({ length: frameCount }, (_, fi) => ({
    id: `frame-${fi}`,
    name: `프레임 ${fi + 1}`,
    groups: [],
    layers: Array.from({ length: layerCount }, (_, li) =>
      makeSpriteLayer(`layer-${fi}-${li}`, w, h, fi * 7 + li)
    ),
  }));

  return {
    width: w,
    height: h,
    activeFrameId: frames[0].id,
    activeLayerId: frames[0].layers[0].id,
    frames,
  };
}

/** version 1 형식(레이어 = 프레임)의 파일을 만든다 */
function makeLegacyFile(w: number, h: number, layerCount: number) {
  const state = makeProject(w, h, layerCount);
  const packed = serializeProject(state);
  return {
    format: packed.format,
    version: 1,
    width: w,
    height: h,
    activeLayerId: packed.frames[0].layers[0].id,
    groups: [],
    layers: packed.frames[0].layers,
    savedAt: packed.savedAt,
  };
}

describe('serializeProject / deserializeProject', () => {
  it('모든 픽셀이 손실 없이 왕복한다', () => {
    const state = makeProject(32, 32, 4);
    const restored = deserializeProject(JSON.parse(JSON.stringify(serializeProject(state))));

    expect(restored).not.toBeNull();
    expect(restored!.width).toBe(32);
    expect(restored!.height).toBe(32);
    expect(restored!.frames).toHaveLength(1);
    expect(restored!.frames[0].layers).toHaveLength(4);
    for (let i = 0; i < state.frames[0].layers.length; i++) {
      expect(restored!.frames[0].layers[i].pixels).toEqual(state.frames[0].layers[i].pixels);
    }
  });

  it('여러 프레임과 각 프레임의 레이어 스택을 모두 보존한다', () => {
    const state = makeProject(16, 16, 3, 4);
    const restored = deserializeProject(JSON.parse(JSON.stringify(serializeProject(state))))!;

    expect(restored.frames).toHaveLength(4);
    restored.frames.forEach((frame, fi) => {
      expect(frame.name).toBe(state.frames[fi].name);
      expect(frame.layers).toHaveLength(3);
      frame.layers.forEach((layer, li) => {
        expect(layer.pixels).toEqual(state.frames[fi].layers[li].pixels);
      });
    });
  });

  it('활성 프레임을 기억한다', () => {
    const state = makeProject(8, 8, 1, 3);
    state.activeFrameId = 'frame-2';
    state.activeLayerId = state.frames[2].layers[0].id;

    const restored = deserializeProject(serializeProject(state))!;
    expect(restored.activeFrameId).toBe('frame-2');
    expect(restored.activeLayerId).toBe(state.frames[2].layers[0].id);
  });

  it('레이어 메타데이터를 보존한다', () => {
    const state = makeProject(8, 8, 1);
    state.frames[0].layers[0] = { ...state.frames[0].layers[0], name: '배경', visible: false, locked: true, opacity: 0.5 };

    const restored = deserializeProject(serializeProject(state))!;
    expect(restored.frames[0].layers[0]).toMatchObject({
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
    expect(deserializeProject({ format: 'something-else', width: 8, height: 8, frames: [] })).toBeNull();
  });

  it('프레임이 없으면 거부한다', () => {
    const valid = serializeProject(makeProject(8, 8, 1));
    expect(deserializeProject({ ...valid, frames: [] })).toBeNull();
  });

  it('레이어가 하나도 없는 프레임은 버린다', () => {
    const valid = serializeProject(makeProject(8, 8, 1, 2));
    const restored = deserializeProject({
      ...valid,
      frames: [{ ...valid.frames[0], layers: [] }, valid.frames[1]],
    })!;
    expect(restored.frames).toHaveLength(1);
    expect(restored.frames[0].id).toBe(valid.frames[1].id);
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
      frames: [{ ...valid.frames[0], layers: [{ ...valid.frames[0].layers[0], rle: [[1_000_000_000, '#ffffff']] }] }],
    });
    expect(bomb!.frames[0].layers[0].pixels).toHaveLength(8 * 8);
  });

  it('RLE가 짧으면 남은 픽셀을 빈 값으로 채운다', () => {
    const valid = serializeProject(makeProject(8, 8, 1));
    const short = deserializeProject({
      ...valid,
      frames: [{ ...valid.frames[0], layers: [{ ...valid.frames[0].layers[0], rle: [[2, '#ffffff']] }] }],
    });
    expect(short!.frames[0].layers[0].pixels).toHaveLength(8 * 8);
    expect(short!.frames[0].layers[0].pixels[63]).toBe('');
  });

  it('활성 레이어 id가 유효하지 않으면 실제 존재하는 레이어로 되돌린다', () => {
    const valid = serializeProject(makeProject(8, 8, 2));
    const restored = deserializeProject({ ...valid, activeLayerId: '존재하지-않음' })!;
    const active = restored.frames.find(f => f.id === restored.activeFrameId)!;
    expect(active.layers.some(l => l.id === restored.activeLayerId)).toBe(true);
  });

  it('활성 프레임 id가 유효하지 않으면 첫 프레임으로 되돌린다', () => {
    const valid = serializeProject(makeProject(8, 8, 1, 3));
    const restored = deserializeProject({ ...valid, activeFrameId: '존재하지-않음' })!;
    expect(restored.activeFrameId).toBe(restored.frames[0].id);
  });
});

describe('version 1 파일 마이그레이션', () => {
  it('레이어 목록을 프레임 한 장의 레이어 스택으로 옮긴다', () => {
    const legacy = makeLegacyFile(16, 16, 3);
    const restored = deserializeProject(legacy)!;

    // 예전 파일에서 레이어는 캔버스에 함께 합성되어 보이던 것이므로,
    // 프레임으로 흩어 놓지 않고 한 프레임 안에 그대로 쌓아 화면을 보존한다
    expect(restored.frames).toHaveLength(1);
    expect(restored.frames[0].layers).toHaveLength(3);
  });

  it('픽셀과 레이어 메타데이터를 잃지 않는다', () => {
    const legacy = makeLegacyFile(8, 8, 2);
    legacy.layers[1] = { ...legacy.layers[1], name: '배경', visible: false, opacity: 0.25 };

    const restored = deserializeProject(legacy)!;
    expect(restored.frames[0].layers[1]).toMatchObject({ name: '배경', visible: false, opacity: 0.25 });
    expect(restored.frames[0].layers[0].pixels).toHaveLength(8 * 8);
  });

  it('예전 그룹 정보를 그 프레임의 그룹으로 옮긴다', () => {
    const legacy = makeLegacyFile(8, 8, 1);
    legacy.groups = [{ id: 'g1', name: '캐릭터', visible: true, collapsed: false }];

    const restored = deserializeProject(legacy)!;
    expect(restored.frames[0].groups).toEqual([
      { id: 'g1', name: '캐릭터', visible: true, collapsed: false },
    ]);
  });

  it('예전 활성 레이어 선택을 이어받는다', () => {
    const legacy = makeLegacyFile(8, 8, 3);
    legacy.activeLayerId = legacy.layers[2].id;

    const restored = deserializeProject(legacy)!;
    expect(restored.activeLayerId).toBe(legacy.layers[2].id);
    expect(restored.activeFrameId).toBe(restored.frames[0].id);
  });

  it('레이어가 비어 있는 예전 파일은 거부한다', () => {
    const legacy = makeLegacyFile(8, 8, 1);
    expect(deserializeProject({ ...legacy, layers: [] })).toBeNull();
  });
});
