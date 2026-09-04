import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Frame, StripeExportSettings } from '../types';
import { 
  downloadCanvasAsPng, 
  downloadSvgFile, 
  downloadJsonFile,
  generateStripeCanvas,
  generateSpriteAtlasJson,
  generateCssSpriteAnimation
} from '../utils/stripeExport';
import { compositeLayers, flattenLayers } from '../utils/pixelEngine';
import { generateSourceCode } from '../utils/codeExport';
import { 
  Download, 
  X, 
  Layers, 
  Play, 
  Pause, 
  FileCode, 
  Image as ImageIcon,
  Check,
  Copy,
  Plus,
  AlertCircle
} from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  frames: Frame[];
  /** 단일 이미지/코드 내보내기의 대상이 되는 현재 프레임 */
  activeFrame: Frame;
  width: number;
  height: number;
  onDuplicateCurrentFrame?: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  frames,
  activeFrame,
  width,
  height,
  onDuplicateCurrentFrame,
}) => {
  // 단일 이미지/코드 탭은 지금 보고 있는 프레임 하나만 다룬다
  const layers = activeFrame.layers;
  const groups = activeFrame.groups;

  // 프레임마다 레이어를 합성한 픽셀 (애니메이션 미리보기용)
  const framePixels = useMemo(
    () => frames.map(f => flattenLayers(f.layers, f.groups, width, height)),
    [frames, width, height]
  );
  const [activeTab, setActiveTab] = useState<'single' | 'stripe' | 'animation'>('stripe');
  const [copiedCss, setCopiedCss] = useState(false);

  // 단일 이미지 설정
  const [singleScale, setSingleScale] = useState(8);
  const [singleBg, setSingleBg] = useState<'transparent' | 'solid'>('transparent');
  const [singleBgColor, setSingleBgColor] = useState('#0f172a');

  // 스트라이프 이미지 설정
  const [stripeSettings, setStripeSettings] = useState<StripeExportSettings>({
    layout: 'horizontal',
    columns: 4,
    scale: 4,
    spacing: 0,
    backgroundColor: 'transparent',
    includeHiddenLayers: false,
  });

  // 애니메이션 프리뷰 설정
  const [isPlaying, setIsPlaying] = useState(true);
  const [fps, setFps] = useState(6);
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const animCanvasRef = useRef<HTMLCanvasElement>(null);

  // 실시간 스트라이프 캔버스 생성 및 프리뷰 렌더
  useEffect(() => {
    if (!isOpen || activeTab !== 'stripe') return;

    const canvas = generateStripeCanvas(frames, width, height, stripeSettings);
    const previewCanvas = previewCanvasRef.current;
    if (!previewCanvas) return;

    previewCanvas.width = canvas.width;
    previewCanvas.height = canvas.height;
    const ctx = previewCanvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(canvas, 0, 0);
    }
  }, [isOpen, activeTab, frames, width, height, stripeSettings]);

  // 애니메이션 렌더 루프
  useEffect(() => {
    if (!isOpen || activeTab !== 'animation' || !isPlaying) return;

    if (frames.length === 0) return;

    const interval = setInterval(() => {
      setCurrentFrameIdx(prev => (prev + 1) % frames.length);
    }, 1000 / fps);

    return () => clearInterval(interval);
  }, [isOpen, activeTab, isPlaying, fps, frames.length]);

  // 애니메이션 단일 프레임 렌더
  useEffect(() => {
    if (!isOpen || activeTab !== 'animation') return;
    const target = framePixels[currentFrameIdx] || framePixels[0];
    if (!target) return;

    const canvas = animCanvasRef.current;
    if (!canvas) return;

    const scale = 8;
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 합성된 프레임 ImageData 렌더
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
    ctx.drawImage(temp, 0, 0, width, height, 0, 0, canvas.width, canvas.height);
  }, [isOpen, activeTab, currentFrameIdx, framePixels, width, height]);

  if (!isOpen) return null;

  // 단일 PNG 내보내기 처리
  const handleDownloadSinglePng = () => {
    const canvas = document.createElement('canvas');
    canvas.width = width * singleScale;
    canvas.height = height * singleScale;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    if (singleBg === 'solid') {
      ctx.fillStyle = singleBgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    const compData = compositeLayers(layers, groups, width, height);
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    tempCanvas.getContext('2d')!.putImageData(compData, 0, 0);

    ctx.drawImage(tempCanvas, 0, 0, width, height, 0, 0, canvas.width, canvas.height);
    downloadCanvasAsPng(canvas, `pixel_art_${width}x${height}_${singleScale}x.png`);
  };

  // 단일 SVG 다운로드 처리
  const handleDownloadSvg = () => {
    const svgContent = generateSourceCode(layers, groups, width, height, 'svg');
    downloadSvgFile(svgContent, `pixel_art_${width}x${height}.svg`);
  };

  // 스트라이프 다운로드 처리
  const handleDownloadStripe = () => {
    const canvas = generateStripeCanvas(frames, width, height, stripeSettings);
    downloadCanvasAsPng(canvas, `stripe_sheet_${stripeSettings.layout}_${width * stripeSettings.scale}x${height * stripeSettings.scale}.png`);
  };

  // 스프라이트 아틀라스 JSON 다운로드 처리
  const handleDownloadAtlasJson = () => {
    const pngName = `stripe_sheet_${stripeSettings.layout}_${width * stripeSettings.scale}x${height * stripeSettings.scale}.png`;
    const jsonContent = generateSpriteAtlasJson(frames, width, height, stripeSettings, pngName);
    downloadJsonFile(jsonContent, `sprite_atlas_${stripeSettings.layout}.json`);
  };

  // CSS 스프라이트 steps() 애니메이션 코드 클립보드 복사
  const handleCopyCssAnimation = () => {
    const css = generateCssSpriteAnimation(width, height, Math.max(1, frames.length), stripeSettings.scale, fps);
    navigator.clipboard.writeText(css).then(() => {
      setCopiedCss(true);
      setTimeout(() => setCopiedCss(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 select-none">
      <div className="bg-[#111111] border border-gray-800 rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-gray-200">
        {/* 헤더 */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-gray-800 bg-[#161616]">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white">Export Image & Sprite Sheet</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 탭 네비게이션 */}
        <div className="shrink-0 flex border-b border-gray-800 px-5 pt-2 bg-[#161616]/60 gap-2">
          <button
            onClick={() => setActiveTab('stripe')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'stripe'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Sprite Sheet (Stripe)</span>
          </button>
          <button
            onClick={() => setActiveTab('single')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'single'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Single Image (PNG / SVG)</span>
          </button>
          <button
            onClick={() => setActiveTab('animation')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'animation'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Animation Viewer</span>
          </button>
        </div>

        {/* 바디 컨텐츠 */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* TAB 1: 스트라이프 이미지 (스프라이트 시트 / 스트립) */}
          {activeTab === 'stripe' && (
            <div className="flex flex-col gap-4">
              <div className="text-xs text-gray-400 leading-relaxed">
                각 레이어를 개별 프레임으로 취급하여 가로 스트립, 세로 스트립 또는 바둑판 격자 형태로 묶어서 내보냅니다. 2D 게임 엔진(유니티, 고도, 언리얼, Phaser)에서 스프라이트 시트와 아틀라스 메타데이터로 바로 사용할 수 있습니다.
              </div>

              {/* 1개 프레임일 때 안내 배너 및 복제 버튼 */}
              {frames.length <= 1 ? (
                <div className="bg-amber-950/30 border border-amber-800/60 rounded-lg p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-amber-300 text-xs">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <span>현재 <strong>1개의 레이어(프레임)</strong>만 존재합니다. 애니메이션 스프라이트 시트를 만들려면 프레임을 복제하거나 추가하세요.</span>
                  </div>
                  {onDuplicateCurrentFrame && (
                    <button
                      onClick={onDuplicateCurrentFrame}
                      className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-semibold flex items-center gap-1 transition-colors flex-shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>현재 프레임 복제</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="bg-emerald-950/20 border border-emerald-800/40 rounded-lg px-3 py-2 flex items-center justify-between text-xs text-emerald-400">
                  <span>총 <strong>{frames.length}개</strong>의 스프라이트 프레임이 시트로 패킹됩니다.</span>
                  {onDuplicateCurrentFrame && (
                    <button
                      onClick={onDuplicateCurrentFrame}
                      className="text-[11px] hover:underline flex items-center gap-1 text-emerald-300"
                    >
                      <Plus className="w-3 h-3" />
                      <span>새 프레임 복제 추가</span>
                    </button>
                  )}
                </div>
              )}

              {/* 프리뷰 영역 */}
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-mono uppercase text-gray-400">Sprite Sheet Preview</span>
                <div className="h-44 bg-checkered rounded-lg border border-gray-800 p-3 flex items-center justify-center overflow-auto">
                  <canvas ref={previewCanvasRef} className="pixelated shadow-lg max-h-full max-w-full" />
                </div>
              </div>

              {/* 옵션 컨트롤 그리드 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#161616] p-4 rounded-lg border border-gray-800">
                {/* 1. 레이아웃 배치 */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono uppercase text-gray-400">Layout</label>
                  <div className="grid grid-cols-3 gap-1.5 text-xs">
                    {(['horizontal', 'vertical', 'grid'] as const).map(l => (
                      <button
                        key={l}
                        onClick={() => setStripeSettings(s => ({ ...s, layout: l }))}
                        className={`py-1.5 rounded capitalize border transition-colors ${
                          stripeSettings.layout === l
                            ? 'bg-emerald-600 text-white border-emerald-500 font-bold'
                            : 'bg-[#0A0A0A] border-gray-800 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                        }`}
                      >
                        {l === 'horizontal' ? '가로 스트립' : l === 'vertical' ? '세로 스트립' : '격자 (Grid)'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. 픽셀 확대 배율 */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono uppercase text-gray-400">Scale</label>
                  <div className="grid grid-cols-5 gap-1 text-xs">
                    {[1, 2, 4, 8, 16].map(s => (
                      <button
                        key={s}
                        onClick={() => setStripeSettings(set => ({ ...set, scale: s }))}
                        className={`py-1.5 rounded border font-mono transition-colors ${
                          stripeSettings.scale === s
                            ? 'bg-emerald-600 text-white border-emerald-500 font-bold'
                            : 'bg-[#0A0A0A] border-gray-800 text-gray-400 hover:bg-gray-800'
                        }`}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. 배경색 */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono uppercase text-gray-400">Background</label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setStripeSettings(s => ({ ...s, backgroundColor: 'transparent' }))}
                      className={`flex-1 py-1.5 rounded text-xs border transition-colors ${
                        stripeSettings.backgroundColor === 'transparent'
                          ? 'bg-emerald-600 text-white border-emerald-500 font-semibold'
                          : 'bg-[#0A0A0A] border-gray-800 text-gray-400'
                      }`}
                    >
                      투명 (Transparent)
                    </button>
                    <button
                      onClick={() => setStripeSettings(s => ({ ...s, backgroundColor: '#000000' }))}
                      className={`flex-1 py-1.5 rounded text-xs border transition-colors ${
                        stripeSettings.backgroundColor !== 'transparent'
                          ? 'bg-emerald-600 text-white border-emerald-500 font-semibold'
                          : 'bg-[#0A0A0A] border-gray-800 text-gray-400'
                      }`}
                    >
                      불투명 배경
                    </button>
                  </div>
                </div>

                {/* 4. 프레임 간격 (Spacing) */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-[10px] font-mono uppercase text-gray-400">
                    <span>Frame Padding</span>
                    <span className="font-mono text-emerald-400">{stripeSettings.spacing}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={16}
                    value={stripeSettings.spacing}
                    onChange={(e) => setStripeSettings(s => ({ ...s, spacing: Number(e.target.value) }))}
                    className="w-full accent-emerald-500 h-1.5 bg-gray-800 rounded cursor-pointer"
                  />
                </div>
              </div>

              {/* 스프라이트 포맷 내보내기 액션 버튼 바 */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-800">
                <div className="flex flex-wrap items-center gap-2">
                  {/* 1. CSS steps() 복사 */}
                  <button
                    onClick={handleCopyCssAnimation}
                    className="px-3 py-2 rounded text-xs font-semibold bg-[#161616] hover:bg-gray-800 text-gray-300 border border-gray-800 flex items-center gap-1.5 transition-colors"
                    title="CSS @keyframes 및 steps() 스프라이트 애니메이션 코드 클립보드 복사"
                  >
                    {copiedCss ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
                    <span>{copiedCss ? 'CSS 코드 복사 완료!' : 'CSS Steps() 코드 복사'}</span>
                  </button>

                  {/* 2. JSON Sprite Atlas 다운로드 */}
                  <button
                    onClick={handleDownloadAtlasJson}
                    className="px-3 py-2 rounded text-xs font-semibold bg-[#161616] hover:bg-gray-800 text-emerald-400 border border-emerald-900/60 flex items-center gap-1.5 transition-colors"
                    title="TexturePacker, Phaser, PixiJS, Godot 호환 Sprite Atlas JSON 파일 다운로드"
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    <span>Sprite Atlas (.json)</span>
                  </button>
                </div>

                {/* 3. 스트라이프 시트 PNG 다운로드 */}
                <button
                  onClick={handleDownloadStripe}
                  className="px-5 py-2.5 rounded text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-2 shadow-lg shadow-emerald-950/60 transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>스프라이트 시트 (PNG) 다운로드</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: 단일 이미지 (PNG / SVG) */}
          {activeTab === 'single' && (
            <div className="flex flex-col gap-5">
              <div className="text-xs text-gray-400 leading-relaxed">
                현재 활성화된 모든 레이어를 고화질 픽셀 아트로 결합하여 단일 PNG 또는 무손실 벡터 SVG 파일로 내보냅니다.
              </div>

              {/* 확대 배율 선택 */}
              <div className="flex flex-col gap-2 bg-[#161616] p-4 rounded-lg border border-gray-800">
                <label className="text-[10px] font-mono uppercase text-gray-400">Export Scale (Nearest-Neighbor)</label>
                <div className="grid grid-cols-6 gap-2">
                  {[1, 2, 4, 8, 16, 32].map(scale => (
                    <button
                      key={scale}
                      onClick={() => setSingleScale(scale)}
                      className={`py-2 rounded text-xs font-mono border flex flex-col items-center justify-center transition-all ${
                        singleScale === scale
                          ? 'bg-emerald-600 text-white border-emerald-500 font-bold shadow-md'
                          : 'bg-[#0A0A0A] border-gray-800 text-gray-300 hover:bg-gray-800'
                      }`}
                    >
                      <span className="text-sm">{scale}x</span>
                      <span className="text-[10px] text-gray-500">
                        {width * scale}×{height * scale}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 배경 설정 */}
              <div className="grid grid-cols-2 gap-3 bg-[#161616] p-4 rounded-lg border border-gray-800">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-mono uppercase text-gray-400">Background Style</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSingleBg('transparent')}
                      className={`flex-1 py-2 rounded text-xs border transition-colors ${
                        singleBg === 'transparent'
                          ? 'bg-emerald-600 text-white border-emerald-500 font-semibold'
                          : 'bg-[#0A0A0A] border-gray-800 text-gray-400'
                      }`}
                    >
                      투명 배경 (PNG)
                    </button>
                    <button
                      onClick={() => setSingleBg('solid')}
                      className={`flex-1 py-2 rounded text-xs border transition-colors ${
                        singleBg === 'solid'
                          ? 'bg-emerald-600 text-white border-emerald-500 font-semibold'
                          : 'bg-[#0A0A0A] border-gray-800 text-gray-400'
                      }`}
                    >
                      단색 배경
                    </button>
                  </div>
                </div>

                {singleBg === 'solid' && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-mono uppercase text-gray-400">Background Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={singleBgColor}
                        onChange={(e) => setSingleBgColor(e.target.value)}
                        className="w-8 h-8 rounded border border-gray-700 bg-transparent cursor-pointer"
                      />
                      <input
                        type="text"
                        value={singleBgColor}
                        onChange={(e) => setSingleBgColor(e.target.value)}
                        className="flex-1 bg-[#0A0A0A] border border-gray-800 rounded px-2.5 py-1 text-xs font-mono text-gray-200"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 다운로드 버튼 2개 */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={handleDownloadSvg}
                  className="px-4 py-2.5 rounded text-xs font-semibold bg-[#161616] hover:bg-gray-800 text-gray-200 border border-gray-800 flex items-center gap-2 transition-all"
                >
                  <FileCode className="w-4 h-4 text-emerald-400" />
                  <span>SVG 벡터 다운로드</span>
                </button>
                <button
                  onClick={handleDownloadSinglePng}
                  className="px-5 py-2.5 rounded text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-2 shadow-lg shadow-emerald-950/60 transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>PNG 다운로드 ({width * singleScale}×{height * singleScale})</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: 애니메이션 뷰어 */}
          {activeTab === 'animation' && (
            <div className="flex flex-col items-center gap-4">
              <div className="text-xs text-gray-400 text-center max-w-lg">
                표시 가능한 각 레이어를 순차적인 애니메이션 프레임으로 루프 재생합니다. 캐릭터 걷기, 점프, 공격 등의 모션을 확인하세요.
              </div>

              <div className="w-64 h-64 bg-checkered rounded-lg border border-gray-800 flex items-center justify-center shadow-inner overflow-hidden">
                <canvas ref={animCanvasRef} className="pixelated shadow-lg" />
              </div>

              {/* 애니메이션 재생 컨트롤 */}
              <div className="flex items-center gap-4 bg-[#161616] border border-gray-800 px-4 py-2 rounded-lg">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-2 rounded bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
                  title={isPlaying ? '일시 정지' : '재생'}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">속도 (FPS):</span>
                  <input
                    type="range"
                    min={1}
                    max={24}
                    value={fps}
                    onChange={(e) => setFps(Number(e.target.value))}
                    className="w-24 accent-emerald-500 h-1.5 bg-gray-800 rounded cursor-pointer"
                  />
                  <span className="font-mono text-xs text-emerald-400 w-8">{fps} fps</span>
                </div>

                <div className="text-xs font-mono text-gray-500">
                  프레임: {currentFrameIdx + 1} / {frames.length}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
