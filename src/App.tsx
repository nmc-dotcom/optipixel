import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  CanvasDimensions,
  Frame,
  HistoryStep,
  Layer,
  LayerGroup,
  PalettePreset,
  PixelClipboard,
  SelectionRect,
  ToolType
} from './types';
import { X } from 'lucide-react';
import { DEFAULT_PALETTES, generateInitialPixels } from './constants/presets';
import { blendPixelArrays, clearRegion, copyRegion, flattenLayers, pasteRegion } from './utils/pixelEngine';
import {
  downloadProjectFile,
  loadProjectFromStorage,
  ProjectState,
  readProjectFile,
  saveProjectToStorage,
} from './utils/projectStorage';
import { Navbar } from './components/Navbar';
import { Toolbar } from './components/Toolbar';
import { ColorPalettePanel } from './components/ColorPalettePanel';
import { LayersPanel } from './components/LayersPanel';
import { PixelCanvas } from './components/PixelCanvas';
import { SpriteTimeline } from './components/SpriteTimeline';
import { ImageToPixelModal } from './components/ImageToPixelModal';
import { CanvasSizeModal } from './components/CanvasSizeModal';
import { ExportModal } from './components/ExportModal';
import { CodeExportModal } from './components/CodeExportModal';
import { FiltersModal } from './components/FiltersModal';
import { createHistoryStep, pushHistoryStep } from './utils/history';

const STORAGE_PALETTES_KEY = 'optipixel_custom_palettes';

