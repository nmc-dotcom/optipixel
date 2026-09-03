import React, { useState } from 'react';
import { Layer, LayerGroup } from '../types';
import { 
  Eye, 
  EyeOff, 
  Lock, 
  Unlock, 
  Plus, 
  Trash2, 
  Copy, 
  ArrowUp, 
  ArrowDown, 
  FolderPlus, 
  ChevronRight, 
  ChevronDown, 
  Layers as LayersIcon,
  Combine
} from 'lucide-react';

interface LayersPanelProps {
  layers: Layer[];
  groups: LayerGroup[];
  activeLayerId: string;
  onSelectLayer: (id: string) => void;
  onAddLayer: (groupId?: string | null) => void;
  onDeleteLayer: (id: string) => void;
  onDuplicateLayer: (id: string) => void;
  onMergeLayerDown: (id: string) => void;
  onMoveLayer: (id: string, direction: 'up' | 'down') => void;
  onToggleLayerVisibility: (id: string) => void;
  onToggleLayerLock: (id: string) => void;
  onChangeLayerOpacity: (id: string, opacity: number) => void;
  onRenameLayer: (id: string, name: string) => void;
  onAssignLayerToGroup: (layerId: string, groupId: string | null) => void;
  // Groups
  onAddGroup: () => void;
  onDeleteGroup: (id: string) => void;
  onToggleGroupVisibility: (id: string) => void;
  onToggleGroupCollapse: (id: string) => void;
  onRenameGroup: (id: string, name: string) => void;
  onCloseMobile?: () => void;
}

