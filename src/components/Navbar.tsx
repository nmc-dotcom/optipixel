import React, { useRef } from 'react';
import {
  Undo2,
  Redo2,
  Maximize2,
  Image as ImageIcon,
  SlidersHorizontal,
  Code2,
  Download,
  Trash2,
  Layers,
  Palette,
  Save,
  FolderOpen
} from 'lucide-react';

interface NavbarProps {
  canvasWidth: number;
  canvasHeight: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenSizeModal: () => void;
  onOpenConvertModal: () => void;
  onOpenFiltersModal: () => void;
  isFiltersOpen?: boolean;
  onOpenCodeModal: () => void;
  onOpenExportModal: () => void;
  onClearCanvas: () => void;
  onExportProject: () => void;
  onImportProject: (file: File) => void;
  onToggleMobileLayers: () => void;
  onToggleMobilePalette: () => void;
  activeMobileTab: 'none' | 'layers' | 'palette';
}

export const Navbar: React.FC<NavbarProps> = ({
  canvasWidth,
  canvasHeight,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenSizeModal,
  onOpenConvertModal,
  onOpenFiltersModal,
  isFiltersOpen = false,
  onOpenCodeModal,
  onOpenExportModal,
  onClearCanvas,
  onExportProject,
  onImportProject,
  onToggleMobileLayers,
  onToggleMobilePalette,
  activeMobileTab,
}) => {
  const projectInputRef = useRef<HTMLInputElement>(null);

  return (
    <header className="h-12 border-b border-gray-800 bg-[#111111] px-3 md:px-4 flex items-center justify-between gap-3 z-30 shrink-0 select-none text-gray-300 overflow-x-auto">
      {/* Brand & Canvas Dimensions Info */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-emerald-500 rounded-sm grid grid-cols-2 shadow-sm overflow-hidden shrink-0">
            <div className="bg-white/20" />
            <div className="bg-black/20" />
            <div className="bg-black/10" />
            <div className="bg-white/10" />
          </div>
          <div className="hidden sm:block">
            <h1 className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
              opti<span className="text-emerald-500">pixel</span>
            </h1>
          </div>
        </div>

        {/* 캔버스 크기 프리셋 버튼 */}
        <button
          id="btn-canvas-size"
          onClick={onOpenSizeModal}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono bg-[#1A1A1A] hover:bg-gray-800 text-gray-300 hover:text-white border border-gray-800 transition-colors"
          title="캔버스 해상도 프리셋 및 크기 변경"
        >
          <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Canvas: {canvasWidth}×{canvasHeight}</span>
        </button>
      </div>

      {/* 액션 컨트롤 버튼 바 */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {/* Undo / Redo */}
        <div className="flex items-center bg-[#1A1A1A] border border-gray-800 rounded p-0.5">
          <button
            id="btn-undo"
            onClick={onUndo}
            disabled={!canUndo}
            className={`p-1.5 rounded text-xs transition-colors ${
              canUndo 
                ? 'text-gray-300 hover:bg-gray-800 hover:text-emerald-400' 
                : 'text-gray-600 cursor-not-allowed'
            }`}
            title="실행 취소 (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            id="btn-redo"
            onClick={onRedo}
            disabled={!canRedo}
            className={`p-1.5 rounded text-xs transition-colors ${
              canRedo 
                ? 'text-gray-300 hover:bg-gray-800 hover:text-emerald-400' 
                : 'text-gray-600 cursor-not-allowed'
            }`}
            title="다시 실행 (Ctrl+Y)"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        {/* 이미지 도트 변환 */}
        <button
          id="btn-convert-image"
          onClick={onOpenConvertModal}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium bg-[#1A1A1A] hover:bg-gray-800 text-gray-300 hover:text-white border border-gray-800 shadow-sm transition-all"
          title="이미지를 도트 그래픽으로 변환"
        >
          <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden md:inline">도트 변환</span>
        </button>

        {/* 필터 */}
        <button
          id="btn-filters"
          onClick={onOpenFiltersModal}
          className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded text-xs font-medium border flex items-center gap-1 transition-all ${
            isFiltersOpen
              ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm font-semibold'
              : 'bg-[#1A1A1A] hover:bg-gray-800 text-gray-300 hover:text-white border-gray-800'
          }`}
          title="레이어 필터 및 실시간 톤 조절 패널"
        >
          <SlidersHorizontal className={`w-3.5 h-3.5 ${isFiltersOpen ? 'text-white' : 'text-emerald-400'}`} />
          <span className="hidden lg:inline">필터</span>
        </button>

        {/* 프로젝트 파일 열기 */}
        <button
          id="btn-open-project"
          onClick={() => projectInputRef.current?.click()}
          className="p-1.5 rounded text-gray-400 hover:text-emerald-400 hover:bg-gray-800/60 transition-colors"
          title="프로젝트 파일(.json) 열기"
        >
          <FolderOpen className="w-4 h-4" />
        </button>
        <input
          ref={projectInputRef}
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImportProject(file);
            e.target.value = '';
          }}
          className="hidden"
        />

        {/* 프로젝트 파일로 저장 */}
        <button
          id="btn-save-project"
          onClick={onExportProject}
          className="p-1.5 rounded text-gray-400 hover:text-emerald-400 hover:bg-gray-800/60 transition-colors"
          title="프로젝트를 파일(.json)로 저장 — 레이어/그룹 구조가 그대로 보존됩니다"
        >
          <Save className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-gray-800 mx-1 hidden sm:block" />

        {/* 소스코드 추출 */}
        <button
          id="btn-export-code"
          onClick={onOpenCodeModal}
          className="p-1.5 sm:px-2.5 sm:py-1.5 rounded text-xs font-medium bg-[#1A1A1A] hover:bg-gray-800 text-gray-300 hover:text-white border border-gray-800 flex items-center gap-1 transition-colors"
          title="CSS / Canvas / SVG / C 소스코드 추출"
        >
          <Code2 className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden lg:inline">코드 추출</span>
        </button>

        {/* 스트라이프 및 이미지 내보내기 */}
        <button
          id="btn-export-image"
          onClick={onOpenExportModal}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-colors"
          title="PNG, SVG, 스트라이프(스프라이트 시트) 내보내기 (Ctrl+S)"
        >
          <Download className="w-3.5 h-3.5" />
          <span>내보내기</span>
        </button>

        <div className="h-4 w-px bg-gray-800 mx-1 hidden sm:block" />

        {/* 캔버스 전체 지우기 */}
        <button
          id="btn-clear-canvas"
          onClick={onClearCanvas}
          className="p-1.5 rounded text-gray-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors hidden sm:flex"
          title="현재 활성 레이어 지우기"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        {/* 모바일 전용: 레이어 및 팔레트 토글 탭 버튼 */}
        <div className="flex md:hidden items-center gap-1 ml-1">
          <button
            onClick={onToggleMobilePalette}
            className={`p-1.5 rounded text-xs border ${
              activeMobileTab === 'palette' 
                ? 'bg-emerald-600 text-white border-emerald-500' 
                : 'bg-[#1A1A1A] text-gray-300 border-gray-800'
            }`}
            title="팔레트"
          >
            <Palette className="w-4 h-4" />
          </button>
          <button
            onClick={onToggleMobileLayers}
            className={`p-1.5 rounded text-xs border ${
              activeMobileTab === 'layers' 
                ? 'bg-emerald-600 text-white border-emerald-500' 
                : 'bg-[#1A1A1A] text-gray-300 border-gray-800'
            }`}
            title="레이어"
          >
            <Layers className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
