import React, { useState, useEffect } from 'react';
import { PalettePreset } from '../types';
import { DEFAULT_PALETTES } from '../constants/presets';
import { Plus, Trash2, FolderPlus, Download, Upload, Check, Globe, Loader2 } from 'lucide-react';

interface ColorPalettePanelProps {
  primaryColor: string;
  secondaryColor: string;
  onSelectPrimaryColor: (color: string) => void;
  onSelectSecondaryColor: (color: string) => void;
  activePalette: PalettePreset;
  onChangePalette: (palette: PalettePreset) => void;
  customPalettes: PalettePreset[];
  onSaveCustomPalette: (newPalette: PalettePreset) => void;
  onDeleteCustomPalette: (id: string) => void;
  onCloseMobile?: () => void;
}

export const ColorPalettePanel: React.FC<ColorPalettePanelProps> = ({
  primaryColor,
  secondaryColor,
  onSelectPrimaryColor,
  onSelectSecondaryColor,
  activePalette,
  onChangePalette,
  customPalettes,
  onSaveCustomPalette,
  onDeleteCustomPalette,
  onCloseMobile,
}) => {
  const [hexInput, setHexInput] = useState(primaryColor);
  const [newPaletteName, setNewPaletteName] = useState('');
  const [showNewPaletteInput, setShowNewPaletteInput] = useState(false);

  // Lospec 팔레트 가져오기 상태
  const [showLospecInput, setShowLospecInput] = useState(false);
  const [lospecQuery, setLospecQuery] = useState('');
  const [lospecLoading, setLospecLoading] = useState(false);
  const [lospecError, setLospecError] = useState<string | null>(null);

  useEffect(() => {
    setHexInput(primaryColor);
  }, [primaryColor]);

  const allPalettes = [...DEFAULT_PALETTES, ...customPalettes];

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setHexInput(val);
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      onSelectPrimaryColor(val);
    }
  };

  const handleAddCurrentColorToPalette = () => {
    // 활성 팔레트가 기본 프리셋이면 복제하여 커스텀 팔레트로 승격
    let targetPalette = activePalette;
    if (targetPalette.category !== 'custom') {
      const cloned: PalettePreset = {
        id: `custom-${Date.now()}`,
        name: `${targetPalette.name} (편집본)`,
        category: 'custom',
        colors: [...targetPalette.colors],
      };
      onSaveCustomPalette(cloned);
      targetPalette = cloned;
      onChangePalette(cloned);
    }

    if (!targetPalette.colors.includes(primaryColor)) {
      const updated: PalettePreset = {
        ...targetPalette,
        colors: [...targetPalette.colors, primaryColor],
      };
      onSaveCustomPalette(updated);
      onChangePalette(updated);
    }
  };

  const handleRemoveColor = (colorToRemove: string) => {
    if (activePalette.category !== 'custom') return;
    const updated: PalettePreset = {
      ...activePalette,
      colors: activePalette.colors.filter(c => c !== colorToRemove),
    };
    onSaveCustomPalette(updated);
    onChangePalette(updated);
  };

  const handleCreateNewPalette = () => {
    if (!newPaletteName.trim()) return;
    const newPal: PalettePreset = {
      id: `custom-${Date.now()}`,
      name: newPaletteName.trim(),
      category: 'custom',
      colors: [primaryColor, '#000000', '#ffffff', '#10b981'],
    };
    onSaveCustomPalette(newPal);
    onChangePalette(newPal);
    setNewPaletteName('');
    setShowNewPaletteInput(false);
  };

  const handleExportPalette = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(activePalette, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `${activePalette.name.replace(/\s+/g, '_')}_palette.json`);
    dlAnchor.click();
  };

  const HEX_COLOR_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

  /**
   * Lospec(lospec.com/palette-list)에서 팔레트를 가져온다.
   * 슬러그("pico-8")와 전체 URL 양쪽 모두 받아들인다.
   */
  const handleFetchLospecPalette = async () => {
    const raw = lospecQuery.trim();
    if (!raw) return;

    // URL을 붙여넣어도 되도록 마지막 경로 조각만 슬러그로 사용
    const slug = raw
      .replace(/^https?:\/\/(www\.)?lospec\.com\/palette-list\//i, '')
      .replace(/\.(json|csv)$/i, '')
      .replace(/[/?#].*$/, '')
      .trim()
      .toLowerCase();

    if (!/^[a-z0-9-]+$/.test(slug)) {
      setLospecError('올바른 팔레트 이름(슬러그) 또는 주소가 아닙니다.');
      return;
    }

    setLospecLoading(true);
    setLospecError(null);

    try {
      const res = await fetch(`https://lospec.com/palette-list/${slug}.json`);
      if (!res.ok) {
        setLospecError(
          res.status === 404
            ? `"${slug}" 팔레트를 찾을 수 없습니다.`
            : `가져오기에 실패했습니다 (HTTP ${res.status}).`
        );
        return;
      }

      const data = await res.json();
      // Lospec은 색상을 "#" 없이 반환하므로 붙여준다
      const colors: string[] = Array.isArray(data?.colors)
        ? data.colors
            .filter((c: unknown): c is string => typeof c === 'string')
            .map((c: string) => (c.startsWith('#') ? c : `#${c}`))
            .filter((c: string) => HEX_COLOR_RE.test(c))
        : [];

      if (colors.length === 0) {
        setLospecError('팔레트에 유효한 색상이 없습니다.');
        return;
      }

      const imported: PalettePreset = {
        id: `custom-lospec-${slug}-${Date.now()}`,
        name: typeof data?.name === 'string' && data.name.trim() ? data.name : slug,
        category: 'custom',
        colors,
      };

      onSaveCustomPalette(imported);
      onChangePalette(imported);
      setLospecQuery('');
      setShowLospecInput(false);
    } catch {
      setLospecError('네트워크 오류로 가져오지 못했습니다. 연결을 확인해주세요.');
    } finally {
      setLospecLoading(false);
    }
  };

  const handleImportPalette = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        const validColors = Array.isArray(parsed.colors) && parsed.colors.length > 0
          && parsed.colors.every((c: unknown) => typeof c === 'string' && HEX_COLOR_RE.test(c));

        if (typeof parsed.name !== 'string' || !parsed.name.trim() || !validColors) {
          alert('올바른 팔레트 JSON 파일이 아닙니다 (name과 유효한 hex 색상 배열 colors가 필요합니다).');
          return;
        }

        const imported: PalettePreset = {
          id: `custom-${Date.now()}`,
          name: parsed.name,
          category: 'custom',
          colors: parsed.colors,
        };
        onSaveCustomPalette(imported);
        onChangePalette(imported);
      } catch (err) {
        alert('올바른 팔레트 JSON 파일이 아닙니다.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="w-full md:w-64 bg-[#111111] border-t md:border-t-0 md:border-r border-gray-800 p-3 flex flex-col gap-3 select-none h-full overflow-y-auto">
      {/* 타이틀 및 모바일 닫기 */}
      <div className="flex items-center justify-between pb-1 border-b border-gray-800/80">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm bg-emerald-500" />
          Color Palette
        </h3>
        {onCloseMobile && (
          <button 
            onClick={onCloseMobile}
            className="md:hidden text-xs text-gray-400 hover:text-white px-2 py-0.5 rounded bg-gray-800"
          >
            닫기
          </button>
        )}
      </div>

      {/* Primary & Secondary Color 박스 */}
      <div className="flex items-center gap-3 p-2.5 rounded-lg bg-[#161616] border border-gray-800">
        <div className="relative w-12 h-12 shrink-0">
          {/* Secondary Color (뒤쪽 우클릭 색상) */}
          <div 
            className="absolute bottom-0 right-0 w-8 h-8 rounded border-2 border-gray-800 shadow-md cursor-pointer transition-transform hover:scale-105"
            style={{ backgroundColor: secondaryColor }}
            onClick={() => onSelectPrimaryColor(secondaryColor)}
            title={`보조 색상 (우클릭): ${secondaryColor}`}
          />
          {/* Primary Color (앞쪽 좌클릭 색상) */}
          <label className="absolute top-0 left-0 w-8 h-8 rounded border-2 border-white shadow-lg cursor-pointer overflow-hidden transition-transform hover:scale-105">
            <input 
              type="color" 
              value={primaryColor.startsWith('#') && primaryColor.length === 7 ? primaryColor : '#10b981'} 
              onChange={(e) => onSelectPrimaryColor(e.target.value)}
              className="opacity-0 w-full h-full cursor-pointer"
            />
            <div 
              className="w-full h-full"
              style={{ backgroundColor: primaryColor }}
            />
          </label>
        </div>

        {/* HEX Input */}
        <div className="flex-1 min-w-0">
          <span className="text-[10px] text-gray-400 block mb-0.5 font-mono">HEX CODE</span>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={hexInput}
              onChange={handleHexChange}
              className="w-full bg-[#0A0A0A] border border-gray-800 rounded px-2 py-1 text-xs font-mono text-gray-200 focus:outline-none focus:border-emerald-500"
              maxLength={7}
            />
          </div>
        </div>
      </div>

      {/* 팔레트 선택 셀렉터 */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span className="text-[10px] font-mono uppercase text-gray-500">Preset</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowNewPaletteInput(!showNewPaletteInput)}
              className="p-1 rounded text-gray-400 hover:text-emerald-400 hover:bg-gray-800"
              title="새 커스텀 팔레트 만들기"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setShowLospecInput(!showLospecInput);
                setLospecError(null);
              }}
              className={`p-1 rounded hover:bg-gray-800 ${
                showLospecInput ? 'text-emerald-400' : 'text-gray-400 hover:text-emerald-400'
              }`}
              title="Lospec에서 팔레트 가져오기 (lospec.com/palette-list)"
            >
              <Globe className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleExportPalette}
              className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-800"
              title="팔레트 JSON 내보내기"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <label className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-800 cursor-pointer" title="팔레트 JSON 불러오기">
              <Upload className="w-3.5 h-3.5" />
              <input type="file" accept=".json" onChange={handleImportPalette} className="hidden" />
            </label>
          </div>
        </div>

        {/* Lospec 팔레트 가져오기 인라인 입력 */}
        {showLospecInput && (
          <div className="flex flex-col gap-1 p-1.5 bg-[#1A1A1A] rounded border border-emerald-600/50 mb-1">
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={lospecQuery}
                onChange={(e) => {
                  setLospecQuery(e.target.value);
                  setLospecError(null);
                }}
                placeholder="예: pico-8 또는 주소 붙여넣기"
                disabled={lospecLoading}
                className="flex-1 min-w-0 bg-[#0A0A0A] text-xs px-2 py-1 rounded text-white focus:outline-none disabled:opacity-50"
                onKeyDown={(e) => e.key === 'Enter' && handleFetchLospecPalette()}
              />
              <button
                onClick={handleFetchLospecPalette}
                disabled={lospecLoading || !lospecQuery.trim()}
                className="p-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-500 disabled:bg-gray-700 disabled:cursor-not-allowed shrink-0"
                title="가져오기"
              >
                {lospecLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              </button>
            </div>
            {lospecError ? (
              <span className="text-[10px] text-rose-400 leading-snug">{lospecError}</span>
            ) : (
              <span className="text-[10px] text-gray-500 leading-snug">
                lospec.com/palette-list 의 팔레트 이름을 입력하세요
              </span>
            )}
          </div>
        )}

        {/* 신규 팔레트 인라인 입력 */}
        {showNewPaletteInput && (
          <div className="flex items-center gap-1 p-1 bg-[#1A1A1A] rounded border border-emerald-600/50 mb-1">
            <input
              type="text"
              value={newPaletteName}
              onChange={(e) => setNewPaletteName(e.target.value)}
              placeholder="팔레트 이름..."
              className="flex-1 bg-[#0A0A0A] text-xs px-2 py-1 rounded text-white focus:outline-none"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateNewPalette()}
            />
            <button
              onClick={handleCreateNewPalette}
              className="p-1 bg-emerald-600 text-white rounded text-xs hover:bg-emerald-500"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <select
          value={activePalette.id}
          onChange={(e) => {
            const found = allPalettes.find(p => p.id === e.target.value);
            if (found) onChangePalette(found);
          }}
          className="w-full bg-[#1A1A1A] text-xs text-gray-200 border border-gray-800 rounded px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
        >
          <optgroup label="기본 클래식 프리셋">
            {DEFAULT_PALETTES.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </optgroup>
          {customPalettes.length > 0 && (
            <optgroup label="내 커스텀 팔레트">
              {customPalettes.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      {/* 팔레트 색상 스와치 그리드 */}
      <div className="flex-1 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span className="text-[10px] font-mono text-gray-500 uppercase">Swatches ({activePalette.colors.length})</span>
          <button
            onClick={handleAddCurrentColorToPalette}
            className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-medium px-1.5 py-0.5 rounded hover:bg-emerald-950/40 transition-colors"
            title="현재 선택된 색상을 이 팔레트에 추가"
          >
            <Plus className="w-3 h-3" />
            <span>색상 추가</span>
          </button>
        </div>

        <div className="grid grid-cols-6 gap-1.5 p-2 bg-[#0A0A0A] rounded-lg border border-gray-800 max-h-56 md:max-h-64 overflow-y-auto">
          {activePalette.colors.map((color, idx) => {
            const isSelectedPrimary = primaryColor.toLowerCase() === color.toLowerCase();
            const isSelectedSecondary = secondaryColor.toLowerCase() === color.toLowerCase();

            return (
              <div key={`${color}-${idx}`} className="group relative aspect-square">
                <button
                  onClick={() => onSelectPrimaryColor(color)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onSelectSecondaryColor(color);
                  }}
                  className={`w-full h-full rounded-sm border transition-transform hover:scale-110 ${
                    isSelectedPrimary 
                      ? 'border-white ring-2 ring-emerald-400 ring-offset-2 ring-offset-[#111] scale-105 z-10' 
                      : isSelectedSecondary
                      ? 'border-amber-400 ring-2 ring-amber-400 ring-offset-1 ring-offset-[#111] scale-105'
                      : 'border-white/10 hover:border-white/40'
                  }`}
                  style={{ backgroundColor: color }}
                  title={`${color} (좌클릭: 주색상, 우클릭: 보조색상)`}
                />

                {/* 커스텀 팔레트일 때 색상 삭제 버튼 */}
                {activePalette.category === 'custom' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveColor(color);
                    }}
                    className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-rose-600 text-white rounded-full items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hidden sm:flex text-[9px]"
                    title="색상 삭제"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* 커스텀 팔레트 삭제 버튼 */}
        {activePalette.category === 'custom' && (
          <button
            onClick={() => {
              if (window.confirm(`"${activePalette.name}" 팔레트를 삭제할까요?`)) {
                onDeleteCustomPalette(activePalette.id);
              }
            }}
            className="text-[11px] text-gray-500 hover:text-rose-400 flex items-center justify-center gap-1 py-1 mt-auto transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            <span>이 커스텀 팔레트 삭제</span>
          </button>
        )}
      </div>
    </div>
  );
};