export const LayersPanel: React.FC<LayersPanelProps> = ({
  layers,
  groups,
  activeLayerId,
  onSelectLayer,
  onAddLayer,
  onDeleteLayer,
  onDuplicateLayer,
  onMergeLayerDown,
  onMoveLayer,
  onToggleLayerVisibility,
  onToggleLayerLock,
  onChangeLayerOpacity,
  onRenameLayer,
  onAssignLayerToGroup,
  onAddGroup,
  onDeleteGroup,
  onToggleGroupVisibility,
  onToggleGroupCollapse,
  onRenameGroup,
  onCloseMobile,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const activeLayer = layers.find(l => l.id === activeLayerId);

  const startRename = (id: string, currentName: string) => {
    setEditingId(id);
    setEditingName(currentName);
  };

  const finishRename = (isGroup: boolean = false) => {
    if (editingId && editingName.trim()) {
      if (isGroup) {
        onRenameGroup(editingId, editingName.trim());
      } else {
        onRenameLayer(editingId, editingName.trim());
      }
    }
    setEditingId(null);
  };

  // 상단이 맨 위 레이어이므로 화면 표시를 위해 역순 인덱싱 지원
  const reversedLayers = [...layers].reverse();

  // 레이어를 그룹별로 분류하거나 ungrouped 레이어로 분리
  const ungroupedLayers = reversedLayers.filter(l => !l.groupId);

  return (
    <div className="w-full md:w-72 bg-[#111111] border-t md:border-t-0 md:border-l border-gray-800 p-3 flex flex-col gap-3 select-none h-full overflow-y-auto">
      {/* 헤더 & 액션 버튼 */}
      <div className="flex items-center justify-between pb-1 border-b border-gray-800/80">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500">
          <LayersIcon className="w-3.5 h-3.5 text-emerald-400" />
          <span>Layers & Groups</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onAddGroup}
            className="p-1 rounded text-gray-400 hover:text-emerald-400 hover:bg-gray-800"
            title="새 레이어 그룹 생성"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onAddLayer(null)}
            className="p-1 rounded text-gray-400 hover:text-emerald-400 hover:bg-gray-800"
            title="새 레이어 추가"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="md:hidden text-xs text-gray-400 hover:text-white px-2 py-0.5 rounded bg-gray-800 ml-1"
            >
              닫기
            </button>
          )}
        </div>
      </div>

      {/* 활성 레이어 불투명도 조절 슬라이더 */}
      {activeLayer && (
        <div className="bg-[#161616] border border-gray-800 rounded-lg p-2.5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[10px] font-mono text-gray-400 uppercase">
            <span>Opacity</span>
            <span className="font-mono text-emerald-400 font-bold">{Math.round(activeLayer.opacity * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(activeLayer.opacity * 100)}
            onChange={(e) => onChangeLayerOpacity(activeLayer.id, Number(e.target.value) / 100)}
            className="w-full accent-emerald-500 h-1.5 bg-gray-800 rounded cursor-pointer"
          />
        </div>
      )}

      {/* 레이어 목록 스크롤 영역 */}
      <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto pr-0.5">
        {/* 1. 그룹화된 레이어들 */}
        {groups.map(group => {
          const groupLayers = reversedLayers.filter(l => l.groupId === group.id);
          return (
            <div key={group.id} className="border border-gray-800 rounded-lg overflow-hidden bg-[#161616]/40">
              {/* 그룹 헤더 */}
              <div className="flex items-center justify-between px-2 py-1.5 bg-[#161616] hover:bg-gray-800/60 transition-colors">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <button
                    onClick={() => onToggleGroupCollapse(group.id)}
                    className="text-gray-400 hover:text-gray-200"
                  >
                    {group.collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  {editingId === group.id ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => finishRename(true)}
                      onKeyDown={(e) => e.key === 'Enter' && finishRename(true)}
                      autoFocus
                      className="bg-[#0A0A0A] text-xs px-1 rounded text-white border border-emerald-500 outline-none w-24"
                    />
                  ) : (
                    <span
                      onDoubleClick={() => startRename(group.id, group.name)}
                      className="text-xs font-semibold text-gray-300 truncate cursor-pointer hover:text-emerald-400"
                      title="더블클릭하여 이름 수정"
                    >
                      {group.name}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-500 font-mono">({groupLayers.length})</span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onAddLayer(group.id)}
                    className="p-1 rounded text-gray-400 hover:text-emerald-400"
                    title="이 그룹 안에 레이어 추가"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => onToggleGroupVisibility(group.id)}
                    className="p-1 rounded text-gray-400 hover:text-gray-200"
                    title={group.visible ? '그룹 숨기기' : '그룹 표시'}
                  >
                    {group.visible ? <Eye className="w-3.5 h-3.5 text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5 text-gray-600" />}
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`"${group.name}" 그룹을 삭제할까요? 내부 레이어는 유지됩니다.`)) {
                        onDeleteGroup(group.id);
                      }
                    }}
                    className="p-1 rounded text-gray-500 hover:text-rose-400"
                    title="그룹 삭제 (내부 레이어는 유지)"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* 그룹 내부 레이어 목록 */}
              {!group.collapsed && (
                <div className="pl-3 pr-1 py-1 flex flex-col gap-1 border-t border-gray-800">
                  {groupLayers.length === 0 ? (
                    <div className="text-[11px] text-gray-500 py-1 italic text-center">
                      그룹이 비어있습니다.
                    </div>
                  ) : (
                    groupLayers.map(layer => renderLayerItem(layer))
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* 2. 그룹에 속하지 않은 레이어들 */}
        {ungroupedLayers.map(layer => renderLayerItem(layer))}
      </div>

      {/* 선택된 레이어를 그룹에 배정 */}
      {activeLayer && groups.length > 0 && (
        <div className="border-t border-gray-800 pt-2 flex items-center gap-1.5 text-gray-400">
          <span className="text-[10px] font-mono uppercase shrink-0">그룹</span>
          <select
            value={activeLayer.groupId || ''}
            onChange={(e) => onAssignLayerToGroup(activeLayer.id, e.target.value || null)}
            className="flex-1 bg-[#161616] border border-gray-800 rounded text-xs px-1.5 py-1 text-gray-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="">그룹 없음</option>
            {groups.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* 선택된 레이어 하단 제어 바 (위/아래 이동, 복제, 병합, 삭제) */}
      {activeLayer && (
        <div className="border-t border-gray-800 pt-2 flex items-center justify-between text-gray-400">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onMoveLayer(activeLayer.id, 'up')}
              disabled={layers.indexOf(activeLayer) === layers.length - 1}
              className={`p-1.5 rounded transition-colors ${
                layers.indexOf(activeLayer) < layers.length - 1
                  ? 'hover:bg-gray-800 hover:text-white text-gray-400'
                  : 'text-gray-600 cursor-not-allowed'
              }`}
              title="레이어 위로 이동"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onMoveLayer(activeLayer.id, 'down')}
              disabled={layers.indexOf(activeLayer) === 0}
              className={`p-1.5 rounded transition-colors ${
                layers.indexOf(activeLayer) > 0
                  ? 'hover:bg-gray-800 hover:text-white text-gray-400'
                  : 'text-gray-600 cursor-not-allowed'
              }`}
              title="레이어 아래로 이동"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => onDuplicateLayer(activeLayer.id)}
              className="p-1.5 rounded hover:bg-gray-800 hover:text-emerald-400 transition-colors"
              title="레이어 복제 (Ctrl+D)"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onMergeLayerDown(activeLayer.id)}
              disabled={layers.indexOf(activeLayer) === 0}
              className={`p-1.5 rounded transition-colors ${
                layers.indexOf(activeLayer) > 0
                  ? 'hover:bg-gray-800 hover:text-emerald-400 text-gray-400'
                  : 'text-gray-600 cursor-not-allowed'
              }`}
              title="아래 레이어와 병합"
            >
              <Combine className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                if (window.confirm(`"${activeLayer.name}" 레이어를 삭제할까요?`)) {
                  onDeleteLayer(activeLayer.id);
                }
              }}
              disabled={layers.length <= 1}
              className={`p-1.5 rounded transition-colors ${
                layers.length > 1
                  ? 'hover:bg-rose-950/40 hover:text-rose-400 text-gray-400'
                  : 'text-gray-600 cursor-not-allowed'
              }`}
              title="레이어 삭제 (Delete)"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  function renderLayerItem(layer: Layer) {
    const isActive = layer.id === activeLayerId;

    return (
      <div
        key={layer.id}
        onClick={() => onSelectLayer(layer.id)}
        role="button"
        tabIndex={0}
        aria-pressed={isActive}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectLayer(layer.id);
          }
        }}
        className={`flex items-center justify-between px-2.5 py-2 rounded border transition-all cursor-pointer ${
          isActive
            ? 'bg-emerald-500/10 border-emerald-500/30 shadow-sm text-emerald-100'
            : 'bg-[#161616] border-gray-800 hover:bg-gray-800/60 text-gray-300'
        }`}
      >
        {/* 이름 및 편집 */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-transparent'}`} />
          {editingId === layer.id ? (
            <input
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={() => finishRename(false)}
              onKeyDown={(e) => e.key === 'Enter' && finishRename(false)}
              autoFocus
              className="bg-[#0A0A0A] text-xs px-1.5 py-0.5 rounded text-white border border-emerald-500 outline-none w-28"
            />
          ) : (
            <span
              onDoubleClick={() => startRename(layer.id, layer.name)}
              className="text-xs font-medium truncate select-none"
              title="더블클릭하여 이름 수정"
            >
              {layer.name}
            </span>
          )}
        </div>

        {/* 가시성 & 잠금 토글 */}
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onToggleLayerLock(layer.id)}
            className={`p-1 rounded hover:bg-gray-700/60 ${layer.locked ? 'text-amber-400' : 'text-gray-500'}`}
            title={layer.locked ? '레이어 잠금 해제' : '레이어 잠금'}
          >
            {layer.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => onToggleLayerVisibility(layer.id)}
            className={`p-1 rounded hover:bg-gray-700/60 ${layer.visible ? 'text-emerald-400' : 'text-gray-600'}`}
            title={layer.visible ? '레이어 숨기기' : '레이어 보이기'}
          >
            {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    );
  }
};
