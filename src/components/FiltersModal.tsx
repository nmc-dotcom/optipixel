import React, { useState, useEffect, useRef } from 'react';
import { Layer } from '../types';
import { 
  applyComprehensiveTone,
  filterFlipHorizontal, 
  filterFlipVertical, 
  filterGenerateOutline, 
  filterGrayscale, 
  filterInvert, 
  filterRotate90,
  filterRotateAngle,
  filterShift 
} from '../utils/filterEngine';
import { 
  SlidersHorizontal, 
  X, 
  Sun, 
  Sparkles, 
  RotateCw, 
  FlipHorizontal, 
  FlipVertical, 
  Move, 
  Palette,
  Check,
  RotateCcw,
  GripHorizontal,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Contrast,
  Droplet
} from 'lucide-react';

interface FiltersModalProps {
  isOpen: boolean;
  onClose: () => void;
  layers: Layer[];
  activeLayerId: string;
  width: number;
  height: number;
  onApplyLayerFilter: (updatedLayers: { id: string; pixels: string[] }[], description: string) => void;
  onPreviewLayerFilter?: (updatedLayers: { id: string; pixels: string[] }[]) => void;
  primaryColor: string;
}

export const FiltersModal: React.FC<FiltersModalProps> = ({
  isOpen,
  onClose,
  layers,
  activeLayerId,
  width,
  height,
  onApplyLayerFilter,
  onPreviewLayerFilter,
  primaryColor,
}) => {
  // 1. 상태 보존용 백업 (모달이 열릴 때의 원래 픽셀 스냅샷)
  const initialBackupRef = useRef<{ id: string; pixels: string[] }[]>([]);
  const hasInitializedRef = useRef(false);

  // 2. 톤 조절 슬라이더 상태
  const [tone, setTone] = useState({
    brightness: 0,  // -100 ~ 100
    contrast: 0,    // -100 ~ 100
    saturation: 0,  // -100 ~ 100
    hue: 0,         // -180 ~ 180
  });

  // 3. 회전 각도 상태 (-180° ~ 180°)
  const [rotationAngle, setRotationAngle] = useState(0);

  // 4. 필터 적용 범위 & 부가 옵션
  const [scope, setScope] = useState<'active' | 'all'>('active');
  // 외곽선은 스프라이트와 대비되어야 의미가 있다.
  // 현재 그리기 색(primaryColor)을 기본값으로 쓰면, 방금 그 색으로 그린 그림에
  // 같은 색 외곽선이 생겨 "아무 일도 일어나지 않은 것처럼" 보이므로 어두운 색을 기본으로 둔다.
  const [outlineColor, setOutlineColor] = useState('#0f172a');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'tone' | 'effects' | 'geometry'>('geometry');

  // 5. 드래그 가능한 플로팅 윈도우 좌표 (캔버스를 가리지 않도록 우측 상단 기본 배치)
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; posX: number; posY: number }>({
    startX: 0,
    startY: 0,
    posX: 0,
    posY: 0,
  });

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // 모달 열릴 때 초기 백업 저장 및 위치 산출
  useEffect(() => {
    if (isOpen) {
      initialBackupRef.current = layers.map(l => ({ id: l.id, pixels: [...l.pixels] }));
      hasInitializedRef.current = true;
      setTone({ brightness: 0, contrast: 0, saturation: 0, hue: 0 });
      setRotationAngle(0);

      // 화면 우측 상단 캔버스 옆에 배치
      const initialX = Math.max(16, window.innerWidth - 380);
      const initialY = 64;
      setPosition({ x: initialX, y: initialY });
    } else {
      hasInitializedRef.current = false;
    }
  }, [isOpen]);

  // 공통 실시간 프리뷰 연산 (톤 + 회전 각도 결합)
  const computeAndPreviewLayers = (
    nextTone = tone,
    nextAngle = rotationAngle,
    targetScope = scope
  ) => {
    if (!onPreviewLayerFilter || initialBackupRef.current.length === 0) return;

    const targetLayerIds = targetScope === 'active' 
      ? [activeLayerId] 
      : layers.filter(l => l.visible).map(l => l.id);

    const updatedLayers = initialBackupRef.current.map(layerBackup => {
      if (targetLayerIds.includes(layerBackup.id)) {
        // 1. 톤 조정 적용
        let pxs = applyComprehensiveTone(layerBackup.pixels, nextTone);
        // 2. 임의 각도 회전 적용
        if (nextAngle !== 0) {
          pxs = filterRotateAngle(pxs, width, height, nextAngle);
        }
        return { id: layerBackup.id, pixels: pxs };
      }
      return { id: layerBackup.id, pixels: layerBackup.pixels };
    });

    onPreviewLayerFilter(updatedLayers);
  };

  // 슬라이더 톤 조절 시 메인 캔버스에 실시간 라이브 반영
  const handleToneChange = (key: 'brightness' | 'contrast' | 'saturation' | 'hue', val: number) => {
    const nextTone = { ...tone, [key]: val };
    setTone(nextTone);
    computeAndPreviewLayers(nextTone, rotationAngle, scope);
  };

  // 회전 각도 조절 시 메인 캔버스에 실시간 라이브 반영
  const handleAngleChange = (angle: number) => {
    let normalized = angle;
    while (normalized > 180) normalized -= 360;
    while (normalized < -180) normalized += 360;
    setRotationAngle(normalized);
    computeAndPreviewLayers(tone, normalized, scope);
  };

  // 증감 각도 조절 (+45, +90, -45 등)
  const handleDeltaAngle = (delta: number) => {
    handleAngleChange(rotationAngle + delta);
  };

  // 적용 대상 범위(Scope) 변경 시 재계산
  const handleScopeChange = (newScope: 'active' | 'all') => {
    setScope(newScope);
    computeAndPreviewLayers(tone, rotationAngle, newScope);
  };

  // 톤 및 회전 리셋 (슬라이더 0으로 초기화 및 원본 복원)
  const handleResetTone = () => {
    setTone({ brightness: 0, contrast: 0, saturation: 0, hue: 0 });
    setRotationAngle(0);
    if (onPreviewLayerFilter && initialBackupRef.current.length > 0) {
      onPreviewLayerFilter(initialBackupRef.current);
    }
  };

  // 즉시 변환 이펙트 (외곽선, 반전, 흑백, 기하 변환 등)
  const handleInstantEffect = (
    transformFn: (pixels: string[]) => string[],
    desc: string
  ) => {
    const targetLayerIds = scope === 'active'
      ? [activeLayerId]
      : layers.filter(l => l.visible).map(l => l.id);

    // 현재 캔버스에 떠 있는 레이어 픽셀 기준으로 변환
    const updatedLayers = layers
      .filter(l => targetLayerIds.includes(l.id))
      .map(layer => ({
        id: layer.id,
        pixels: transformFn(layer.pixels),
      }));

    // 백업 기준점도 함께 갱신하여 톤 슬라이더와의 연계 보장
    initialBackupRef.current = initialBackupRef.current.map(backup => {
      const match = updatedLayers.find(u => u.id === backup.id);
      return match ? { id: backup.id, pixels: [...match.pixels] } : backup;
    });

    // 슬라이더와 달리 이 효과들은 되돌릴 수 없는 확정 편집이므로 히스토리에 기록한다.
    // (미리보기로만 반영하면 Ctrl+Z로 취소할 수 없고, 백업까지 덮어써서 '취소하고 닫기'로도 되돌릴 수 없다)
    onApplyLayerFilter(updatedLayers, desc);
  };

  // 취소 시: 열리기 전 원래 백업으로 롤백 후 닫기
  const handleCancel = () => {
    if (onPreviewLayerFilter && initialBackupRef.current.length > 0) {
      onPreviewLayerFilter(initialBackupRef.current);
    }
    onClose();
  };

  // 완료 시: 현재 픽셀들을 최종 히스토리에 기록 커밋 후 닫기
  const handleApplyFinal = () => {
    const targetLayerIds = scope === 'active' 
      ? [activeLayerId] 
      : layers.filter(l => l.visible).map(l => l.id);

    const finals = layers
      .filter(l => targetLayerIds.includes(l.id))
      .map(l => ({ id: l.id, pixels: l.pixels }));

    onApplyLayerFilter(finals, '실시간 필터/톤 조정');
    onClose();
  };

  // 미니 프리뷰 렌더링
  useEffect(() => {
    if (!isOpen) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const activeLayer = layers.find(l => l.id === activeLayerId) || layers[0];
    if (!activeLayer) return;

    canvas.width = 48;
    canvas.height = 48;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 48, 48);

    const temp = document.createElement('canvas');
    temp.width = width;
    temp.height = height;
    const tctx = temp.getContext('2d')!;
    const imgData = tctx.createImageData(width, height);

    for (let i = 0; i < activeLayer.pixels.length; i++) {
      const hex = activeLayer.pixels[i];
      if (hex) {
        const num = parseInt(hex.replace('#', ''), 16);
        const pIdx = i * 4;
        imgData.data[pIdx] = (num >> 16) & 255;
        imgData.data[pIdx + 1] = (num >> 8) & 255;
        imgData.data[pIdx + 2] = num & 255;
        imgData.data[pIdx + 3] = 255;
      }
    }
    tctx.putImageData(imgData, 0, 0);
    ctx.drawImage(temp, 0, 0, width, height, 0, 0, 48, 48);
  }, [isOpen, layers, activeLayerId, width, height]);

  // 창 드래그 이벤트 핸들러
  const handleMouseDown = (e: React.MouseEvent) => {
    // 버튼이나 입력창 클릭 시에는 드래그 방지
    if ((e.target as HTMLElement).closest('button, input, select')) return;
    setIsDragging(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: position.x,
      posY: position.y,
    };
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;
      const newX = Math.max(10, Math.min(window.innerWidth - 320, dragStartRef.current.posX + dx));
      const newY = Math.max(50, Math.min(window.innerHeight - 100, dragStartRef.current.posY + dy));
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (!isOpen) return null;

  return (
    // 백드롭을 없애 캔버스가 완벽히 보이며, 창만 마우스 조작 가능
    <div className="fixed inset-0 pointer-events-none z-50 select-none">
      <div
        style={{
          transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
          width: '350px',
        }}
        className="pointer-events-auto absolute top-0 left-0 bg-[#141414]/95 backdrop-blur-md border border-gray-700/80 rounded-xl shadow-2xl overflow-hidden text-gray-200 flex flex-col transition-shadow hover:border-emerald-500/60"
      >
        {/* 드래그 핸들 겸 헤더 */}
        <div
          onMouseDown={handleMouseDown}
          className="flex items-center justify-between px-3.5 py-2.5 bg-[#1C1C1C] border-b border-gray-800 cursor-move"
          title="드래그하여 원하는 위치로 이동"
        >
          <div className="flex items-center gap-2">
            <GripHorizontal className="w-3.5 h-3.5 text-gray-400" />
            <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-bold text-white tracking-wide">실시간 필터 & 톤 조정</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              title={isCollapsed ? '펼치기' : '접기'}
            >
              {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={handleCancel}
              className="p-1 rounded text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors"
              title="취소하고 닫기"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {!isCollapsed && (
          <div className="p-3.5 flex flex-col gap-3.5 max-h-[calc(100vh-140px)] overflow-y-auto">
            {/* 상단 미니 프리뷰 및 적용 대상 레이어 스위치 */}
            <div className="flex items-center gap-3 bg-[#0D0D0D] p-2 rounded-lg border border-gray-800/80">
              <div className="w-11 h-11 bg-checkered rounded border border-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-inner">
                <canvas ref={previewCanvasRef} className="pixelated" />
              </div>

              <div className="flex-1 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase text-gray-400">적용 대상</span>
                  <span className="text-[10px] font-mono text-emerald-400">실시간 캔버스 반영</span>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    onClick={() => handleScopeChange('active')}
                    className={`py-1 rounded text-[11px] font-medium transition-colors ${
                      scope === 'active'
                        ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                        : 'bg-[#181818] text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    현재 레이어
                  </button>
                  <button
                    onClick={() => handleScopeChange('all')}
                    className={`py-1 rounded text-[11px] font-medium transition-colors ${
                      scope === 'all'
                        ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                        : 'bg-[#181818] text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    모든 레이어
                  </button>
                </div>
              </div>
            </div>

            {/* 탭 네비게이션: 톤 슬라이더 / 1px 외곽선 / 기하 변환 */}
            <div className="grid grid-cols-3 gap-1 bg-[#0D0D0D] p-1 rounded-lg border border-gray-800">
              <button
                onClick={() => setActiveTab('tone')}
                className={`py-1 rounded text-[11px] font-semibold transition-colors ${
                  activeTab === 'tone'
                    ? 'bg-[#222222] text-emerald-400 shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                톤 슬라이더
              </button>
              <button
                onClick={() => setActiveTab('effects')}
                className={`py-1 rounded text-[11px] font-semibold transition-colors ${
                  activeTab === 'effects'
                    ? 'bg-[#222222] text-emerald-400 shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                도트 외곽선
              </button>
              <button
                onClick={() => setActiveTab('geometry')}
                className={`py-1 rounded text-[11px] font-semibold transition-colors ${
                  activeTab === 'geometry'
                    ? 'bg-[#222222] text-emerald-400 shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                대칭 & 회전
              </button>
            </div>

            {/* TAB 1: 톤 슬라이더 (밝기, 대비, 채도, 색조) */}
            {activeTab === 'tone' && (
              <div className="flex flex-col gap-3">
                {/* 밝기 (Brightness) */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-gray-300 font-medium">
                      <Sun className="w-3.5 h-3.5 text-amber-400" />
                      밝기 (Brightness)
                    </span>
                    <span className="font-mono text-[11px] text-emerald-400 font-semibold">
                      {tone.brightness > 0 ? `+${tone.brightness}` : tone.brightness}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    value={tone.brightness}
                    onChange={(e) => handleToneChange('brightness', Number(e.target.value))}
                    className="w-full accent-emerald-500 h-1.5 bg-gray-800 rounded cursor-pointer"
                  />
                </div>

                {/* 대비 (Contrast) */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-gray-300 font-medium">
                      <Contrast className="w-3.5 h-3.5 text-indigo-400" />
                      대비 (Contrast)
                    </span>
                    <span className="font-mono text-[11px] text-emerald-400 font-semibold">
                      {tone.contrast > 0 ? `+${tone.contrast}` : tone.contrast}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    value={tone.contrast}
                    onChange={(e) => handleToneChange('contrast', Number(e.target.value))}
                    className="w-full accent-emerald-500 h-1.5 bg-gray-800 rounded cursor-pointer"
                  />
                </div>

                {/* 채도 (Saturation) */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-gray-300 font-medium">
                      <Droplet className="w-3.5 h-3.5 text-pink-400" />
                      채도 (Saturation)
                    </span>
                    <span className="font-mono text-[11px] text-emerald-400 font-semibold">
                      {tone.saturation > 0 ? `+${tone.saturation}` : tone.saturation}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    value={tone.saturation}
                    onChange={(e) => handleToneChange('saturation', Number(e.target.value))}
                    className="w-full accent-emerald-500 h-1.5 bg-gray-800 rounded cursor-pointer"
                  />
                </div>

                {/* 색조 (Hue Shift) */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-gray-300 font-medium">
                      <Palette className="w-3.5 h-3.5 text-emerald-400" />
                      색조 (Hue Shift)
                    </span>
                    <span className="font-mono text-[11px] text-emerald-400 font-semibold">
                      {tone.hue > 0 ? `+${tone.hue}°` : `${tone.hue}°`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    value={tone.hue}
                    onChange={(e) => handleToneChange('hue', Number(e.target.value))}
                    className="w-full accent-emerald-500 h-1.5 bg-gray-800 rounded cursor-pointer"
                  />
                </div>

                {/* 퀵 액션: 색상 반전 & 흑백 */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-800/80">
                  <button
                    onClick={() => handleInstantEffect(filterInvert, '색상 반전')}
                    className="px-2.5 py-1.5 rounded bg-[#1C1C1C] hover:bg-gray-800 border border-gray-800 text-xs text-gray-200 transition-colors"
                  >
                    색상 반전 (Invert)
                  </button>
                  <button
                    onClick={() => handleInstantEffect(filterGrayscale, '흑백 변환')}
                    className="px-2.5 py-1.5 rounded bg-[#1C1C1C] hover:bg-gray-800 border border-gray-800 text-xs text-gray-200 transition-colors"
                  >
                    흑백 (Grayscale)
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: 도트 외곽선 (Outline) 생성 */}
            {activeTab === 'effects' && (
              <div className="flex flex-col gap-3">
                <div className="bg-[#181818] border border-gray-800 p-3 rounded-lg flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold text-gray-200">1px 도트 외곽선 생성</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setOutlineColor(primaryColor)}
                        disabled={outlineColor.toLowerCase() === primaryColor.toLowerCase()}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-gray-700 text-gray-400 hover:text-emerald-400 hover:border-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        title="현재 그리기 색을 외곽선 색으로 사용"
                      >
                        현재 색
                      </button>
                      <input
                        type="color"
                        value={outlineColor}
                        onChange={(e) => setOutlineColor(e.target.value)}
                        className="w-6 h-6 rounded border border-gray-700 bg-transparent cursor-pointer"
                      />
                      <span className="text-[10px] font-mono text-gray-400">{outlineColor}</span>
                    </div>
                  </div>

                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    스프라이트 주변 경계면에 1px 정밀 도트 외곽선을 입혀 캐릭터 및 오브젝트의 시인성을 높입니다.
                  </p>

                  <button
                    onClick={() => {
                      handleInstantEffect(
                        (pxs) => filterGenerateOutline(pxs, width, height, outlineColor),
                        '외곽선 자동 생성'
                      );
                    }}
                    className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold shadow-sm transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>외곽선 캔버스에 추가</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 3: 대칭 & 회전 & 1px 이동 */}
            {activeTab === 'geometry' && (
              <div className="flex flex-col gap-3">
                {/* 1. 정밀 회전 각도 조절기 (Angle Rotation Controller) */}
                <div className="bg-[#181818] border border-gray-800 p-3 rounded-lg flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <RotateCw className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold text-gray-200">회전 각도 조절 (Angle)</span>
                    </div>
                    <div className="flex items-center gap-1 bg-[#0A0A0A] border border-gray-700/80 rounded px-1.5 py-0.5">
                      <input
                        type="number"
                        min={-180}
                        max={180}
                        value={rotationAngle}
                        onChange={(e) => handleAngleChange(Number(e.target.value))}
                        className="w-12 text-center text-xs font-mono font-bold bg-transparent text-emerald-400 focus:outline-none"
                      />
                      <span className="text-[11px] text-gray-400 font-mono">°</span>
                    </div>
                  </div>

                  {/* 회전 각도 슬라이더 (-180° ~ 180°) */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[10px] font-mono text-gray-500 px-0.5">
                      <span>-180°</span>
                      <span>-90°</span>
                      <span className={rotationAngle === 0 ? "text-emerald-400 font-bold" : "text-gray-400"}>0°</span>
                      <span>+90°</span>
                      <span>+180°</span>
                    </div>
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      step={1}
                      value={rotationAngle}
                      onChange={(e) => handleAngleChange(Number(e.target.value))}
                      className="w-full accent-emerald-500 h-1.5 bg-gray-800 rounded cursor-pointer"
                    />
                  </div>

                  {/* 퀵 각도 회전 프리셋 버튼 모음 */}
                  <div className="flex flex-wrap items-center gap-1 pt-0.5">
                    <button
                      onClick={() => handleAngleChange(0)}
                      className={`px-2 py-1 rounded text-[11px] font-semibold border transition-colors ${
                        rotationAngle === 0
                          ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500/60'
                          : 'bg-[#101010] text-gray-400 border-gray-800 hover:text-gray-200 hover:bg-gray-800'
                      }`}
                      title="0° 원위치로 초기화"
                    >
                      0° 초기화
                    </button>
                    <button
                      onClick={() => handleDeltaAngle(-90)}
                      className="px-2 py-1 rounded text-[11px] font-medium bg-[#101010] hover:bg-gray-800 text-gray-300 border border-gray-800 transition-colors"
                      title="-90° 회전"
                    >
                      -90°
                    </button>
                    <button
                      onClick={() => handleDeltaAngle(-45)}
                      className="px-2 py-1 rounded text-[11px] font-medium bg-[#101010] hover:bg-gray-800 text-gray-300 border border-gray-800 transition-colors"
                      title="-45° 회전"
                    >
                      -45°
                    </button>
                    <button
                      onClick={() => handleDeltaAngle(45)}
                      className="px-2 py-1 rounded text-[11px] font-medium bg-[#101010] hover:bg-gray-800 text-gray-300 border border-gray-800 transition-colors"
                      title="+45° 회전"
                    >
                      +45°
                    </button>
                    <button
                      onClick={() => handleDeltaAngle(90)}
                      className="px-2 py-1 rounded text-[11px] font-medium bg-[#101010] hover:bg-gray-800 text-gray-300 border border-gray-800 transition-colors"
                      title="+90° 회전"
                    >
                      +90°
                    </button>
                    <button
                      onClick={() => handleDeltaAngle(180)}
                      className="px-2 py-1 rounded text-[11px] font-medium bg-[#101010] hover:bg-gray-800 text-gray-300 border border-gray-800 transition-colors"
                      title="180° 회전"
                    >
                      180°
                    </button>
                  </div>
                </div>

                {/* 2. 대칭 반전 (좌우 / 상하) */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleInstantEffect((pxs) => filterFlipHorizontal(pxs, width, height), '좌우 대칭')}
                    className="p-2 rounded bg-[#181818] hover:bg-gray-800 border border-gray-800 text-xs text-gray-200 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <FlipHorizontal className="w-4 h-4 text-emerald-400" />
                    <span>좌우 반전</span>
                  </button>
                  <button
                    onClick={() => handleInstantEffect((pxs) => filterFlipVertical(pxs, width, height), '상하 대칭')}
                    className="p-2 rounded bg-[#181818] hover:bg-gray-800 border border-gray-800 text-xs text-gray-200 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <FlipVertical className="w-4 h-4 text-emerald-400" />
                    <span>상하 반전</span>
                  </button>
                </div>

                {/* 3. 1px 미세 시프트 */}
                <div className="bg-[#181818] p-2.5 rounded-lg border border-gray-800 flex items-center justify-between">
                  <span className="text-[11px] text-gray-400 flex items-center gap-1">
                    <Move className="w-3.5 h-3.5 text-gray-500" />
                    1px 미세 이동:
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleInstantEffect((pxs) => filterShift(pxs, width, height, -1, 0), '좌측 1px')}
                      className="w-6 h-6 bg-[#0A0A0A] hover:bg-gray-700 border border-gray-800 rounded text-xs text-gray-200 flex items-center justify-center"
                    >
                      ←
                    </button>
                    <button
                      onClick={() => handleInstantEffect((pxs) => filterShift(pxs, width, height, 1, 0), '우측 1px')}
                      className="w-6 h-6 bg-[#0A0A0A] hover:bg-gray-700 border border-gray-800 rounded text-xs text-gray-200 flex items-center justify-center"
                    >
                      →
                    </button>
                    <button
                      onClick={() => handleInstantEffect((pxs) => filterShift(pxs, width, height, 0, -1), '상단 1px')}
                      className="w-6 h-6 bg-[#0A0A0A] hover:bg-gray-700 border border-gray-800 rounded text-xs text-gray-200 flex items-center justify-center"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => handleInstantEffect((pxs) => filterShift(pxs, width, height, 0, 1), '하단 1px')}
                      className="w-6 h-6 bg-[#0A0A0A] hover:bg-gray-700 border border-gray-800 rounded text-xs text-gray-200 flex items-center justify-center"
                    >
                      ↓
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 하단 확인 / 초기화 / 취소 액션 바 */}
            <div className="flex items-center justify-between pt-3 border-t border-gray-800">
              <button
                onClick={handleResetTone}
                className="px-2.5 py-1.5 rounded text-[11px] font-medium bg-[#1C1C1C] hover:bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-800 flex items-center gap-1 transition-colors"
                title="슬라이더 값을 초기화하고 원래 상태로 되돌립니다"
              >
                <RotateCcw className="w-3 h-3" />
                <span>초기화</span>
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleCancel}
                  className="px-3 py-1.5 rounded text-[11px] font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleApplyFinal}
                  className="px-3.5 py-1.5 rounded text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1 shadow-md transition-all"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>적용 완료</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
