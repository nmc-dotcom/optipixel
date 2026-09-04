import { HistoryStep, Layer, LayerGroup } from '../types';

/** 보관하는 실행취소 단계 수 */
export const MAX_HISTORY = 35;

/**
 * 히스토리에 담을 상태 스냅샷을 만든다.
 *
 * 레이어/그룹 객체는 새로 만들지만 `pixels` 배열은 **원본과 공유한다**.
 * 에디터의 모든 픽셀 편집 경로가 기존 배열을 그 자리에서 고치지 않고 새 배열로
 * 교체하는(copy-on-write) 규약을 지키므로, 배열을 공유해도 과거 스냅샷이
 * 나중 편집에 오염되지 않는다. 반대로 이 규약을 깨고 `layer.pixels[i] = ...`
 * 처럼 제자리 수정을 도입하면 실행취소가 조용히 망가진다.
 *
 * 공유 덕분에 스냅샷 비용이 픽셀 수가 아니라 레이어 수에 비례한다.
 * (JSON 왕복 딥클론을 쓰던 이전 구현은 256×256·5레이어 기준 스냅샷 하나마다
 * 30만 개가 넘는 문자열을 새로 만들었고, 그것을 35단계까지 붙들고 있었다.)
 */
export function createHistoryStep(
  layers: Layer[],
  groups: LayerGroup[],
  width: number,
  height: number,
  description: string
): HistoryStep {
  return {
    layers: layers.map(layer => ({ ...layer })),
    groups: groups.map(group => ({ ...group })),
    width,
    height,
    description,
  };
}

/** 스냅샷을 쌓고, 한도를 넘으면 가장 오래된 단계부터 버린다 */
export function pushHistoryStep(
  past: HistoryStep[],
  step: HistoryStep,
  limit: number = MAX_HISTORY
): HistoryStep[] {
  const updated = [...past, step];
  return updated.length > limit ? updated.slice(updated.length - limit) : updated;
}
