import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Frame } from '../types';
import { flattenLayers } from '../utils/pixelEngine';
import { 
  Play, 
  Pause, 
  Plus, 
  Copy, 
  Trash2, 
  ChevronLeft, 
  ChevronRight, 
  Film, 
  Eye, 
  EyeOff,
  Layers,
  ChevronDown,
  ChevronUp,
  Repeat,
  Repeat1,
  ArrowLeftRight
} from 'lucide-react';

export type LoopMode = 'loop' | 'pingpong' | 'once';

interface SpriteTimelineProps {
  frames: Frame[];
  activeFrameId: string;
  width: number;
  height: number;
  onSelectFrame: (frameId: string) => void;
  onAddFrame: () => void;
  onDuplicateFrame: (frameId: string) => void;
  onDeleteFrame: (frameId: string) => void;
  onMoveFrame: (frameId: string, direction: 'left' | 'right') => void;
  onionSkinEnabled: boolean;
  onToggleOnionSkin: () => void;
  onOpenExportModal: () => void;
}

export const SpriteTimeline: React.FC<SpriteTimelineProps> = ({
  frames,
  activeFrameId,
  width,
  height,
  onSelectFrame,
  onAddFrame,
  onDuplicateFrame,
  onDeleteFrame,
  onMoveFrame,
  onionSkinEnabled,
  onToggleOnionSkin,
  onOpenExportModal,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(8);
  const [currentPlayIndex, setCurrentPlayIndex] = useState(0);
  const [loopMode, setLoopMode] = useState<LoopMode>('loop');
  const [pingPongDir, setPingPongDir] = useState<1 | -1>(1);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  // 프레임마다 레이어 스택을 합성한 결과. 썸네일과 미니 프리뷰가 함께 쓴다.
  const framePixels = useMemo(
    () => frames.map(frame => flattenLayers(frame.layers, frame.groups, width, height)),
    [frames, width, height]
  );

  // 재생 토글 핸들러
  const handleTogglePlay = () => {
    if (!isPlaying) {
      if (frames.length <= 1) {
        // 프레임이 1개뿐인 경우 사용자가 바로 애니메이션을 시작할 수 있도록 현재 프레임 복제
        onDuplicateFrame(activeFrameId);
      }
      const activeIdx = frames.findIndex(f => f.id === activeFrameId);
      const startIdx = activeIdx >= 0 ? activeIdx : 0;
      setCurrentPlayIndex(startIdx);
      setPingPongDir(1);
      setIsPlaying(true);

      if (frames[startIdx]) {
        onSelectFrame(frames[startIdx].id);
      }
    } else {
      setIsPlaying(false);
    }
  };

  // 루프 모드 순환 토글: loop -> pingpong -> once -> loop
  const handleCycleLoopMode = () => {
    setLoopMode(prev => {
      if (prev === 'loop') return 'pingpong';
      if (prev === 'pingpong') return 'once';
      return 'loop';
    });
  };

  // 실시간 애니메이션 루프 타이머 (메인 캔버스 및 타임라인 동기화)
  useEffect(() => {
    if (!isPlaying || frames.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentPlayIndex(prev => {
        let next = prev;

        if (loopMode === 'loop') {
          // 🔁 무한 순환 루프: 0 -> 1 -> 2 -> ... -> 0 -> 1
          next = (prev + 1) % frames.length;
        } else if (loopMode === 'pingpong') {
          // 🔀 왕복 핑퐁 루프: 0 -> 1 -> 2 -> 1 -> 0 -> 1
          let dir = pingPongDir;
          if (prev + dir >= frames.length) {
            dir = -1;
            setPingPongDir(-1);
          } else if (prev + dir < 0) {
            dir = 1;
            setPingPongDir(1);
          }
          next = Math.max(0, Math.min(frames.length - 1, prev + dir));
        } else if (loopMode === 'once') {
          // 🔂 1회 재생 후 자동 정지
          if (prev + 1 >= frames.length) {
            setIsPlaying(false);
            return prev;
          }
          next = prev + 1;
        }

        // 메인 작업 캔버스의 활성 프레임 즉시 동기화
        if (frames[next]) {
          onSelectFrame(frames[next].id);
        }

        return next;
      });
    }, 1000 / fps);

    return () => clearInterval(interval);
  }, [isPlaying, fps, frames, loopMode, pingPongDir, onSelectFrame]);

  // 애니메이션 미니 프리뷰 캔버스 렌더링
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const activeIdx = frames.findIndex(f => f.id === activeFrameId);
    const target = isPlaying
      ? framePixels[currentPlayIndex]
      : framePixels[activeIdx >= 0 ? activeIdx : 0];

    if (!target) return;

    canvas.width = 44;
    canvas.height = 44;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 44, 44);

    const temp = document.createElement('canvas');
    temp.width = width;
    temp.height = height;
    const tctx = temp.getContext('2d')!;
    const imgData = tctx.createImageData(width, height);

    for (let i = 0; i < target.length; i++) {
      const hex = target[i];
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
    ctx.drawImage(temp, 0, 0, width, height, 0, 0, 44, 44);
  }, [isPlaying, currentPlayIndex, activeFrameId, frames, framePixels, width, height]);

  // 프레임 썸네일 렌더용 헬퍼 함수
  const renderThumbnail = (pixels: string[]) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const imgData = ctx.createImageData(width, height);
    for (let i = 0; i < pixels.length; i++) {
      const hex = pixels[i];
      if (hex) {
        const num = parseInt(hex.replace('#', ''), 16);
        const pIdx = i * 4;
        imgData.data[pIdx] = (num >> 16) & 255;
        imgData.data[pIdx + 1] = (num >> 8) & 255;
        imgData.data[pIdx + 2] = num & 255;
        imgData.data[pIdx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL();
  };

  const activeIndex = frames.findIndex(f => f.id === activeFrameId);

  return (
    <div className="bg-[#111111] border-t border-gray-800 text-gray-200 select-none z-20 flex flex-col transition-all">
      {/* 타임라인 헤더 컨트롤 바 */}
      <div className="flex items-center justify-between gap-3 px-3 py-1.5 bg-[#161616] border-b border-gray-800/80 overflow-x-auto">
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-300">
            <Film className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-mono text-[11px] uppercase tracking-wider">Sprite Animation Timeline</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 font-mono">
              {frames.length} Frames
            </span>
          </div>

          <div className="h-3 w-px bg-gray-700" />

          {/* 재생 / 루프 모드 / FPS 컨트롤 */}
          <div className="flex items-center gap-1.5">
            {/* 1. 재생 / 일시정지 버튼 (Play / Stop) */}
            <button
              id="btn-timeline-play"
              onClick={handleTogglePlay}
              className={`p-1 px-2 rounded text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                isPlaying 
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-md ring-1 ring-emerald-400/60 animate-pulse' 
                  : 'bg-[#0A0A0A] hover:bg-gray-800 text-gray-200 border border-gray-700/80 hover:border-emerald-500/50'
              }`}
              title={isPlaying ? '애니메이션 재생 중지 (Stop)' : '애니메이션 루프 재생 시작 (Play)'}
            >
              {isPlaying ? (
                <Pause className="w-3 h-3 fill-current" />
              ) : (
                <Play className="w-3 h-3 text-emerald-400 fill-emerald-400/40" />
              )}
              <span className="text-[10px] font-bold tracking-tight">
                {isPlaying ? 'Stop' : 'Play'}
              </span>
            </button>

            {/* 2. 루프 모드 토글 버튼 (Loop / Ping-Pong / Once) */}
            <button
              id="btn-timeline-loop"
              onClick={handleCycleLoopMode}
              className={`px-1.5 py-1 rounded text-xs flex items-center gap-1 border transition-all cursor-pointer ${
                loopMode === 'loop'
                  ? 'bg-emerald-950/40 border-emerald-600/70 text-emerald-300 hover:bg-emerald-900/40'
                  : loopMode === 'pingpong'
                  ? 'bg-sky-950/40 border-sky-600/70 text-sky-300 hover:bg-sky-900/40'
                  : 'bg-amber-950/40 border-amber-600/70 text-amber-300 hover:bg-amber-900/40'
              }`}
              title={`현재 재생 모드: ${
                loopMode === 'loop'
                  ? '무한 반복 루프 (0→1→2→0→1)'
                  : loopMode === 'pingpong'
                  ? '왕복 핑퐁 루프 (0→1→2→1→0)'
                  : '1회 재생 후 자동 멈춤'
              } (클릭하여 변경)`}
            >
              {loopMode === 'loop' && <Repeat className="w-3 h-3 text-emerald-400" />}
              {loopMode === 'pingpong' && <ArrowLeftRight className="w-3 h-3 text-sky-400" />}
              {loopMode === 'once' && <Repeat1 className="w-3 h-3 text-amber-400" />}
              <span className="text-[10px] font-semibold font-mono uppercase">
                {loopMode === 'loop' ? 'Loop' : loopMode === 'pingpong' ? 'Bounce' : '1-Shot'}
              </span>
            </button>

            {/* 현재 재생 위치 인디케이터 (재생 중일 때 표시) */}
            {isPlaying && frames.length > 1 && (
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-900/40 border border-emerald-700/50 text-emerald-300 animate-pulse">
                {currentPlayIndex + 1}/{frames.length}
              </span>
            )}

            {/* FPS 조절 */}
            <div className="flex items-center gap-1 bg-[#0A0A0A] border border-gray-800 rounded px-1.5 py-0.5">
              <span className="text-[10px] text-gray-400 font-mono">FPS:</span>
              <input
                type="number"
                min={1}
                max={30}
                value={fps}
                onChange={(e) => setFps(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                className="w-7 bg-transparent text-[11px] font-mono text-emerald-400 text-center focus:outline-none"
              />
            </div>
          </div>

          <div className="h-3 w-px bg-gray-700 hidden sm:block" />

          {/* 어니언 스킨 토글 */}
          <button
            onClick={onToggleOnionSkin}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold border flex items-center gap-1 transition-colors ${
              onionSkinEnabled
                ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300'
                : 'bg-[#0A0A0A] border-gray-800 text-gray-400 hover:text-gray-200'
            }`}
            title="이전 프레임의 잔상을 캔버스에 반투명하게 표시 (어니언 스킨)"
          >
            <Eye className="w-3 h-3" />
            <span>Onion Skin</span>
          </button>
        </div>

        {/* 우측 컨트롤: 프레임 추가/복제 및 내보내기 연동 */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => onDuplicateFrame(activeFrameId)}
            className="px-2 py-1 rounded text-[11px] font-medium bg-[#161616] hover:bg-gray-800 text-gray-200 border border-gray-700 flex items-center gap-1 transition-colors"
            title="현재 프레임의 그림을 복사하여 다음 프레임으로 생성 (스프라이트 연속 동작 제작)"
          >
            <Copy className="w-3 h-3 text-emerald-400" />
            <span className="hidden sm:inline">프레임 복제</span>
          </button>

          <button
            onClick={onAddFrame}
            className="px-2 py-1 rounded text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1 shadow-sm transition-colors"
            title="새로운 빈 스프라이트 프레임 추가"
          >
            <Plus className="w-3 h-3" />
            <span className="hidden sm:inline">새 프레임</span>
          </button>

          <button
            onClick={onOpenExportModal}
            className="px-2 py-1 rounded text-[11px] font-semibold bg-[#161616] hover:bg-gray-800 text-emerald-400 border border-emerald-800/80 flex items-center gap-1 transition-colors ml-1"
            title="스프라이트 시트 (PNG / JSON 아틀라스) 내보내기 열기"
          >
            <Layers className="w-3 h-3" />
            <span>시트 내보내기</span>
          </button>

          {/* 접기/펼치기 토글 */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors ml-1"
            title={isCollapsed ? '타임라인 펼치기' : '타임라인 접기'}
          >
            {isCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* 프레임 트랙 (펼쳐진 상태) */}
      {!isCollapsed && (
        <div className="flex items-center gap-3 p-2.5 pb-20 md:pb-2.5 overflow-x-auto bg-[#0A0A0A]/90 min-h-[76px]">
          {/* 좌측 실시간 미니 프리뷰 윈도우 */}
          <div className="flex flex-col items-center gap-0.5 border-r border-gray-800 pr-3 flex-shrink-0">
            <span className="text-[9px] font-mono text-gray-500 uppercase">Preview</span>
            <div className="w-[48px] h-[48px] bg-checkered rounded border border-gray-800 flex items-center justify-center overflow-hidden shadow-inner">
              <canvas ref={previewCanvasRef} className="pixelated" />
            </div>
          </div>

          {/* 수평 프레임 카드 리스트 */}
          <div className="flex items-center gap-2 flex-1">
            {frames.map((frame, index) => {
              const isActive = frame.id === activeFrameId;
              const thumbUrl = renderThumbnail(framePixels[index]);

              return (
                <div
                  key={frame.id}
                  onClick={() => onSelectFrame(frame.id)}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isActive}
                  aria-label={`프레임 ${index + 1}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectFrame(frame.id);
                    }
                  }}
                  className={`group relative flex-shrink-0 flex flex-col items-center justify-between p-1.5 rounded-lg border cursor-pointer transition-all ${
                    isActive
                      ? 'bg-emerald-950/40 border-emerald-500 shadow-md ring-1 ring-emerald-500/50'
                      : 'bg-[#161616] border-gray-800 hover:border-gray-700 hover:bg-[#1f1f1f]'
                  }`}
                  style={{ width: '64px', height: '64px' }}
                >
                  {/* 프레임 인덱스 넘버 태그 */}
                  <div className="w-full flex items-center justify-between">
                    <span className={`text-[9px] font-mono font-bold ${isActive ? 'text-emerald-400' : 'text-gray-400'}`}>
                      #{index + 1}
                    </span>

                    {/* 호버 액션: 좌/우 이동 & 삭제 */}
                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                      {index > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onMoveFrame(frame.id, 'left');
                          }}
                          className="p-0.5 hover:text-emerald-400 text-gray-400"
                          title="왼쪽으로 이동"
                        >
                          <ChevronLeft className="w-2.5 h-2.5" />
                        </button>
                      )}
                      {index < frames.length - 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onMoveFrame(frame.id, 'right');
                          }}
                          className="p-0.5 hover:text-emerald-400 text-gray-400"
                          title="오른쪽으로 이동"
                        >
                          <ChevronRight className="w-2.5 h-2.5" />
                        </button>
                      )}
                      {frames.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`프레임 #${index + 1}을(를) 삭제할까요?`)) {
                              onDeleteFrame(frame.id);
                            }
                          }}
                          className="p-0.5 hover:text-red-400 text-gray-500"
                          title="프레임 삭제"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 프레임 미니 썸네일 */}
                  <div className="w-8 h-8 bg-checkered rounded border border-gray-800/80 flex items-center justify-center overflow-hidden">
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={`Frame ${index + 1}`}
                        className="w-full h-full object-contain pixelated"
                      />
                    ) : (
                      <div className="w-full h-full" />
                    )}
                  </div>

                  {/* 프레임 이름 라벨 */}
                  <span className="text-[8px] font-mono text-gray-400 truncate max-w-full">
                    {frame.name.length > 7 ? `${frame.name.slice(0, 6)}..` : frame.name}
                  </span>
                </div>
              );
            })}

            {/* 프레임 추가 전용 카드 */}
            <button
              onClick={onAddFrame}
              className="flex-shrink-0 flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-800 hover:border-emerald-500 hover:bg-emerald-950/20 text-gray-500 hover:text-emerald-400 transition-all cursor-pointer"
              style={{ width: '64px', height: '64px' }}
              title="새 빈 프레임 추가"
            >
              <Plus className="w-4 h-4" />
              <span className="text-[8px] font-mono font-semibold">New Frame</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
