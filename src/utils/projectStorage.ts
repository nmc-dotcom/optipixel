import { Frame, Layer, LayerGroup } from '../types';

const STORAGE_PROJECT_KEY = 'optipixel_project';
const PROJECT_FORMAT = 'optipixel-project';
/**
 * 2 = 프레임이 레이어를 소유하는 형식.
 * 1은 레이어 하나가 곧 프레임 하나였다 (deserializeProject가 자동 변환한다).
 */
const PROJECT_VERSION = 2;

/** [반복 횟수, 색상] 쌍의 배열로 픽셀을 런-렝스 압축한 형태 */
type RlePixels = Array<[number, string]>;

interface SerializedLayer {
  id: string;
  name: string;
  groupId?: string | null;
  visible: boolean;
  locked: boolean;
  opacity: number;
  rle: RlePixels;
}

interface SerializedFrame {
  id: string;
  name: string;
  groups: LayerGroup[];
  layers: SerializedLayer[];
}

export interface ProjectFile {
  format: typeof PROJECT_FORMAT;
  version: number;
  width: number;
  height: number;
  activeFrameId: string;
  activeLayerId: string;
  frames: SerializedFrame[];
  savedAt: string;
}

/** version 1 파일의 형태 (레이어 = 프레임) */
interface LegacyProjectFile {
  activeLayerId?: unknown;
  groups?: unknown;
  layers?: unknown;
}

/** 저장/복원 시 주고받는 프로젝트 상태 */
export interface ProjectState {
  width: number;
  height: number;
  activeFrameId: string;
  activeLayerId: string;
  frames: Frame[];
}

/**
 * 픽셀 배열을 런-렝스 압축한다.
 * 픽셀 아트는 같은 색(특히 빈 픽셀)이 길게 이어지므로 압축률이 매우 높다.
 */
function encodePixels(pixels: string[]): RlePixels {
  const out: RlePixels = [];
  let i = 0;
  while (i < pixels.length) {
    const color = pixels[i] || '';
    let count = 1;
    while (i + count < pixels.length && (pixels[i + count] || '') === color) {
      count++;
    }
    out.push([count, color]);
    i += count;
  }
  return out;
}

/** 런-렝스 압축된 픽셀을 원래 배열로 복원한다 (길이는 expectedLength에 맞춰 보정) */
function decodePixels(rle: RlePixels, expectedLength: number): string[] {
  const out: string[] = [];
  for (const entry of rle) {
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    const [count, color] = entry;
    if (typeof count !== 'number' || count <= 0 || typeof color !== 'string') continue;
    // 손상된 데이터가 과도한 메모리를 잡지 않도록 상한을 둔다
    const safeCount = Math.min(count, expectedLength - out.length);
    for (let i = 0; i < safeCount; i++) out.push(color);
    if (out.length >= expectedLength) break;
  }
  while (out.length < expectedLength) out.push('');
  return out;
}

function serializeLayer(layer: Layer): SerializedLayer {
  return {
    id: layer.id,
    name: layer.name,
    groupId: layer.groupId ?? null,
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
    rle: encodePixels(layer.pixels),
  };
}

export function serializeProject(state: ProjectState): ProjectFile {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    width: state.width,
    height: state.height,
    activeFrameId: state.activeFrameId,
    activeLayerId: state.activeLayerId,
    frames: state.frames.map(frame => ({
      id: frame.id,
      name: frame.name,
      groups: frame.groups,
      layers: frame.layers.map(serializeLayer),
    })),
    savedAt: new Date().toISOString(),
  };
}

/**
 * 외부에서 들어온 데이터(파일/로컬 저장소)를 검증하며 프로젝트 상태로 복원한다.
 * 형식이 맞지 않으면 null을 반환한다.
 */
/** 직렬화된 레이어 목록을 검증하며 복원한다 (형식이 깨진 항목은 건너뛴다) */
function decodeLayers(raw: unknown, pixelCount: number): Layer[] {
  if (!Array.isArray(raw)) return [];
  const layers: Layer[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const l = item as Partial<SerializedLayer>;
    if (typeof l.id !== 'string' || typeof l.name !== 'string') continue;
    if (!Array.isArray(l.rle)) continue;

    layers.push({
      id: l.id,
      name: l.name,
      groupId: typeof l.groupId === 'string' ? l.groupId : null,
      visible: l.visible !== false,
      locked: l.locked === true,
      opacity: typeof l.opacity === 'number' ? Math.max(0, Math.min(1, l.opacity)) : 1,
      pixels: decodePixels(l.rle, pixelCount),
    });
  }

  return layers;
}

