import { describe, expect, it } from 'vitest';
import { createHistoryStep, MAX_HISTORY, pushHistoryStep } from './history';
import { Frame, Layer, LayerGroup } from '../types';

const makeLayer = (id: string, pixels: string[]): Layer => ({
  id,
  name: id,
  groupId: null,
  visible: true,
  locked: false,
  opacity: 1,
  pixels,
});

const groups: LayerGroup[] = [{ id: 'g1', name: '그룹', visible: true, collapsed: false }];

const makeFrame = (id: string, layers: Layer[], frameGroups: LayerGroup[] = groups): Frame => ({
  id,
  name: id,
  layers,
  groups: frameGroups,
});

describe('createHistoryStep', () => {
  it('픽셀 배열은 복사하지 않고 그대로 공유한다', () => {
    const pixels = ['#fff', '', '#000'];
    const step = createHistoryStep([makeFrame('f1', [makeLayer('a', pixels)])], 3, 1, '테스트');
    // 딥클론이 아니라 참조 공유여야 스냅샷 비용이 픽셀 수에 비례하지 않는다
    expect(step.frames[0].layers[0].pixels).toBe(pixels);
  });

  it('모든 프레임의 레이어를 담는다', () => {
    const step = createHistoryStep(
      [makeFrame('f1', [makeLayer('a', ['#fff'])]), makeFrame('f2', [makeLayer('b', ['#000']), makeLayer('c', [''])])],
      1, 1, '테스트'
    );
    expect(step.frames).toHaveLength(2);
    expect(step.frames[1].layers).toHaveLength(2);
  });

  it('프레임/레이어/그룹 객체 자체는 새로 만들어 이후 편집이 스냅샷에 새지 않는다', () => {
    const layer = makeLayer('a', ['#fff']);
    const frame = makeFrame('f1', [layer, makeLayer('b', ['#000'])]);
    const step = createHistoryStep([frame], 1, 1, '테스트');

    expect(step.frames[0]).not.toBe(frame);
    expect(step.frames[0].layers[0]).not.toBe(layer);
    expect(step.frames[0].groups[0]).not.toBe(groups[0]);

    // copy-on-write 규약대로 새 객체로 교체하는 편집은 스냅샷을 건드리지 않는다
    const edited = { ...layer, visible: false, pixels: ['#111'] };
    expect(step.frames[0].layers[0].visible).toBe(true);
    expect(step.frames[0].layers[0].pixels).toEqual(['#fff']);
    expect(edited.visible).toBe(false);
  });

  it('프레임 목록 배열도 분리되어 이후 추가/삭제가 스냅샷에 반영되지 않는다', () => {
    const frames = [makeFrame('f1', [makeLayer('a', ['#fff'])])];
    const step = createHistoryStep(frames, 1, 1, '테스트');
    frames.push(makeFrame('f2', [makeLayer('b', ['#000'])]));
    expect(step.frames).toHaveLength(1);
  });

  it('한 프레임의 레이어 목록을 바꿔도 다른 프레임 스냅샷은 그대로다', () => {
    const shared = ['#fff'];
    const step = createHistoryStep(
      [makeFrame('f1', [makeLayer('a', shared)]), makeFrame('f2', [makeLayer('b', shared)])],
      1, 1, '테스트'
    );
    expect(step.frames[0].layers).not.toBe(step.frames[1].layers);
    expect(step.frames[0].layers[0].pixels).toBe(step.frames[1].layers[0].pixels);
  });

  it('캔버스 크기와 설명을 함께 기록한다', () => {
    const step = createHistoryStep([], 64, 32, '브러시 그리기');
    expect(step).toMatchObject({ width: 64, height: 32, description: '브러시 그리기' });
  });
});

describe('pushHistoryStep', () => {
  const step = (desc: string) => createHistoryStep([], 8, 8, desc);

  it('새 단계를 뒤에 쌓는다', () => {
    const past = pushHistoryStep(pushHistoryStep([], step('첫번째')), step('두번째'));
    expect(past.map(s => s.description)).toEqual(['첫번째', '두번째']);
  });

  it('입력 배열을 변형하지 않는다', () => {
    const past = [step('첫번째')];
    pushHistoryStep(past, step('두번째'));
    expect(past).toHaveLength(1);
  });

  it('한도를 넘으면 가장 오래된 단계부터 버린다', () => {
    let past = pushHistoryStep([], step('버려질 것'), 3);
    past = pushHistoryStep(past, step('두번째'), 3);
    past = pushHistoryStep(past, step('세번째'), 3);
    past = pushHistoryStep(past, step('네번째'), 3);

    expect(past).toHaveLength(3);
    expect(past.map(s => s.description)).toEqual(['두번째', '세번째', '네번째']);
  });

  it('기본 한도는 MAX_HISTORY다', () => {
    let past: ReturnType<typeof step>[] = [];
    for (let i = 0; i < MAX_HISTORY + 10; i++) {
      past = pushHistoryStep(past, step(`단계 ${i}`));
    }
    expect(past).toHaveLength(MAX_HISTORY);
    expect(past[past.length - 1].description).toBe(`단계 ${MAX_HISTORY + 9}`);
  });
});
