import React from 'react';
import { 
  Paintbrush, 
  Eraser, 
  PaintBucket, 
  Pipette, 
  Minus, 
  Square, 
  Circle, 
  Move,
  SquareDashed,
  FlipHorizontal,
  Grid, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw
} from 'lucide-react';
import { ToolType } from '../types';

interface ToolbarProps {
  currentTool: ToolType;
  onChangeTool: (tool: ToolType) => void;
  brushSize: number;
  onChangeBrushSize: (size: number) => void;
  fillShape: boolean;
  onToggleFillShape: () => void;
  horizontalSymmetry: boolean;
  onToggleHorizontalSymmetry: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  currentTool,
  onChangeTool,
  brushSize,
  onChangeBrushSize,
  fillShape,
  onToggleFillShape,
  horizontalSymmetry,
  onToggleHorizontalSymmetry,
  showGrid,
  onToggleGrid,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}) => {
  const tools: { id: ToolType; label: string; icon: React.ReactNode; shortcut: string }[] = [
    { id: 'brush', label: '브러시', icon: <Paintbrush className="w-4 h-4" />, shortcut: 'B' },
    { id: 'eraser', label: '지우개', icon: <Eraser className="w-4 h-4" />, shortcut: 'E' },
    { id: 'bucket', label: '페인트 통', icon: <PaintBucket className="w-4 h-4" />, shortcut: 'G' },
    { id: 'picker', label: '스포이트', icon: <Pipette className="w-4 h-4" />, shortcut: 'I' },
    { id: 'line', label: '직선', icon: <Minus className="w-4 h-4" />, shortcut: 'L' },
    { id: 'rect', label: '사각형', icon: <Square className="w-4 h-4" />, shortcut: 'U' },
    { id: 'circle', label: '원형', icon: <Circle className="w-4 h-4" />, shortcut: 'C' },
    { id: 'select', label: '영역 선택', icon: <SquareDashed className="w-4 h-4" />, shortcut: 'S' },
    { id: 'move', label: '화면 이동', icon: <Move className="w-4 h-4" />, shortcut: 'M' },
  ];

  return (
    <aside className="fixed bottom-3 left-1/2 -translate-x-1/2 md:translate-x-0 md:static md:left-auto md:bottom-auto w-[94%] max-w-fit md:w-14 bg-[#111111] border border-gray-800 rounded-xl md:rounded-none md:border-r md:border-l-0 md:border-t-0 md:border-b-0 p-2 md:py-3 flex md:flex-col items-center justify-between md:justify-start gap-1 md:gap-2 z-20 shadow-2xl md:shadow-none overflow-x-auto">
      {/* 도구 모음 */}
      <div className="flex md:flex-col items-center gap-1">
        {tools.map(tool => {
          const isActive = currentTool === tool.id;
          return (
            <button
              key={tool.id}
              id={`tool-${tool.id}`}
              onClick={() => onChangeTool(tool.id)}
              aria-label={`${tool.label} (${tool.shortcut})`}
              aria-pressed={isActive}
              className={`relative w-8 h-8 rounded flex items-center justify-center transition-all ${
                isActive
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
              title={`${tool.label} (${tool.shortcut})`}
            >
              {tool.icon}
            </button>
          );
        })}
      </div>

      <div className="w-px h-6 md:w-8 md:h-px bg-gray-800 shrink-0 my-0.5" />

      {/* 브러시 크기 (1px ~ 4px) */}
      <div className="flex md:flex-col items-center gap-1">
        {[1, 2, 3, 4].map(size => (
          <button
            key={size}
            onClick={() => onChangeBrushSize(size)}
            aria-label={`브러시 크기: ${size}px`}
            aria-pressed={brushSize === size}
            className={`w-7 h-7 rounded text-xs font-mono font-bold flex items-center justify-center transition-all ${
              brushSize === size
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
            title={`브러시 크기: ${size}px${size === 1 ? ' ([)' : size === 4 ? ' (])' : ''}`}
          >
            {size}
          </button>
        ))}
      </div>

      <div className="w-px h-6 md:w-8 md:h-px bg-gray-800 shrink-0 my-0.5" />

      {/* 도형 채우기 및 대칭 드로잉 */}
      <div className="flex md:flex-col items-center gap-1">
        {/* 도형 채우기 토글 (도형 도구 선택 시 활성) */}
        {(currentTool === 'rect' || currentTool === 'circle') && (
          <button
            onClick={onToggleFillShape}
            aria-label={fillShape ? '도형 채우기 모드 (켜짐)' : '도형 외곽선 모드'}
            aria-pressed={fillShape}
            className={`w-8 h-8 rounded flex items-center justify-center text-xs transition-colors ${
              fillShape
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
            }`}
            title={fillShape ? '도형 채우기 모드 (켜짐)' : '도형 외곽선 모드'}
          >
            <Square className={`w-3.5 h-3.5 ${fillShape ? 'fill-emerald-400' : ''}`} />
          </button>
        )}

        {/* 좌우 대칭(미러) 드로잉 모드 */}
        <button
          onClick={onToggleHorizontalSymmetry}
          aria-label={horizontalSymmetry ? '좌우 대칭 모드 (활성)' : '좌우 대칭 모드 켜기'}
          aria-pressed={horizontalSymmetry}
          className={`w-8 h-8 rounded flex items-center justify-center text-xs transition-colors ${
            horizontalSymmetry
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
              : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
          }`}
          title={horizontalSymmetry ? '좌우 대칭 모드 (활성)' : '좌우 대칭 모드 켜기'}
        >
          <FlipHorizontal className="w-4 h-4" />
        </button>

        {/* 그리드 선 표시/숨김 */}
        <button
          onClick={onToggleGrid}
          aria-label={showGrid ? '그리드 숨기기' : '그리드 보기'}
          aria-pressed={showGrid}
          className={`w-8 h-8 rounded flex items-center justify-center text-xs transition-colors ${
            showGrid
              ? 'bg-gray-800 text-emerald-400'
              : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
          }`}
          title={showGrid ? '그리드 숨기기' : '그리드 보기'}
        >
          <Grid className="w-4 h-4" />
        </button>
      </div>

      {/* 데스크탑 전용 줌 단축 버튼 */}
      <div className="hidden md:flex flex-col items-center gap-1 mt-auto pb-1">
        <div className="w-8 h-px bg-gray-800 my-1" />
        <button
          onClick={onZoomIn}
          className="p-1.5 rounded text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
          title="확대 (+)"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onResetZoom}
          className="px-1 py-0.5 rounded text-[10px] font-mono text-gray-400 hover:text-emerald-400 hover:bg-gray-800 transition-colors"
          title="배율 초기화 (100%)"
        >
          {Math.round((zoom / 16) * 100)}%
        </button>
        <button
          onClick={onZoomOut}
          className="p-1.5 rounded text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
          title="축소 (-)"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
};
