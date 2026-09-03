import React, { useState, useMemo } from 'react';
import { CodeExportFormat, Layer, LayerGroup } from '../types';
import { generateSourceCode, hasTransparentPixels } from '../utils/codeExport';
import { Code2, Copy, Check, X, FileCode, AlertTriangle } from 'lucide-react';

interface CodeExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  layers: Layer[];
  groups: LayerGroup[];
  width: number;
  height: number;
}

export const CodeExportModal: React.FC<CodeExportModalProps> = ({
  isOpen,
  onClose,
  layers,
  groups,
  width,
  height,
}) => {
  const [selectedFormat, setSelectedFormat] = useState<CodeExportFormat>('css');
  const [copied, setCopied] = useState(false);

  const code = useMemo(() => {
    if (!isOpen) return '';
    return generateSourceCode(layers, groups, width, height, selectedFormat);
  }, [isOpen, layers, groups, width, height, selectedFormat]);

  const showTransparencyWarning = useMemo(() => {
    if (!isOpen || selectedFormat !== 'arduino-c') return false;
    return hasTransparentPixels(layers, groups, width, height);
  }, [isOpen, layers, groups, width, height, selectedFormat]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formats: { id: CodeExportFormat; label: string; desc: string }[] = [
    { id: 'css', label: 'CSS Box-Shadow', desc: '단일 div 태그로 렌더링 가능한 순수 CSS 픽셀 아트' },
    { id: 'canvas', label: 'HTML5 Canvas 2D', desc: '웹 게임 및 JS 캔버스용 2D 드로잉 스크립트' },
    { id: 'svg', label: 'SVG Vector', desc: '무손실 해상도 벡터 그래픽 XML 태그' },
    { id: 'js-matrix', label: 'JavaScript 2D 배열', desc: '매트릭스 2차원 Hex 색상 배열' },
    { id: 'arduino-c', label: 'C / Arduino (RGB565)', desc: '마이크로컨트롤러, TFT_eSPI, OLED용 16비트 배열' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 select-none">
      <div className="bg-[#111111] border border-gray-800 rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-gray-200">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-800 bg-[#161616]">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-white">Export Pixel Art Source Code</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 포맷 선택 탭 바 */}
        <div className="flex border-b border-gray-800 px-5 pt-2 bg-[#161616]/60 gap-2 overflow-x-auto">
          {formats.map(fmt => (
            <button
              key={fmt.id}
              onClick={() => setSelectedFormat(fmt.id)}
              className={`pb-2.5 px-3 text-xs font-semibold border-b-2 whitespace-nowrap transition-all flex items-center gap-1.5 ${
                selectedFormat === fmt.id
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>{fmt.label}</span>
            </button>
          ))}
        </div>

        {/* 코드 미리보기 & 복사 바 */}
        <div className="flex-1 flex flex-col p-5 overflow-hidden">
          {showTransparencyWarning && (
            <div className="mb-2 flex items-start gap-2 rounded border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                RGB565 포맷은 투명도를 표현할 수 없어, 투명/반투명 픽셀이 검정색으로 변환됩니다.
              </span>
            </div>
          )}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">
              {formats.find(f => f.id === selectedFormat)?.desc}
            </span>
            <button
              onClick={handleCopy}
              className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[#161616] hover:bg-gray-800 text-gray-200 border border-gray-800'
              }`}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? '복사 완료!' : '코드 복사'}</span>
            </button>
          </div>

          <div className="flex-1 bg-[#0A0A0A] rounded-lg border border-gray-800 p-4 overflow-auto font-mono text-xs text-emerald-400/90 leading-relaxed select-text">
            <pre>{code}</pre>
          </div>
        </div>

        {/* 푸터 */}
        <div className="px-5 py-3 bg-[#161616] border-t border-gray-800 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded text-xs font-semibold text-gray-300 hover:bg-gray-800 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