export default function App() {
  // 0. 이전 세션에서 자동 저장된 작업물 복원 (없으면 null)
  const [restored] = useState<ProjectState | null>(() => loadProjectFromStorage());

  // 1. 캔버스 차원 및 데이터 상태
  const [dimensions, setDimensions] = useState<CanvasDimensions>(
    restored ? { width: restored.width, height: restored.height } : { width: 24, height: 24 }
  );
  const [frames, setFrames] = useState<Frame[]>(() => {
    if (restored) return restored.frames;
    return [{
      id: 'frame-1',
      name: '프레임 1',
      groups: [],
      layers: [{
        id: 'layer-base',
        name: '레이어 1 (메인)',
        groupId: null,
        visible: true,
        locked: false,
        opacity: 1.0,
        pixels: generateInitialPixels(24, 24),
      }],
    }];
  });
  const [activeFrameId, setActiveFrameId] = useState<string>(restored?.activeFrameId ?? 'frame-1');
  const [activeLayerId, setActiveLayerId] = useState<string>(restored?.activeLayerId ?? 'layer-base');

  // 활성 프레임. 프레임이 사라진 뒤에도 화면이 깨지지 않도록 첫 프레임으로 되돌린다.
  const activeFrame = frames.find(f => f.id === activeFrameId) ?? frames[0];
  const layers = activeFrame.layers;
  const groups = activeFrame.groups;

  /**
   * 활성 프레임의 레이어 목록만 바꾼다.
   *
   * 레이어를 다루는 기존 핸들러들이 프레임 구조를 몰라도 되도록 setLayers와
   * 같은 모양을 유지한다. 바뀌지 않은 프레임과 레이어의 pixels 배열은 그대로
   * 공유되므로 실행취소 스냅샷의 copy-on-write 규약도 유지된다.
   */
  const setLayers = useCallback((update: Layer[] | ((prev: Layer[]) => Layer[])) => {
    setFrames(prev => prev.map(frame =>
      frame.id === activeFrameId
        ? { ...frame, layers: typeof update === 'function' ? update(frame.layers) : update }
        : frame
    ));
  }, [activeFrameId]);

  const setGroups = useCallback((update: LayerGroup[] | ((prev: LayerGroup[]) => LayerGroup[])) => {
    setFrames(prev => prev.map(frame =>
      frame.id === activeFrameId
        ? { ...frame, groups: typeof update === 'function' ? update(frame.groups) : update }
        : frame
    ));
  }, [activeFrameId]);

  // 2. Undo / Redo 실행 취소 스택
  const [historyPast, setHistoryPast] = useState<HistoryStep[]>([]);
  const [historyFuture, setHistoryFuture] = useState<HistoryStep[]>([]);

  // 3. 툴바 & 브러시 상태
  const [currentTool, setCurrentTool] = useState<ToolType>('brush');
  const [brushSize, setBrushSize] = useState<number>(1);
  const [fillShape, setFillShape] = useState<boolean>(false);
  const [horizontalSymmetry, setHorizontalSymmetry] = useState<boolean>(false);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  // 마술봉 허용 오차 (0~100). 변환된 사진의 디더링된 배경을 한 번에 잡도록 20%를 기본으로 둔다.
  const [wandTolerance, setWandTolerance] = useState<number>(20);
  const [zoom, setZoom] = useState<number>(16);

  // 4. 팔레트 및 색상 상태
  const [primaryColor, setPrimaryColor] = useState<string>('#10b981');
  const [secondaryColor, setSecondaryColor] = useState<string>('#064e3b');
  const [activePalette, setActivePalette] = useState<PalettePreset>(DEFAULT_PALETTES[0]);
  const [customPalettes, setCustomPalettes] = useState<PalettePreset[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PALETTES_KEY);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((p: unknown): p is PalettePreset =>
        !!p && typeof p === 'object'
        && typeof (p as PalettePreset).id === 'string'
        && typeof (p as PalettePreset).name === 'string'
        && Array.isArray((p as PalettePreset).colors)
        && (p as PalettePreset).colors.every((c) => typeof c === 'string')
      );
    } catch {
      return [];
    }
  });

  // 4-B. 선택 영역 & 픽셀 클립보드
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const [clipboard, setClipboard] = useState<PixelClipboard | null>(null);

  // 5. 모바일 사이드 시트 탭
  const [activeMobileTab, setActiveMobileTab] = useState<'none' | 'layers' | 'palette'>('none');

  // 6. 모달 오픈 상태
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
  const [isSizeModalOpen, setIsSizeModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);

  // 7. 스프라이트 애니메이션 & 어니언 스킨 상태
  const [onionSkinEnabled, setOnionSkinEnabled] = useState<boolean>(false);

  /**
   * 좁은 화면에서 도구 막대는 화면 아래에 떠 있어 흐름에서 빠져 있고, 그대로 두면
   * 그 아래 내용(타임라인, 상태바)을 덮는다. 줄바꿈 때문에 높이가 달라지므로
   * 상수로 비워두면 어긋난다 — 실제 높이를 재서 그만큼 셸 바닥을 비운다.
   * 데스크탑에서는 막대가 흐름 안에 있으므로(position: static) 0이 된다.
   */
  const [floatingToolbarInset, setFloatingToolbarInset] = useState(0);

  useEffect(() => {
    const el = document.getElementById('floating-toolbar');
    if (!el) return;

    const update = () => {
      const isFloating = window.getComputedStyle(el).position === 'fixed';
      setFloatingToolbarInset(isFloating ? Math.ceil(el.getBoundingClientRect().height) + 24 : 0);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  // 이전 프레임을 합성한 잔상 픽셀 (첫 프레임에서는 없음)
  const onionSkinPixels = useMemo(() => {
    if (!onionSkinEnabled) return null;
    const activeIdx = frames.findIndex(f => f.id === activeFrame.id);
    const previous = frames[activeIdx - 1];
    if (!previous) return null;
    return flattenLayers(previous.layers, previous.groups, dimensions.width, dimensions.height);
  }, [frames, activeFrame.id, onionSkinEnabled, dimensions.width, dimensions.height]);

  // 작업물 자동 저장 (편집이 멈춘 뒤 1초 후 저장 — 그리는 동안 매번 직렬화하지 않도록 디바운스)
  const autosaveWarnedRef = useRef(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const ok = saveProjectToStorage({
        width: dimensions.width,
        height: dimensions.height,
        activeFrameId: activeFrame.id,
        activeLayerId,
        frames,
      });
      // 용량 초과 등으로 저장에 실패하면 한 번만 경고를 띄운다
      if (!ok && !autosaveWarnedRef.current) {
        autosaveWarnedRef.current = true;
        alert(
          '작업물 자동 저장에 실패했습니다 (브라우저 저장 공간 부족일 수 있습니다).\n' +
          '작업 내용을 잃지 않으려면 상단의 "프로젝트 저장" 버튼으로 파일에 저장해주세요.'
        );
      }
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, [frames, activeFrame.id, dimensions, activeLayerId]);

  // 프로젝트를 파일로 내보내기
  const handleExportProject = () => {
    downloadProjectFile({
      width: dimensions.width,
      height: dimensions.height,
      activeFrameId: activeFrame.id,
      activeLayerId,
      frames,
    });
  };

  // 프로젝트 파일 불러오기 (현재 작업물을 덮어쓰므로 확인 후 진행)
  const handleImportProject = async (file: File) => {
    if (!window.confirm('현재 작업물을 불러온 프로젝트로 교체할까요? 저장하지 않은 변경사항은 사라집니다.')) {
      return;
    }
    try {
      const project = await readProjectFile(file);
      setFrames(project.frames);
      setDimensions({ width: project.width, height: project.height });
      setActiveFrameId(project.activeFrameId);
      setActiveLayerId(project.activeLayerId);
      // 다른 프로젝트를 연 뒤의 실행취소는 의미가 없으므로 히스토리를 비운다
      setHistoryPast([]);
      setHistoryFuture([]);
    } catch (err) {
      alert(err instanceof Error ? err.message : '프로젝트를 불러오지 못했습니다.');
    }
  };

  // 커스텀 팔레트 로컬 저장소 동기화
  const handleSaveCustomPalette = (newPalette: PalettePreset) => {
    setCustomPalettes(prev => {
      const filtered = prev.filter(p => p.id !== newPalette.id);
      const updated = [...filtered, newPalette];
      try {
        localStorage.setItem(STORAGE_PALETTES_KEY, JSON.stringify(updated));
      } catch (err) {
        console.error(err);
      }
      return updated;
    });
  };

  const handleDeleteCustomPalette = (id: string) => {
    setCustomPalettes(prev => {
      const updated = prev.filter(p => p.id !== id);
      try {
        localStorage.setItem(STORAGE_PALETTES_KEY, JSON.stringify(updated));
      } catch (err) {
        console.error(err);
      }
      return updated;
    });
    if (activePalette.id === id) {
      setActivePalette(DEFAULT_PALETTES[0]);
    }
  };

  /**
   * 스냅샷의 상태로 되돌린다.
   * 스냅샷에 없는 프레임/레이어를 가리키고 있을 수 있으므로 선택도 함께 보정한다.
   */
  const restoreHistoryStep = useCallback((step: HistoryStep) => {
    setFrames(step.frames);
    setDimensions({ width: step.width, height: step.height });

    const frame = step.frames.find(f => f.id === activeFrameId) ?? step.frames[0];
    if (!frame) return;
    if (frame.id !== activeFrameId) setActiveFrameId(frame.id);
    if (!frame.layers.some(l => l.id === activeLayerId)) {
      setActiveLayerId(frame.layers[frame.layers.length - 1].id);
    }
  }, [activeFrameId, activeLayerId]);

  // 히스토리 스냅샷 푸시
  const pushHistory = useCallback((desc: string = '변경') => {
    setHistoryPast(prev =>
      pushHistoryStep(prev, createHistoryStep(frames, dimensions.width, dimensions.height, desc))
    );
    setHistoryFuture([]);
  }, [frames, dimensions]);

  // 실행 취소 (Undo)
  const handleUndo = useCallback(() => {
    if (historyPast.length === 0) return;

    const previousStep = historyPast[historyPast.length - 1];
    const currentStep = createHistoryStep(frames, dimensions.width, dimensions.height, '되돌리기 전');

    setHistoryFuture(prev => [currentStep, ...prev]);
    setHistoryPast(prev => prev.slice(0, prev.length - 1));

    restoreHistoryStep(previousStep);
  }, [historyPast, frames, dimensions, restoreHistoryStep]);

  // 다시 실행 (Redo)
  const handleRedo = useCallback(() => {
    if (historyFuture.length === 0) return;

    const nextStep = historyFuture[0];
    const currentStep = createHistoryStep(frames, dimensions.width, dimensions.height, '다시 실행 전');

    setHistoryPast(prev => pushHistoryStep(prev, currentStep));
    setHistoryFuture(prev => prev.slice(1));

    restoreHistoryStep(nextStep);
  }, [historyFuture, frames, dimensions, restoreHistoryStep]);

  // 단축키 이벤트 리스너 (Undo, Redo, Tools)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 모달 입력창 등 focus 시 무시
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        handleDuplicateLayer(activeLayerId);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setIsExportModalOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleCopySelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        handleCutSelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        handlePasteClipboard();
      } else if (e.key === 'Escape') {
        setSelection(null);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        // 선택 영역이 있으면 그 안의 픽셀만 지우고, 없을 때만 레이어 삭제로 넘어간다
        if (selection) {
          e.preventDefault();
          handleDeleteSelection();
        } else if (layers.length > 1) {
          const target = layers.find(l => l.id === activeLayerId);
          if (target && window.confirm(`"${target.name}" 레이어를 삭제할까요?`)) {
            handleDeleteLayer(activeLayerId);
          }
        }
      } else if (selection && e.key.startsWith('Arrow')) {
        // 선택 영역이 있을 때만 방향키로 영역과 픽셀을 함께 이동
        e.preventDefault();
        const step = e.shiftKey ? 8 : 1;
        if (e.key === 'ArrowLeft') handleNudgeSelection(-step, 0);
        else if (e.key === 'ArrowRight') handleNudgeSelection(step, 0);
        else if (e.key === 'ArrowUp') handleNudgeSelection(0, -step);
        else if (e.key === 'ArrowDown') handleNudgeSelection(0, step);
      } else if (e.key === '[') {
        setBrushSize(prev => Math.max(1, prev - 1));
      } else if (e.key === ']') {
        setBrushSize(prev => Math.min(4, prev + 1));
      } else {
        switch (e.key.toLowerCase()) {
          case 'b': setCurrentTool('brush'); break;
          case 'e': setCurrentTool('eraser'); break;
          case 'g': setCurrentTool('bucket'); break;
          case 'i': setCurrentTool('picker'); break;
          case 'l': setCurrentTool('line'); break;
          case 'u': setCurrentTool('rect'); break;
          case 'c': setCurrentTool('circle'); break;
          case 'm': setCurrentTool('move'); break;
          case 's': setCurrentTool('select'); break;
          case 'w': setCurrentTool('wand'); break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, layers, activeLayerId, selection, clipboard, dimensions]);

  // 레이어 픽셀 업데이트
  const handleUpdateLayerPixels = (
    layerId: string,
    newPixels: string[],
    recordHistory: boolean = false,
    description: string = '픽셀 편집'
  ) => {
    if (recordHistory) {
      pushHistory(description);
    }

    setLayers(prev => prev.map(layer => {
      if (layer.id === layerId) {
        return { ...layer, pixels: newPixels };
      }
      return layer;
    }));
  };

  // --- 선택 영역 조작 ---

  /** 편집 가능한(잠기지 않은) 활성 레이어를 반환. 없으면 null */
  const getEditableActiveLayer = (): Layer | null => {
    const layer = layers.find(l => l.id === activeLayerId);
    if (!layer || layer.locked) return null;
    return layer;
  };

  const handleCopySelection = () => {
    const layer = layers.find(l => l.id === activeLayerId);
    if (!layer || !selection) return;
    setClipboard(copyRegion(layer.pixels, dimensions.width, selection));
  };

  const handleDeleteSelection = () => {
    const layer = getEditableActiveLayer();
    if (!layer || !selection) return;
    handleUpdateLayerPixels(
      layer.id,
      clearRegion(layer.pixels, dimensions.width, selection),
      true,
      '선택 영역 지우기'
    );
  };

  const handleCutSelection = () => {
    const layer = getEditableActiveLayer();
    if (!layer || !selection) return;
    setClipboard(copyRegion(layer.pixels, dimensions.width, selection));
    handleUpdateLayerPixels(
      layer.id,
      clearRegion(layer.pixels, dimensions.width, selection),
      true,
      '선택 영역 잘라내기'
    );
  };

  const handlePasteClipboard = () => {
    const layer = getEditableActiveLayer();
    if (!layer || !clipboard) return;

    // 선택 영역이 있으면 그 위치에, 없으면 캔버스 좌상단에 붙여넣는다
    const destX = selection ? selection.x : 0;
    const destY = selection ? selection.y : 0;

    handleUpdateLayerPixels(
      layer.id,
      pasteRegion(layer.pixels, dimensions.width, dimensions.height, clipboard, destX, destY),
      true,
      '붙여넣기'
    );

    // 붙여넣은 영역을 그대로 선택 상태로 만들어 바로 이동할 수 있게 한다
    setSelection({
      x: destX,
      y: destY,
      width: Math.min(clipboard.width, dimensions.width - destX),
      height: Math.min(clipboard.height, dimensions.height - destY),
    });
  };

  /** 선택 영역과 그 안의 픽셀을 함께 이동 (방향키) */
  const handleNudgeSelection = (dx: number, dy: number) => {
    const layer = getEditableActiveLayer();
    if (!layer || !selection) return;

    const destX = Math.max(0, Math.min(dimensions.width - selection.width, selection.x + dx));
    const destY = Math.max(0, Math.min(dimensions.height - selection.height, selection.y + dy));
    if (destX === selection.x && destY === selection.y) return;

    const lifted = copyRegion(layer.pixels, dimensions.width, selection);
    const cleared = clearRegion(layer.pixels, dimensions.width, selection);
    const moved = pasteRegion(cleared, dimensions.width, dimensions.height, lifted, destX, destY);

    handleUpdateLayerPixels(layer.id, moved, true, '선택 영역 이동');
    setSelection({ ...selection, x: destX, y: destY });
  };

  // 캔버스 크기가 바뀌면 기존 선택 영역은 범위를 벗어날 수 있으므로 해제한다
  useEffect(() => {
    setSelection(null);
  }, [dimensions.width, dimensions.height]);

  // 레이어 추가
  const handleAddLayer = (groupId?: string | null) => {
    pushHistory('새 레이어 추가');
    const newId = `layer-${Date.now()}`;
    const newLayer: Layer = {
      id: newId,
      name: `레이어 ${layers.length + 1}`,
      groupId: groupId || null,
      visible: true,
      locked: false,
      opacity: 1.0,
      pixels: new Array(dimensions.width * dimensions.height).fill(''),
    };
    setLayers(prev => [...prev, newLayer]);
    setActiveLayerId(newId);
  };

  // --- 프레임 관리 ---

  /**
   * 프레임을 전환한다. 레이어는 프레임마다 독립적이므로 활성 레이어도 옮겨야 한다.
   * 같은 id가 없으면 같은 순번의 레이어를 고른다 — 프레임을 복제해 이어 그릴 때
   * 방금까지 그리던 위치를 그대로 유지해준다.
   */
  const handleSelectFrame = (frameId: string) => {
    const frame = frames.find(f => f.id === frameId);
    if (!frame || frame.layers.length === 0) return;

    setActiveFrameId(frameId);
    if (frame.layers.some(l => l.id === activeLayerId)) return;

    const currentIdx = layers.findIndex(l => l.id === activeLayerId);
    const next = frame.layers[currentIdx] ?? frame.layers[frame.layers.length - 1];
    setActiveLayerId(next.id);
  };

  /** 빈 프레임을 활성 프레임 뒤에 추가한다 */
  const handleAddFrame = () => {
    pushHistory('프레임 추가');
    const stamp = Date.now();
    const newLayer: Layer = {
      id: `layer-${stamp}`,
      name: '레이어 1',
      groupId: null,
      visible: true,
      locked: false,
      opacity: 1.0,
      pixels: new Array(dimensions.width * dimensions.height).fill(''),
    };
    const newFrame: Frame = {
      id: `frame-${stamp}`,
      name: `프레임 ${frames.length + 1}`,
      groups: [],
      layers: [newLayer],
    };

    setFrames(prev => {
      const idx = prev.findIndex(f => f.id === activeFrameId);
      const next = [...prev];
      next.splice(idx + 1, 0, newFrame);
      return next;
    });
    setActiveFrameId(newFrame.id);
    setActiveLayerId(newLayer.id);
  };

  /** 프레임을 레이어 스택째 복제한다 (애니메이션에서 이전 장을 이어 그릴 때) */
  const handleDuplicateFrame = (id: string) => {
    const target = frames.find(f => f.id === id);
    if (!target) return;
    pushHistory('프레임 복제');

    const stamp = Date.now();
    const cloned: Frame = {
      id: `frame-${stamp}`,
      name: `${target.name} (복사본)`,
      groups: target.groups.map(g => ({ ...g })),
      // pixels는 편집 시 새 배열로 교체되므로 참조를 공유해도 안전하다
      layers: target.layers.map((layer, i) => ({ ...layer, id: `layer-${stamp}-${i}` })),
    };

    setFrames(prev => {
      const idx = prev.findIndex(f => f.id === id);
      const next = [...prev];
      next.splice(idx + 1, 0, cloned);
      return next;
    });
    setActiveFrameId(cloned.id);

    // 복제 전에 그리던 레이어와 같은 순번을 이어서 선택
    const currentIdx = target.layers.findIndex(l => l.id === activeLayerId);
    const nextLayer = cloned.layers[currentIdx] ?? cloned.layers[cloned.layers.length - 1];
    setActiveLayerId(nextLayer.id);
  };

  const handleDeleteFrame = (id: string) => {
    if (frames.length <= 1) return;
    pushHistory('프레임 삭제');

    const idx = frames.findIndex(f => f.id === id);
    const remaining = frames.filter(f => f.id !== id);
    setFrames(remaining);

    if (activeFrameId === id) {
      const fallback = remaining[Math.min(idx, remaining.length - 1)];
      setActiveFrameId(fallback.id);
      setActiveLayerId(fallback.layers[fallback.layers.length - 1].id);
    }
  };

  const handleMoveFrame = (id: string, direction: 'left' | 'right') => {
    const idx = frames.findIndex(f => f.id === id);
    if (idx === -1) return;
    const targetIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= frames.length) return;

    pushHistory(`프레임 ${direction === 'left' ? '앞' : '뒤'}으로 이동`);
    setFrames(prev => {
      const next = [...prev];
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      return next;
    });
  };

  const handleRenameFrame = (id: string, name: string) => {
    setFrames(prev => prev.map(f => f.id === id ? { ...f, name } : f));
  };

  // 레이어 삭제
  const handleDeleteLayer = (id: string) => {
    if (layers.length <= 1) return;
    pushHistory('레이어 삭제');
    const filtered = layers.filter(l => l.id !== id);
    setLayers(filtered);
    if (activeLayerId === id) {
      setActiveLayerId(filtered[filtered.length - 1].id);
    }
  };

  // 레이어 복제
  const handleDuplicateLayer = (id: string) => {
    const target = layers.find(l => l.id === id);
    if (!target) return;
    pushHistory('레이어 복제');
    const newId = `layer-${Date.now()}`;
    const cloned: Layer = {
      ...target,
      id: newId,
      name: `${target.name} (복사본)`,
      pixels: [...target.pixels],
    };
    setLayers(prev => {
      const idx = prev.findIndex(l => l.id === id);
      const next = [...prev];
      next.splice(idx + 1, 0, cloned);
      return next;
    });
    setActiveLayerId(newId);
  };

  // 레이어 아래와 병합
  const handleMergeLayerDown = (id: string) => {
    const idx = layers.findIndex(l => l.id === id);
    if (idx <= 0) return; // 맨 밑 레이어는 병합 불가
    pushHistory('아래 레이어와 병합');

    const top = layers[idx];
    const bottom = layers[idx - 1];

    // 픽셀 병합 (top over bottom, 불투명도/표시여부 반영한 알파 합성)
    const mergedPixels = blendPixelArrays(top.pixels, top.opacity, top.visible, bottom.pixels);

    const mergedLayer: Layer = {
      ...bottom,
      pixels: mergedPixels,
    };

    setLayers(prev => {
      const next = [...prev];
      next.splice(idx - 1, 2, mergedLayer);
      return next;
    });
    setActiveLayerId(mergedLayer.id);
  };

  // 레이어 순서 이동 (위/아래)
  const handleMoveLayer = (id: string, direction: 'up' | 'down') => {
    const idx = layers.findIndex(l => l.id === id);
    if (idx === -1) return;
    if (direction === 'up' && idx === layers.length - 1) return;
    if (direction === 'down' && idx === 0) return;

    pushHistory(`레이어 ${direction === 'up' ? '위' : '아래'}로 이동`);
    const targetIdx = direction === 'up' ? idx + 1 : idx - 1;
    const next = [...layers];
    const temp = next[idx];
    next[idx] = next[targetIdx];
    next[targetIdx] = temp;
    setLayers(next);
  };

  // 레이어 가시성 / 잠금 / 불투명도 / 이름
  const handleToggleLayerVisibility = (id: string) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l));
  };

  const handleToggleLayerLock = (id: string) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, locked: !l.locked } : l));
  };

  const handleChangeLayerOpacity = (id: string, opacity: number) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, opacity } : l));
  };

  const handleRenameLayer = (id: string, name: string) => {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, name } : l));
  };

  const handleAssignLayerToGroup = (layerId: string, groupId: string | null) => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, groupId } : l));
  };

  // 그룹 관리
  const handleAddGroup = () => {
    pushHistory('새 그룹 생성');
    const newGroup: LayerGroup = {
      id: `group-${Date.now()}`,
      name: `그룹 ${groups.length + 1}`,
      visible: true,
      collapsed: false,
    };
    setGroups(prev => [...prev, newGroup]);
  };

  const handleDeleteGroup = (id: string) => {
    pushHistory('그룹 삭제');
    setGroups(prev => prev.filter(g => g.id !== id));
    // 해당 그룹 소속 레이어들을 ungroup으로 변경
    setLayers(prev => prev.map(l => l.groupId === id ? { ...l, groupId: null } : l));
  };

  const handleToggleGroupVisibility = (id: string) => {
    setGroups(prev => prev.map(g => g.id === id ? { ...g, visible: !g.visible } : g));
  };

  const handleToggleGroupCollapse = (id: string) => {
    setGroups(prev => prev.map(g => g.id === id ? { ...g, collapsed: !g.collapsed } : g));
  };

  const handleRenameGroup = (id: string, name: string) => {
    setGroups(prev => prev.map(g => g.id === id ? { ...g, name } : g));
  };

  // 캔버스 크기 변경 리사이징 엔진
  const handleResizeCanvas = (
    newWidth: number,
    newHeight: number,
    mode: 'crop-expand' | 'rescale' | 'clear'
  ) => {
    pushHistory(`캔버스 크기 변경 (${newWidth}x${newHeight})`);

    const oldW = dimensions.width;
    const oldH = dimensions.height;

    const resizePixels = (pixels: string[]): string[] => {
      const newPixels = new Array(newWidth * newHeight).fill('');

      if (mode === 'clear') return newPixels;

      if (mode === 'crop-expand') {
        for (let y = 0; y < Math.min(oldH, newHeight); y++) {
          for (let x = 0; x < Math.min(oldW, newWidth); x++) {
            newPixels[y * newWidth + x] = pixels[y * oldW + x];
          }
        }
      } else if (mode === 'rescale') {
        // Nearest-Neighbor Rescale
        for (let y = 0; y < newHeight; y++) {
          for (let x = 0; x < newWidth; x++) {
            const srcX = Math.floor((x / newWidth) * oldW);
            const srcY = Math.floor((y / newHeight) * oldH);
            newPixels[y * newWidth + x] = pixels[srcY * oldW + srcX] || '';
          }
        }
      }

      return newPixels;
    };

    // 캔버스 크기는 문서 전체의 속성이므로 활성 프레임만이 아니라 모든 프레임을 옮긴다.
    setFrames(prev => prev.map(frame => ({
      ...frame,
      layers: frame.layers.map(layer => ({ ...layer, pixels: resizePixels(layer.pixels) })),
    })));

    setDimensions({ width: newWidth, height: newHeight });
  };

  // 이미지 도트 변환 결과 적용
  const handleImageConversion = (
    pixels: string[],
    targetWidth: number,
    targetHeight: number,
    asNewLayer: boolean
  ) => {
    pushHistory('이미지 도트 변환 적용');

    if (!asNewLayer || targetWidth !== dimensions.width || targetHeight !== dimensions.height) {
      // 캔버스 크기가 바뀌면 기존 프레임들은 그 크기에 맞지 않으므로,
      // 변환 결과만 담은 프레임 한 장으로 새로 시작한다.
      setDimensions({ width: targetWidth, height: targetHeight });
      const newLayer: Layer = {
        id: `layer-${Date.now()}`,
        name: '도트 변환 레이어',
        groupId: null,
        visible: true,
        locked: false,
        opacity: 1.0,
        pixels,
      };
      const newFrame: Frame = {
        id: `frame-${Date.now()}`,
        name: '프레임 1',
        groups: [],
        layers: [newLayer],
      };
      setFrames([newFrame]);
      setActiveFrameId(newFrame.id);
      setActiveLayerId(newLayer.id);
    } else {
      // 동일 해상도 새 레이어로 추가
      const newLayer: Layer = {
        id: `layer-${Date.now()}`,
        name: `도트 변환 #${layers.length + 1}`,
        groupId: null,
        visible: true,
        locked: false,
        opacity: 1.0,
        pixels,
      };
      setLayers(prev => [...prev, newLayer]);
      setActiveLayerId(newLayer.id);
    }
  };

  // 필터 적용
  const handleApplyLayerFilter = (
    updatedLayers: { id: string; pixels: string[] }[],
    description: string
  ) => {
    pushHistory(`필터 적용 (${description})`);
    setLayers(prev => prev.map(layer => {
      const match = updatedLayers.find(u => u.id === layer.id);
      if (match) {
        return { ...layer, pixels: match.pixels };
      }
      return layer;
    }));
  };

  // 필터 실시간 캔버스 미리보기 (히스토리 미기록, 즉각 픽셀 반영)
  const handlePreviewLayerFilter = useCallback((
    updatedLayers: { id: string; pixels: string[] }[]
  ) => {
    setLayers(prev => prev.map(layer => {
      const match = updatedLayers.find(u => u.id === layer.id);
      if (match) {
        return { ...layer, pixels: match.pixels };
      }
      return layer;
    }));
  }, []);

  // 현재 활성 레이어 지우기
  const handleClearActiveLayer = () => {
    const active = layers.find(l => l.id === activeLayerId);
    if (!active || active.locked) return;
    pushHistory('레이어 비우기');
    const emptyPixels = new Array(dimensions.width * dimensions.height).fill('');
    handleUpdateLayerPixels(activeLayerId, emptyPixels, false);
  };

  return (
    <div
      className="app-shell w-full flex flex-col overflow-hidden dark bg-[#0A0A0A] text-gray-300"
      style={{ paddingBottom: floatingToolbarInset }}
    >
      {/* 1. 상단 내비게이션 바 */}
      <Navbar
        canvasWidth={dimensions.width}
        canvasHeight={dimensions.height}
        canUndo={historyPast.length > 0}
        canRedo={historyFuture.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenSizeModal={() => setIsSizeModalOpen(true)}
        onOpenConvertModal={() => setIsConvertModalOpen(true)}
        onOpenFiltersModal={() => setIsFiltersModalOpen(!isFiltersModalOpen)}
        isFiltersOpen={isFiltersModalOpen}
        onOpenCodeModal={() => setIsCodeModalOpen(true)}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onClearCanvas={handleClearActiveLayer}
        onExportProject={handleExportProject}
        onImportProject={handleImportProject}
        onToggleMobileLayers={() => setActiveMobileTab(activeMobileTab === 'layers' ? 'none' : 'layers')}
        onToggleMobilePalette={() => setActiveMobileTab(activeMobileTab === 'palette' ? 'none' : 'palette')}
        activeMobileTab={activeMobileTab}
      />

      {/* 2. 메인 워크스페이스 (데스크탑: 좌측 팔레트, 중앙 캔버스, 우측 레이어) */}
      <div className="flex-1 flex flex-row overflow-hidden relative">
        {/* 데스크탑 좌측 도구 바 */}
        <Toolbar
          currentTool={currentTool}
          onChangeTool={setCurrentTool}
          brushSize={brushSize}
          onChangeBrushSize={setBrushSize}
          fillShape={fillShape}
          onToggleFillShape={() => setFillShape(!fillShape)}
          horizontalSymmetry={horizontalSymmetry}
          onToggleHorizontalSymmetry={() => setHorizontalSymmetry(!horizontalSymmetry)}
          showGrid={showGrid}
          onToggleGrid={() => setShowGrid(!showGrid)}
          wandTolerance={wandTolerance}
          onChangeWandTolerance={setWandTolerance}
          zoom={zoom}
          onZoomIn={() => setZoom(prev => Math.min(64, prev + 2))}
          onZoomOut={() => setZoom(prev => Math.max(1, prev - 2))}
          onResetZoom={() => setZoom(16)}
        />

        {/* 데스크탑 좌측 팔레트 독 */}
        <div className="hidden md:block h-full shrink-0">
          <ColorPalettePanel
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            onSelectPrimaryColor={setPrimaryColor}
            onSelectSecondaryColor={setSecondaryColor}
            activePalette={activePalette}
            onChangePalette={setActivePalette}
            customPalettes={customPalettes}
            onSaveCustomPalette={handleSaveCustomPalette}
            onDeleteCustomPalette={handleDeleteCustomPalette}
          />
        </div>

        {/* 중앙 인터랙티브 픽셀 캔버스 및 하단 스프라이트 타임라인 */}
        <main className="flex-1 h-full relative flex flex-col overflow-hidden">
          <div className="flex-1 relative overflow-hidden">
            <PixelCanvas
              layers={layers}
              groups={groups}
              activeLayerId={activeLayerId}
              width={dimensions.width}
              height={dimensions.height}
              currentTool={currentTool}
              primaryColor={primaryColor}
              secondaryColor={secondaryColor}
              brushSize={brushSize}
              fillShape={fillShape}
              horizontalSymmetry={horizontalSymmetry}
              showGrid={showGrid}
              zoom={zoom}
              onZoomChange={setZoom}
              onUpdateLayerPixels={handleUpdateLayerPixels}
              onPickColor={setPrimaryColor}
              selection={selection}
              onChangeSelection={setSelection}
              wandTolerance={wandTolerance}
              onionSkinEnabled={onionSkinEnabled}
              onionSkinPixels={onionSkinPixels}
            />

            {/* 선택 영역 액션 바 (모바일에는 키보드 단축키가 없으므로 버튼으로도 제공) */}
            {selection && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-[#111111]/95 backdrop-blur-md border border-gray-800 rounded-lg px-1.5 py-1 shadow-xl">
                <span className="px-1.5 text-[10px] font-mono text-gray-400">
                  {selection.width}×{selection.height}
                </span>
                <div className="w-px h-4 bg-gray-800" />
                <button
                  onClick={handleCopySelection}
                  className="px-2 py-1 rounded text-[11px] text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
                  title="선택 영역 복사 (Ctrl+C)"
                >
                  복사
                </button>
                <button
                  onClick={handleCutSelection}
                  className="px-2 py-1 rounded text-[11px] text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
                  title="선택 영역 잘라내기 (Ctrl+X)"
                >
                  잘라내기
                </button>
                <button
                  onClick={handlePasteClipboard}
                  disabled={!clipboard}
                  className={`px-2 py-1 rounded text-[11px] transition-colors ${
                    clipboard
                      ? 'text-gray-300 hover:text-white hover:bg-gray-800'
                      : 'text-gray-600 cursor-not-allowed'
                  }`}
                  title={clipboard ? '붙여넣기 (Ctrl+V)' : '복사한 내용이 없습니다'}
                >
                  붙여넣기
                </button>
                <button
                  onClick={handleDeleteSelection}
                  className="px-2 py-1 rounded text-[11px] text-gray-300 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                  title="선택 영역 지우기 (Delete)"
                >
                  지우기
                </button>
                <div className="w-px h-4 bg-gray-800" />
                <button
                  onClick={() => setSelection(null)}
                  className="p-1 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors"
                  title="선택 해제 (Esc)"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* 스프라이트 애니메이션 프레임 타임라인 */}
          <SpriteTimeline
            frames={frames}
            activeFrameId={activeFrame.id}
            width={dimensions.width}
            height={dimensions.height}
            onSelectFrame={handleSelectFrame}
            onAddFrame={handleAddFrame}
            onDuplicateFrame={handleDuplicateFrame}
            onDeleteFrame={handleDeleteFrame}
            onMoveFrame={handleMoveFrame}
            onionSkinEnabled={onionSkinEnabled}
            onToggleOnionSkin={() => setOnionSkinEnabled(!onionSkinEnabled)}
            onOpenExportModal={() => setIsExportModalOpen(true)}
          />
        </main>

        {/* 데스크탑 우측 레이어 독 */}
        <div className="hidden md:block h-full shrink-0">
          <LayersPanel
            layers={layers}
            groups={groups}
            activeLayerId={activeLayerId}
            onSelectLayer={setActiveLayerId}
            onAddLayer={handleAddLayer}
            onDeleteLayer={handleDeleteLayer}
            onDuplicateLayer={handleDuplicateLayer}
            onMergeLayerDown={handleMergeLayerDown}
            onMoveLayer={handleMoveLayer}
            onToggleLayerVisibility={handleToggleLayerVisibility}
            onToggleLayerLock={handleToggleLayerLock}
            onChangeLayerOpacity={handleChangeLayerOpacity}
            onRenameLayer={handleRenameLayer}
            onAssignLayerToGroup={handleAssignLayerToGroup}
            onAddGroup={handleAddGroup}
            onDeleteGroup={handleDeleteGroup}
            onToggleGroupVisibility={handleToggleGroupVisibility}
            onToggleGroupCollapse={handleToggleGroupCollapse}
            onRenameGroup={handleRenameGroup}
          />
        </div>

        {/* 모바일 팝업 드로어 (팔레트 또는 레이어 활성화 시) */}
        {activeMobileTab !== 'none' && (
          <div className="md:hidden absolute inset-x-0 bottom-16 top-0 z-40 bg-[#0A0A0A]/95 backdrop-blur-lg flex flex-col animate-in fade-in slide-in-from-bottom-5 duration-200">
            {activeMobileTab === 'palette' && (
              <ColorPalettePanel
                primaryColor={primaryColor}
                secondaryColor={secondaryColor}
                onSelectPrimaryColor={(c) => {
                  setPrimaryColor(c);
                  setActiveMobileTab('none');
                }}
                onSelectSecondaryColor={(c) => {
                  setSecondaryColor(c);
                  setActiveMobileTab('none');
                }}
                activePalette={activePalette}
                onChangePalette={setActivePalette}
                customPalettes={customPalettes}
                onSaveCustomPalette={handleSaveCustomPalette}
                onDeleteCustomPalette={handleDeleteCustomPalette}
                onCloseMobile={() => setActiveMobileTab('none')}
              />
            )}
            {activeMobileTab === 'layers' && (
              <LayersPanel
                layers={layers}
                groups={groups}
                activeLayerId={activeLayerId}
                onSelectLayer={(id) => {
                  setActiveLayerId(id);
                }}
                onAddLayer={handleAddLayer}
                onDeleteLayer={handleDeleteLayer}
                onDuplicateLayer={handleDuplicateLayer}
                onMergeLayerDown={handleMergeLayerDown}
                onMoveLayer={handleMoveLayer}
                onToggleLayerVisibility={handleToggleLayerVisibility}
                onToggleLayerLock={handleToggleLayerLock}
                onChangeLayerOpacity={handleChangeLayerOpacity}
                onRenameLayer={handleRenameLayer}
                onAssignLayerToGroup={handleAssignLayerToGroup}
                onAddGroup={handleAddGroup}
                onDeleteGroup={handleDeleteGroup}
                onToggleGroupVisibility={handleToggleGroupVisibility}
                onToggleGroupCollapse={handleToggleGroupCollapse}
                onRenameGroup={handleRenameGroup}
                onCloseMobile={() => setActiveMobileTab('none')}
              />
            )}
          </div>
        )}
      </div>

      {/* Elegant Dark 하단 상태 바 */}
      {/* 상태바: 도구·캔버스 크기·배율은 좁은 화면에서 각각 도구 막대, 상단 바,
          캔버스 오버레이에 이미 보이므로 자리를 양보한다 */}
      <footer className="h-7 bg-[#111111] border-t border-gray-800 px-4 hidden md:flex items-center justify-between text-[10px] text-gray-500 shrink-0 font-mono select-none">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Ready</span>
          </span>
          <span className="hidden sm:inline">Active: <span className="text-gray-300">{layers.find(l => l.id === activeLayerId)?.name || 'Layer'}</span></span>
          <span>Tool: <span className="text-emerald-400 uppercase">{currentTool}</span></span>
        </div>
        <div className="flex items-center gap-4">
          <span>{dimensions.width}×{dimensions.height} px</span>
          <span>{Math.round(zoom * 100 / 16)}%</span>
          <span className="hidden sm:inline text-gray-600">FPS: 60.0</span>
        </div>
      </footer>

      {/* 3. 모달 오버레이들 */}
      <ImageToPixelModal
        isOpen={isConvertModalOpen}
        onClose={() => setIsConvertModalOpen(false)}
        currentWidth={dimensions.width}
        currentHeight={dimensions.height}
        activePaletteColors={activePalette.colors}
        onApplyConversion={handleImageConversion}
      />

      <CanvasSizeModal
        isOpen={isSizeModalOpen}
        onClose={() => setIsSizeModalOpen(false)}
        currentWidth={dimensions.width}
        currentHeight={dimensions.height}
        onResizeCanvas={handleResizeCanvas}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        frames={frames}
        activeFrame={activeFrame}
        width={dimensions.width}
        height={dimensions.height}
        onDuplicateCurrentFrame={() => handleDuplicateFrame(activeFrame.id)}
      />

      <CodeExportModal
        isOpen={isCodeModalOpen}
        onClose={() => setIsCodeModalOpen(false)}
        layers={layers}
        groups={groups}
        width={dimensions.width}
        height={dimensions.height}
      />

      <FiltersModal
        isOpen={isFiltersModalOpen}
        onClose={() => setIsFiltersModalOpen(false)}
        layers={layers}
        activeLayerId={activeLayerId}
        width={dimensions.width}
        height={dimensions.height}
        onApplyLayerFilter={handleApplyLayerFilter}
        onPreviewLayerFilter={handlePreviewLayerFilter}
        primaryColor={primaryColor}
      />
    </div>
  );
}
