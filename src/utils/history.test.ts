import { describe, expect, it } from 'vitest';
import { createHistoryStep, MAX_HISTORY, pushHistoryStep } from './history';
import { Layer, LayerGroup } from '../types';

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

describe('createHistoryStep', () => {
  it('픽셀 배열은 복사하지 않고 그대로 공유한다', () => {
    const pixels = ['#fff', '', '#000'];
    const step = createHistoryStep([makeLayer('a', pixels)], groups, 3, 1, '테스트');
    // 딥클론이 아니라 참조 공유여야 스냅샷 비용이 픽셀 수에 비례하지 않는다
    expect(step.layers[0].pixels).toBe(pixels);
  });

  it('레이어/그룹 객체 자체는 새로 만들어 이후 편집이 스냅샷에 새지 않는다', () => {
    const layer = makeLayer('a', ['#fff']);
    const step = createHistoryStep([layer, makeLayer('b', ['#000'])], groups, 1, 1, '테스트');

    expect(step.layers[0]).not.toBe(layer);
    expect(step.groups[0]).not.toBe(groups[0]);

    // copy-on-write 규약대로 새 객체로 교체하는 편집은 스냅샷을 건드리지 않는다
    const edited = { ...layer, visible: false, pixels: ['#111'] };
    expect(step.layers[0].visible).toBe(true);
    expect(step.layers[0].pixels).toEqual(['#fff']);
    expect(edited.visible).toBe(false);
  });

  it('레이어 목록 배열도 분리되어 이후 추가/삭제가 스냅샷에 반영되지 않는다', () => {
    const layers = [makeLayer('a', ['#fff'])];
    const step = createHistoryStep(layers, groups, 1, 1, '테스트');
    layers.push(makeLayer('b', ['#000']));
    expect(step.layers).toHaveLength(1);
  });

  it('캔버스 크기와 설명을 함께 기록한다', () => {
    const step = createHistoryStep([], [], 64, 32, '브러시 그리기');
    expect(step).toMatchObject({ width: 64, height: 32, description: '브러시 그리기' });
  });
});

describe('pushHistoryStep', () => {
  const step = (desc: string) => createHistoryStep([], [], 8, 8, desc);

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
