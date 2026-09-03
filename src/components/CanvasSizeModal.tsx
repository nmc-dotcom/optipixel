import React, { useState } from 'react';
import { RESOLUTION_PRESETS } from '../constants/presets';
import { Maximize2, X, Check, ArrowRight } from 'lucide-react';

interface CanvasSizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentWidth: number;
  currentHeight: number;
  onResizeCanvas: (newWidth: number, newHeight: number, mode: 'crop-expand' | 'rescale' | 'clear') => void;
}

export const CanvasSizeModal: React.FC<CanvasSizeModalProps> = ({
  isOpen,
  onClose,
  currentWidth,
  currentHeight,
  onResizeCanvas,
}) => {
  const [selectedWidth, setSelectedWidth] = useState(currentWidth);
  const [selectedHeight, setSelectedHeight] = useState(currentHeight);
  const [resizeMode, setResizeMode] = useState<'crop-expand' | 'rescale' | 'clear'>('crop-expand');
  const [lockAspect, setLockAspect] = useState(true);

  if (!isOpen) return null;

  const handlePresetClick = (w: number, h: number) => {
    setSelectedWidth(w);
    setSelectedHeight(h);
  };

  const handleWidthChange = (val: number) => {
    const clamped = Math.max(4, Math.min(128, val));
    setSelectedWidth(clamped);
    if (lockAspect) {
      setSelectedHeight(clamped);
    }
  };

  const handleHeightChange = (val: number) => {
    const clamped = Math.max(4, Math.min(128, val));
    setSelectedHeight(clamped);
    if (lockAspect) {
      setSelectedWidth(clamped);
    }
  };

  const handleApply = () => {
    onResizeCanvas(selectedWidth, selectedHeight, resizeMode);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-[#111111] border border-gray-800 rounded-xl w-full max-w-md shadow-2xl overflow-hidden text-gray-200">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-800 bg-[#161616]">
          <div className="flex items-center gap-2">
            <Maximize2 className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white">Canvas Resolution & Size</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* 1. 해상도 프리셋 목록 */}
          <div>
            <label className="text-[10px] font-mono uppercase text-gray-500 mb-2 block tracking-wider">
              Resolution Presets
            </label>
            <div className="grid grid-cols-2 gap-2">
              {RESOLUTION_PRESETS.map(preset => {
                const isSelected = selectedWidth === preset.width && selectedHeight === preset.height;
                return (
                  <button
                    key={preset.label}
                    onClick={() => handlePresetClick(preset.width, preset.height)}
                    className={`p-2.5 rounded-lg text-left border transition-all flex flex-col ${
                      isSelected
                        ? 'bg-emerald-500/10 border-emerald-500/50 text-white shadow-sm ring-1 ring-emerald-500/40'
                        : 'bg-[#161616] border-gray-800 hover:bg-gray-800/60 text-gray-300'
                    }`}
                  >
                    <span className="font-mono text-xs font-bold text-emerald-400">
                      {preset.width} × {preset.height} px
                    </span>
                    <span className="text-[10px] text-gray-500 truncate">
                      {preset.label.split('(')[1]?.replace(')', '') || preset.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. 사용자 정의 커스텀 사이즈 */}
          <div className="bg-[#161616] p-3.5 rounded-lg border border-gray-800 flex flex-col gap-3">
            <div className="flex items-center justify-between text-xs font-semibold text-gray-300">
              <span className="text-[11px] font-mono uppercase text-gray-400">Custom Size (4~128px)</span>
              <label className="flex items-center gap-1.5 text-[11px] text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={lockAspect}
                  onChange={(e) => setLockAspect(e.target.checked)}
                  className="accent-emerald-500 rounded"
                />
                <span>1:1 Square</span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3 items-center">
              <div>
                <span className="text-[10px] font-mono uppercase text-gray-500 block mb-1">Width</span>
                <div className="flex items-center gap-2 bg-[#0A0A0A] border border-gray-800 rounded px-2.5 py-1.5">
                  <input
                    type="number"
                    min={4}
                    max={128}
                    value={selectedWidth}
                    onChange={(e) => handleWidthChange(Number(e.target.value))}
                    className="w-full bg-transparent font-mono text-sm text-white focus:outline-none"
                  />
                  <span className="text-xs text-gray-500 font-mono">px</span>
                </div>
              </div>

              <div>
                <span className="text-[10px] font-mono uppercase text-gray-500 block mb-1">Height</span>
                <div className="flex items-center gap-2 bg-[#0A0A0A] border border-gray-800 rounded px-2.5 py-1.5">
                  <input
                    type="number"
                    min={4}
                    max={128}
                    value={selectedHeight}
                    onChange={(e) => handleHeightChange(Number(e.target.value))}
                    className="w-full bg-transparent font-mono text-sm text-white focus:outline-none"
                  />
                  <span className="text-xs text-gray-500 font-mono">px</span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. 변경 방식 (크롭/확장 vs 스케일 변환 vs 새로 지우기) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-mono uppercase text-gray-500">Layer Handling Mode</label>
            <div className="grid grid-cols-3 gap-1.5 text-xs">
              <button
                onClick={() => setResizeMode('crop-expand')}
                className={`p-2 rounded border text-center transition-all ${
                  resizeMode === 'crop-expand'
                    ? 'bg-emerald-600 text-white border-emerald-500 font-bold'
                    : 'bg-[#161616] border-gray-800 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }`}
              >
                자르기 / 확장
              </button>
              <button
                onClick={() => setResizeMode('rescale')}
                className={`p-2 rounded border text-center transition-all ${
                  resizeMode === 'rescale'
                    ? 'bg-emerald-600 text-white border-emerald-500 font-bold'
                    : 'bg-[#161616] border-gray-800 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }`}
              >
                비율 리스케일
              </button>
              <button
                onClick={() => setResizeMode('clear')}
                className={`p-2 rounded border text-center transition-all ${
                  resizeMode === 'clear'
                    ? 'bg-rose-950/80 text-rose-300 border-rose-600 font-bold'
                    : 'bg-[#161616] border-gray-800 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }`}
              >
                새 빈 캔버스
              </button>
            </div>
          </div>
        </div>

        {/* 푸터 버튼 */}
        <div className="px-5 py-3.5 bg-[#161616] border-t border-gray-800 flex items-center justify-between">
          <div className="text-xs font-mono text-gray-400 flex items-center gap-1.5">
            <span>{currentWidth}×{currentHeight}</span>
            <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-emerald-400 font-bold">{selectedWidth}×{selectedHeight}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs text-gray-400 hover:text-white"
            >
              취소
            </button>
            <button
              onClick={handleApply}
              className="px-4 py-1.5 rounded text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1 shadow-md transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>크기 적용</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