function decodeGroups(raw: unknown): LayerGroup[] {
  return Array.isArray(raw)
    ? raw.filter((g): g is LayerGroup =>
        !!g &&
        typeof g === 'object' &&
        typeof (g as LayerGroup).id === 'string' &&
        typeof (g as LayerGroup).name === 'string'
      )
    : [];
}

/**
 * version 1 파일을 현재 형식으로 올린다.
 *
 * 예전에는 레이어 목록이 그대로 프레임 목록이기도 해서, 어느 쪽 의도로 만든
 * 파일인지 데이터만 보고는 알 수 없다. 캔버스에 보이던 그림(= 모든 레이어를
 * 합성한 결과)이 그대로 유지되는 쪽을 택해, 전체를 레이어 스택 하나를 가진
 * 프레임 한 장으로 옮긴다. 애니메이션으로 쓰던 파일이라면 프레임들이 한 장에
 * 겹쳐 들어오므로, 타임라인에서 레이어를 프레임으로 나눠주면 된다.
 */
function migrateLegacyProject(raw: LegacyProjectFile, pixelCount: number): Frame[] {
  const layers = decodeLayers(raw.layers, pixelCount);
  if (layers.length === 0) return [];

  return [{
    id: 'frame-1',
    name: '프레임 1',
    groups: decodeGroups(raw.groups),
    layers,
  }];
}

export function deserializeProject(data: unknown): ProjectState | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as Partial<ProjectFile> & LegacyProjectFile;

  if (raw.format !== PROJECT_FORMAT) return null;
  if (typeof raw.width !== 'number' || typeof raw.height !== 'number') return null;
  if (raw.width < 1 || raw.height < 1 || raw.width > 512 || raw.height > 512) return null;

  const pixelCount = raw.width * raw.height;
  const frames: Frame[] = [];

  if (Array.isArray(raw.frames)) {
    for (const item of raw.frames) {
      if (!item || typeof item !== 'object') continue;
      const f = item as Partial<SerializedFrame>;
      if (typeof f.id !== 'string') continue;

      const layers = decodeLayers(f.layers, pixelCount);
      if (layers.length === 0) continue;

      frames.push({
        id: f.id,
        name: typeof f.name === 'string' ? f.name : `프레임 ${frames.length + 1}`,
        groups: decodeGroups(f.groups),
        layers,
      });
    }
  } else {
    frames.push(...migrateLegacyProject(raw, pixelCount));
  }

  if (frames.length === 0) return null;

  const activeFrame =
    frames.find(f => f.id === raw.activeFrameId) ?? frames[0];
  const activeLayerId =
    typeof raw.activeLayerId === 'string' && activeFrame.layers.some(l => l.id === raw.activeLayerId)
      ? raw.activeLayerId
      : activeFrame.layers[activeFrame.layers.length - 1].id;

  return {
    width: raw.width,
    height: raw.height,
    activeFrameId: activeFrame.id,
    activeLayerId,
    frames,
  };
}

/**
 * 현재 작업물을 로컬 저장소에 자동 저장한다.
 * 용량 초과 등으로 실패하면 false를 반환한다 (호출측에서 사용자에게 안내).
 */
export function saveProjectToStorage(state: ProjectState): boolean {
  try {
    localStorage.setItem(STORAGE_PROJECT_KEY, JSON.stringify(serializeProject(state)));
    return true;
  } catch {
    return false;
  }
}

export function loadProjectFromStorage(): ProjectState | null {
  try {
    const saved = localStorage.getItem(STORAGE_PROJECT_KEY);
    if (!saved) return null;
    return deserializeProject(JSON.parse(saved));
  } catch {
    return null;
  }
}

export function clearStoredProject(): void {
  try {
    localStorage.removeItem(STORAGE_PROJECT_KEY);
  } catch {
    // 저장소 접근 불가 시 무시
  }
}

/** 프로젝트를 .json 파일로 내려받는다 */
export function downloadProjectFile(state: ProjectState, fileName = 'optipixel-project.json'): void {
  const blob = new Blob([JSON.stringify(serializeProject(state))], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** 사용자가 고른 .json 파일을 프로젝트 상태로 읽어온다 */
export function readProjectFile(file: File): Promise<ProjectState> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = deserializeProject(JSON.parse(reader.result as string));
        if (!parsed) {
          reject(new Error('optipixel 프로젝트 파일 형식이 아닙니다.'));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new Error('파일을 읽을 수 없습니다 (손상되었거나 JSON이 아닙니다).'));
      }
    };
    reader.onerror = () => reject(new Error('파일을 읽는 중 오류가 발생했습니다.'));
    reader.readAsText(file);
  });
}
