import React, { useState, useEffect, useRef } from 'react';
import { DitherType, DownscaleMethod, ImageConversionSettings } from '../types';
import { RESOLUTION_PRESETS } from '../constants/presets';
import { convertImageToPixels, detectPixelScale, DetectedPixelScale, loadImageFromFile } from '../utils/imageConverter';
import { Upload, X, Sliders, Sparkles, RefreshCw, Check, Wand2 } from 'lucide-react';

interface ImageToPixelModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentWidth: number;
  currentHeight: number;
  activePaletteColors: string[];
  onApplyConversion: (pixels: string[], targetWidth: number, targetHeight: number, asNewLayer: boolean) => void;
}

export const ImageToPixelModal: React.FC<ImageToPixelModalProps> = ({
  isOpen,
  onClose,
  currentWidth,
  currentHeight,
  activePaletteColors,
  onApplyConversion,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(null);
  const [previewPixels, setPreviewPixels] = useState<string[] | null>(null);

  const [settings, setSettings] = useState<ImageConversionSettings>({
    targetWidth: currentWidth,
    targetHeight: currentHeight,
    fitMode: 'fit',
    colorCount: 16,
    useCurrentPalette: false,
    dither: 'atkinson',
    brightness: 0,
    contrast: 15,
    saturation: 10,
    edgePreservation: 45,
    cleanupOrphanPixels: true,
    downscaleMethod: 'edge-preserving',
    alphaThreshold: 50,
  });

  // 업스케일된 픽셀 아트에서 감지된 원본 픽셀 크기 제안 (없으면 null)
  const [detectedScale, setDetectedScale] = useState<DetectedPixelScale | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 현재 캔버스 크기로 리셋
  useEffect(() => {
    if (isOpen) {
      setSettings(prev => ({
        ...prev,
        targetWidth: currentWidth,
        targetHeight: currentHeight,
      }));
    }
  }, [isOpen, currentWidth, currentHeight]);

  // 원본 이미지 픽셀 수 상한 (초과 시 대용량 메모리 할당/브라우저 멈춤 방지를 위해 거부)
  const MAX_SOURCE_PIXELS = 4096 * 4096;

  // 이미지 파일 로드
  const handleFileChange = async (file: File) => {
    try {
      setSelectedFile(file);
      setDetectedScale(null);
      const img = await loadImageFromFile(file);

      if (img.width * img.height > MAX_SOURCE_PIXELS) {
        alert(
          `이미지 해상도가 너무 큽니다 (${img.width}×${img.height}). ` +
          `4096×4096 이하의 이미지를 사용해주세요.`
        );
        setSelectedFile(null);
        return;
      }

      setLoadedImage(img);
      setDetectedScale(detectPixelScale(img));
    } catch (err) {
      alert('이미지를 불러오는데 실패했습니다. 지원되는 이미지 파일(PNG, JPG, GIF 등)인지 확인해주세요.');
      setSelectedFile(null);
    }
  };

  // 감지된 원본 픽셀 크기를 변환 설정에 즉시 적용
  const applyDetectedScale = () => {
    if (!detectedScale) return;
    setSettings(s => ({
      ...s,
      targetWidth: detectedScale.suggestedWidth,
      targetHeight: detectedScale.suggestedHeight,
      fitMode: 'stretch',
      downscaleMethod: 'dominant',
    }));
    setDetectedScale(null);
  };

  // 파라미터 변경 시 픽셀 변환 재계산
  // 슬라이더를 드래그하는 동안 매 tick마다 무거운 변환 파이프라인이 동기적으로
  // 재실행되어 UI가 멈추는 것을 막기 위해 디바운스를 적용한다.
  useEffect(() => {
    if (!loadedImage) return;

    const timeoutId = window.setTimeout(() => {
      const result = convertImageToPixels(loadedImage, settings, activePaletteColors);
      setPreviewPixels(result.pixels);

      // 프리뷰 캔버스에 렌더
      const canvas = previewCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = settings.targetWidth;
      canvas.height = settings.targetHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const imgData = ctx.createImageData(canvas.width, canvas.height);
      for (let i = 0; i < result.pixels.length; i++) {
        const hex = result.pixels[i];
        const pIdx = i * 4;
        if (hex) {
          const num = parseInt(hex.replace('#', ''), 16);
          imgData.data[pIdx] = (num >> 16) & 255;
          imgData.data[pIdx + 1] = (num >> 8) & 255;
          imgData.data[pIdx + 2] = num & 255;
          imgData.data[pIdx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [loadedImage, settings, activePaletteColors]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 select-none">
      <div className="bg-[#111111] border border-gray-800 rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-gray-200">
        {/* 모달 헤더 */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-gray-800 bg-[#161616]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white">Image to Pixel Art Conversion</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 모달 바디: 2열 구성 (좌측: 프리뷰, 우측: 변환 파라미터) */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-y-auto p-4 md:p-6 gap-6">
          {/* 좌측: 원본 및 도트 변환 결과 미리보기 */}
          <div className="md:col-span-6 flex flex-col gap-4">
            {!loadedImage ? (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files?.[0]) handleFileChange(e.dataTransfer.files[0]);
                }}
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 min-h-[260px] border-2 border-dashed border-gray-800 hover:border-emerald-500 rounded-xl bg-[#161616]/50 flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-colors group"
              >
                <Upload className="w-10 h-10 text-gray-600 group-hover:text-emerald-400 transition-colors mb-3" />
                <p className="text-sm font-semibold text-gray-200 mb-1">
                  변환할 이미지를 드래그하거나 클릭하여 업로드
                </p>
                <span className="text-xs text-gray-500">
                  PNG, JPG, WebP, GIF 지원
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="flex flex-col gap-3 flex-1">
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>변환 미리보기 ({settings.targetWidth} × {settings.targetHeight} px)</span>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-emerald-400 hover:underline flex items-center gap-1 text-xs"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>다른 이미지 선택</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
                    className="hidden"
                  />
                </div>

                {/* 픽셀 아트 업스케일 감지 배너 */}
                {detectedScale && (
                  <div className="flex items-start gap-2 p-2.5 bg-emerald-950/30 border border-emerald-700/50 rounded-lg text-xs">
                    <Wand2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <div className="flex-1 text-emerald-300 leading-snug">
                      픽셀 아트 업스케일 감지됨 (약 {detectedScale.scaleX}×{detectedScale.scaleY}배,
                      신뢰도 {Math.round(detectedScale.confidence * 100)}%). 원본 크기{' '}
                      {detectedScale.suggestedWidth}×{detectedScale.suggestedHeight}로 되돌릴까요?
                    </div>
                    <button
                      onClick={applyDetectedScale}
                      className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shrink-0"
                    >
                      적용
                    </button>
                    <button
                      onClick={() => setDetectedScale(null)}
                      className="p-0.5 text-emerald-500/70 hover:text-emerald-300 shrink-0"
                      title="닫기"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* 픽셀화 프리뷰 캔버스 뷰포트 */}
                <div className="flex-1 min-h-[260px] flex items-center justify-center bg-checkered rounded-lg border border-gray-800 p-4 overflow-hidden">
                  <canvas
                    ref={previewCanvasRef}
                    style={{
                      width: Math.min(280, settings.targetWidth * 8),
                      height: Math.min(280, settings.targetHeight * 8),
                    }}
                    className="pixelated shadow-2xl border border-gray-700 rounded-sm max-w-full max-h-[280px]"
                  />
                </div>

                <div className="text-[11px] text-gray-500 text-center">
                  * 픽셀 확대 렌더링으로 최종 스프라이트의 디테일을 보여줍니다.
                </div>
              </div>
            )}
          </div>

          {/* 우측: 변환 파라미터 튜닝 컨트롤 */}
          <div className="md:col-span-6 flex flex-col gap-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 font-mono">
              <Sliders className="w-3.5 h-3.5" />
              Conversion Parameters
            </h3>

            {/* 1. 타겟 해상도 프리셋 선택 (128x128 포함) */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-mono uppercase text-gray-400">Target Resolution</label>
                <span className="text-[10px] font-mono text-emerald-400 font-semibold">
                  {settings.targetWidth} × {settings.targetHeight} px
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {RESOLUTION_PRESETS.map(preset => (
                  <button
                    key={preset.label}
                    onClick={() => setSettings(s => ({ ...s, targetWidth: preset.width, targetHeight: preset.height }))}
                    className={`px-2 py-1.5 rounded text-xs font-mono border transition-all ${
                      settings.targetWidth === preset.width && settings.targetHeight === preset.height
                        ? 'bg-emerald-600 text-white border-emerald-500 font-bold shadow-sm'
                        : 'bg-[#161616] border-gray-800 text-gray-300 hover:bg-gray-800'
                    }`}
                  >
                    {preset.width} × {preset.height}
                  </button>
                ))}
                {/* 현재 캔버스 크기 버튼 */}
                <button
                  onClick={() => setSettings(s => ({ ...s, targetWidth: currentWidth, targetHeight: currentHeight }))}
                  className={`px-1.5 py-1.5 rounded text-[11px] font-mono border transition-all truncate ${
                    settings.targetWidth === currentWidth && settings.targetHeight === currentHeight && !RESOLUTION_PRESETS.some(p => p.width === currentWidth && p.height === currentHeight && settings.targetWidth === p.width)
                      ? 'bg-emerald-600 text-white border-emerald-500 font-bold shadow-sm'
                      : 'bg-[#161616] border-gray-800 text-emerald-400/90 hover:bg-gray-800'
                  }`}
                  title={`현재 캔버스 크기 (${currentWidth} × ${currentHeight})`}
                >
                  캔버스 ({currentWidth})
                </button>
              </div>
            </div>

            {/* 2. 비율 맞춤 모드 (Fit Mode) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-mono uppercase text-gray-400">Aspect Ratio Fit</label>
              <div className="grid grid-cols-3 gap-1.5 text-xs">
                {(['fit', 'crop', 'stretch'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setSettings(s => ({ ...s, fitMode: mode }))}
                    className={`py-1.5 rounded capitalize border transition-colors ${
                      settings.fitMode === mode
                        ? 'bg-emerald-600 text-white border-emerald-500 font-semibold'
                        : 'bg-[#161616] border-gray-800 text-gray-300 hover:bg-gray-800'
                    }`}
                  >
                    {mode === 'fit' ? '비율 유지 (Fit)' : mode === 'crop' ? '화면 채움 (Crop)' : '늘이기 (Stretch)'}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. 팔레트 & 디더링 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono uppercase text-gray-400">Color Count</label>
                <select
                  value={settings.colorCount}
                  onChange={(e) => setSettings(s => ({ ...s, colorCount: Number(e.target.value) }))}
                  className="bg-[#0A0A0A] border border-gray-800 rounded text-xs px-2.5 py-1.5 text-gray-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value={4}>4색 (Game Boy 풍)</option>
                  <option value={8}>8색 (초기 레트로)</option>
                  <option value={16}>16색 (Pico-8 / 8비트)</option>
                  <option value={32}>32색 (16비트 아케이드)</option>
                  <option value={64}>64색 (풍부한 도트)</option>
                  <option value={256}>256색 (풀 컬러)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono uppercase text-gray-400">Dithering Algorithm</label>
                <select
                  value={settings.dither}
                  onChange={(e) => setSettings(s => ({ ...s, dither: e.target.value as DitherType }))}
                  className="bg-[#0A0A0A] border border-gray-800 rounded text-xs px-2.5 py-1.5 text-gray-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="atkinson">Atkinson (레트로 정밀 도트 - 추천)</option>
                  <option value="floyd-steinberg">Floyd-Steinberg (부드러운 음영)</option>
                  <option value="bayer4x4">Bayer 4x4 (클래식 격자 도트)</option>
                  <option value="none">없음 (단색 플랫)</option>
                </select>
              </div>
            </div>

            {/* 고급 필터 옵션: 엣지 보존 & 노이즈 정리 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label
                className="flex items-start gap-2 p-2 bg-[#161616] rounded-lg border border-gray-800 cursor-pointer"
                title="켜면 Color Count 설정을 무시하고 왼쪽 팔레트 패널의 현재 팔레트 색상에만 강제로 매핑합니다. 특정 게임/레트로 팔레트에 정확히 맞추고 싶을 때만 사용하세요 — 일반 사진에는 색이 심하게 뭉개질 수 있습니다."
              >
                <input
                  type="checkbox"
                  checked={settings.useCurrentPalette}
                  onChange={(e) => setSettings(s => ({ ...s, useCurrentPalette: e.target.checked }))}
                  className="accent-emerald-500 rounded mt-0.5"
                />
                <span className="flex flex-col">
                  <span className="text-xs text-gray-300">에디터 팔레트 강제 맵핑</span>
                  <span className="text-[10px] text-gray-500 leading-snug">
                    Color Count 무시, 현재 팔레트 색상으로만 변환 (특정 팔레트에 맞출 때만 사용)
                  </span>
                </span>
              </label>

              <label className="flex items-center gap-2 p-2 bg-[#161616] rounded-lg border border-gray-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.cleanupOrphanPixels}
                  onChange={(e) => setSettings(s => ({ ...s, cleanupOrphanPixels: e.target.checked }))}
                  className="accent-emerald-500 rounded"
                />
                <span className="text-xs text-gray-300">고립 픽셀 노이즈 제거</span>
              </label>
            </div>

            {/* 3-B. 다운스케일 방식 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-mono uppercase text-gray-400">Downscale Method</label>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {(['edge-preserving', 'dominant'] as const).map(method => (
                  <button
                    key={method}
                    onClick={() => setSettings(s => ({ ...s, downscaleMethod: method as DownscaleMethod }))}
                    title={
                      method === 'edge-preserving'
                        ? '평균+엣지 강조 블렌딩. 일반 사진/그림에 적합'
                        : '타일 내 최빈 색상 채택 (블렌딩 없음). 이미 픽셀 아트인 이미지에 적합'
                    }
                    className={`py-1.5 rounded border transition-colors ${
                      settings.downscaleMethod === method
                        ? 'bg-emerald-600 text-white border-emerald-500 font-semibold'
                        : 'bg-[#161616] border-gray-800 text-gray-300 hover:bg-gray-800'
                    }`}
                  >
                    {method === 'edge-preserving' ? '엣지 보존 (사진)' : '도미넌트 컬러 (픽셀 아트)'}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. 대비 / 밝기 / 엣지 보존 / 알파 임계값 슬라이더 */}
            <div className="flex flex-col gap-2.5 pt-1">
              {settings.downscaleMethod === 'edge-preserving' && (
                <div>
                  <div className="flex justify-between text-[10px] font-mono uppercase text-gray-400 mb-1">
                    <span>Edge Preservation (외곽선 보존)</span>
                    <span className="font-mono text-emerald-400">{settings.edgePreservation}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={settings.edgePreservation}
                    onChange={(e) => setSettings(s => ({ ...s, edgePreservation: Number(e.target.value) }))}
                    className="w-full accent-emerald-500 h-1.5 bg-gray-800 rounded cursor-pointer"
                  />
                </div>
              )}

              <div>
                <div className="flex justify-between text-[10px] font-mono uppercase text-gray-400 mb-1">
                  <span>Alpha Threshold (투명도 임계값)</span>
                  <span className="font-mono text-emerald-400">{settings.alphaThreshold}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={settings.alphaThreshold}
                  onChange={(e) => setSettings(s => ({ ...s, alphaThreshold: Number(e.target.value) }))}
                  className="w-full accent-emerald-500 h-1.5 bg-gray-800 rounded cursor-pointer"
                  title="이 커버리지 미만인 픽셀은 완전 투명, 이상이면 완전 불투명으로 이진화됩니다"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] font-mono uppercase text-gray-400 mb-1">
                  <span>Contrast (대비)</span>
                  <span className="font-mono text-emerald-400">{settings.contrast > 0 ? `+${settings.contrast}` : settings.contrast}%</span>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={settings.contrast}
                  onChange={(e) => setSettings(s => ({ ...s, contrast: Number(e.target.value) }))}
                  className="w-full accent-emerald-500 h-1.5 bg-gray-800 rounded cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] font-mono uppercase text-gray-400 mb-1">
                  <span>Brightness (밝기)</span>
                  <span className="font-mono text-emerald-400">{settings.brightness > 0 ? `+${settings.brightness}` : settings.brightness}%</span>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={settings.brightness}
                  onChange={(e) => setSettings(s => ({ ...s, brightness: Number(e.target.value) }))}
                  className="w-full accent-emerald-500 h-1.5 bg-gray-800 rounded cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 모달 푸터 액션 */}
        <div className="shrink-0 px-6 py-3.5 bg-[#161616] border-t border-gray-800 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded text-xs font-semibold text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            취소
          </button>
          <button
            onClick={() => {
              if (previewPixels) {
                onApplyConversion(previewPixels, settings.targetWidth, settings.targetHeight, true);
                onClose();
              }
            }}
            disabled={!previewPixels}
            className={`px-3.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 border transition-all ${
              previewPixels
                ? 'bg-[#161616] hover:bg-gray-800 text-white border-gray-700'
                : 'bg-gray-900 text-gray-600 border-gray-800 cursor-not-allowed'
            }`}
          >
            <span>새 레이어로 추가</span>
          </button>
          <button
            onClick={() => {
              if (previewPixels) {
                onApplyConversion(previewPixels, settings.targetWidth, settings.targetHeight, false);
                onClose();
              }
            }}
            disabled={!previewPixels}
            className={`px-4 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 shadow-lg transition-all ${
              previewPixels
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50'
                : 'bg-emerald-950/40 text-gray-600 cursor-not-allowed'
            }`}
          >
            <Check className="w-4 h-4" />
            <span>캔버스에 적용 (새로 시작)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
