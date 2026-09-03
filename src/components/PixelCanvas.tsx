import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Layer, LayerGroup, ToolType } from '../types';
import { 
  compositeLayers, 
  floodFill, 
  getBrushStamp, 
  getCirclePoints, 
  getLinePoints, 
  getRectanglePoints, 
  hexToRgba, 
  rgbaToHex 
} from '../utils/pixelEngine';
import { ZoomIn, ZoomOut, Maximize2, Move as MoveIcon } from 'lucide-react';

interface PixelCanvasProps {
  layers: Layer[];
  groups: LayerGroup[];
  activeLayerId: string;
  width: number;
  height: number;
  currentTool: ToolType;
  primaryColor: string;
  secondaryColor: string;
  brushSize: number;
  fillShape: boolean;
  horizontalSymmetry: boolean;
  showGrid: boolean;
  zoom: number;
  onZoomChange: (newZoom: number) => void;
  onUpdateLayerPixels: (layerId: string, newPixels: string[], recordHistory?: boolean, description?: string) => void;
  onPickColor: (color: string) => void;
  isDark: boolean;
  onionSkinEnabled?: boolean;
  onionSkinPixels?: string[] | null;
}

export const PixelCanvas: React.FC<PixelCanvasProps> = ({
  layers,
  groups,
  activeLayerId,
  width,
  height,
  currentTool,
  primaryColor,
  secondaryColor,
  brushSize,
  fillShape,
  horizontalSymmetry,
  showGrid,
  zoom,
  onZoomChange,
  onUpdateLayerPixels,
  onPickColor,
  isDark,
  onionSkinEnabled = false,
  onionSkinPixels = null,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 뷰포트 오프셋 (Pan)
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // 현재 커서 좌표 HUD
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  // 드로잉 인터랙션 상태
  const isDrawingRef = useRef(false);
  const drawingButtonRef = useRef<number>(0); // 0: left (primary), 2: right (secondary)
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const previewPixelsRef = useRef<string[] | null>(null);

  // 터치 제스처 (2핑거 핀치 줌 & 팬)
  const touchDistanceRef = useRef<number | null>(null);
  const touchCenterRef = useRef<{ x: number; y: number } | null>(null);

  const activeLayer = layers.find(l => l.id === activeLayerId);

  // 캔버스 초기 센터링
  useEffect(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pixelScale = Math.min((rect.width - 60) / width, (rect.height - 60) / height);
    const initialZoom = Math.max(1, Math.min(32, Math.floor(pixelScale)));
    onZoomChange(initialZoom);
    setPanOffset({
      x: (rect.width - width * initialZoom) / 2,
      y: (rect.height - height * initialZoom) / 2,
    });
  }, [width, height]);

  // 스크린 좌표 ➔ 캔버스 픽셀 좌표 변환
  const screenToPixelCoord = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const canvasX = clientX - rect.left - panOffset.x;
    const canvasY = clientY - rect.top - panOffset.y;

    const px = Math.floor(canvasX / zoom);
    const py = Math.floor(canvasY / zoom);

    if (px < 0 || px >= width || py < 0 || py >= height) {
      return null;
    }
    return { x: px, y: py };
  }, [panOffset, zoom, width, height]);

  // 렌더 루프
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 실제 표시 크기
    const displayW = width * zoom;
    const displayH = height * zoom;

    if (canvas.width !== displayW || canvas.height !== displayH) {
      canvas.width = displayW;
      canvas.height = displayH;
    }

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, displayW, displayH);

    // 1. 기본 레이어 합성
    const compositeData = compositeLayers(layers, groups, width, height);

    // 1-1. 어니언 스킨 (이전 프레임 잔상 오버레이)
    if (onionSkinEnabled && onionSkinPixels && onionSkinPixels.length === width * height) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const ghostColor = onionSkinPixels[idx];
          // 현재 위치에 그려진 픽셀이 없거나 반투명할 때 이전 프레임 잔상 투영
          const pIdx = idx * 4;
          const currentAlpha = compositeData.data[pIdx + 3];
          if (ghostColor && currentAlpha < 200) {
            const rgba = hexToRgba(ghostColor);
            // 은은한 청록/연녹빛 틴트와 35% 잔상 불투명도 적용
            const ghostAlpha = 0.35;
            compositeData.data[pIdx] = Math.round(rgba.r * 0.7 + 30);
            compositeData.data[pIdx + 1] = Math.round(rgba.g * 0.85 + 60);
            compositeData.data[pIdx + 2] = Math.round(rgba.b * 0.85 + 60);
            compositeData.data[pIdx + 3] = Math.max(currentAlpha, Math.round(ghostAlpha * 255));
          }
        }
      }
    }

    // 2. 만약 도형 그리기 미리보기가 있다면 가상 레이어로 덧씌움
    if (previewPixelsRef.current) {
      const pData = previewPixelsRef.current;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const color = pData[idx];
          if (color) {
            const rgba = hexToRgba(color);
            const pIdx = idx * 4;
            compositeData.data[pIdx] = rgba.r;
            compositeData.data[pIdx + 1] = rgba.g;
            compositeData.data[pIdx + 2] = rgba.b;
            compositeData.data[pIdx + 3] = Math.round(rgba.a * 255);
          }
        }
      }
    }

    // 3. 임시 캔버스에 1:1로 그린 뒤 픽셀 확대 전송
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.putImageData(compositeData, 0, 0);

    ctx.drawImage(tempCanvas, 0, 0, width, height, 0, 0, displayW, displayH);

    // 4. 그리드 라인 그리기
    if (showGrid && zoom >= 4) {
      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();

      for (let x = 0; x <= width; x++) {
        ctx.moveTo(x * zoom, 0);
        ctx.lineTo(x * zoom, displayH);
      }
      for (let y = 0; y <= height; y++) {
        ctx.moveTo(0, y * zoom);
        ctx.lineTo(displayW, y * zoom);
      }
      ctx.stroke();
    }

    // 5. 좌우 대칭 가이드 라인
    if (horizontalSymmetry) {
      const midX = (width / 2) * zoom;
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)'; // Emerald guide line
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(midX, 0);
      ctx.lineTo(midX, displayH);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 6. 커서 호버 박스 미리보기
    if (cursorPos && !isPanning) {
      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)';
      ctx.lineWidth = 1.5;
      const stamp = getBrushStamp(cursorPos.x, cursorPos.y, brushSize);
      stamp.forEach(pt => {
        if (pt.x >= 0 && pt.x < width && pt.y >= 0 && pt.y < height) {
          ctx.strokeRect(pt.x * zoom + 0.5, pt.y * zoom + 0.5, zoom - 1, zoom - 1);
        }
        if (horizontalSymmetry) {
          const symX = width - 1 - pt.x;
          if (symX >= 0 && symX < width && pt.y >= 0 && pt.y < height) {
            ctx.strokeRect(symX * zoom + 0.5, pt.y * zoom + 0.5, zoom - 1, zoom - 1);
          }
        }
      });
    }
  }, [layers, groups, width, height, zoom, showGrid, isDark, horizontalSymmetry, cursorPos, isPanning, brushSize, onionSkinEnabled, onionSkinPixels]);

  useEffect(() => {
    render();
  }, [render]);

  // 마우스 휠 줌 (커서 위치 중심 줌)
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.25 : 0.8;
    const newZoom = Math.max(1, Math.min(64, Math.round(zoom * zoomFactor * 10) / 10));

    if (newZoom !== zoom) {
      // 줌 중심점 보정
      const newPanX = mouseX - ((mouseX - panOffset.x) / zoom) * newZoom;
      const newPanY = mouseY - ((mouseY - panOffset.y) / zoom) * newZoom;
      onZoomChange(newZoom);
      setPanOffset({ x: newPanX, y: newPanY });
    }
  };

  // 브러시 / 지우개 픽셀 적용 헬퍼
  const applyBrushPixels = (
    currentPixels: string[],
    x: number,
    y: number,
    color: string
  ): string[] => {
    const updated = [...currentPixels];
    const stamp = getBrushStamp(x, y, brushSize);

    const setSingle = (px: number, py: number) => {
      if (px >= 0 && px < width && py >= 0 && py < height) {
        updated[py * width + px] = color;
      }
    };

    stamp.forEach(pt => {
      setSingle(pt.x, pt.y);
      if (horizontalSymmetry) {
        setSingle(width - 1 - pt.x, pt.y);
      }
    });

    return updated;
  };

  // 선분 보간 그리기 (Bresenham)
  const applyLineStroke = (
    currentPixels: string[],
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    color: string
  ): string[] => {
    const pts = getLinePoints(fromX, fromY, toX, toY);
    let updated = [...currentPixels];
    pts.forEach(pt => {
      updated = applyBrushPixels(updated, pt.x, pt.y, color);
    });
    return updated;
  };

  // 포인터 다운
  const handlePointerDown = (e: React.PointerEvent) => {
    // 휠 클릭이나 스페이스바 상태이거나 이동 도구일 경우 Pan 모드
    if (e.button === 1 || e.altKey || currentTool === 'move') {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
      return;
    }

    if (!activeLayer || activeLayer.locked || !activeLayer.visible) return;

    const pt = screenToPixelCoord(e.clientX, e.clientY);
    if (!pt) return;

    isDrawingRef.current = true;
    drawingButtonRef.current = e.button;
    startPointRef.current = pt;
    lastPointRef.current = pt;

    const paintColor = e.button === 2 ? secondaryColor : (currentTool === 'eraser' ? '' : primaryColor);

    // 도구별 분기
    if (currentTool === 'picker') {
      // 스포이트는 합성된 결과에서 색상 추출
      const comp = compositeLayers(layers, groups, width, height);
      const idx = (pt.y * width + pt.x) * 4;
      const hex = rgbaToHex(comp.data[idx], comp.data[idx + 1], comp.data[idx + 2], comp.data[idx + 3] / 255);
      if (hex) onPickColor(hex);
      isDrawingRef.current = false;
      return;
    }

    if (currentTool === 'bucket') {
      const filled = floodFill(activeLayer.pixels, width, height, pt.x, pt.y, paintColor);
      onUpdateLayerPixels(activeLayer.id, filled, true, '페인트 채우기');
      isDrawingRef.current = false;
      return;
    }

    if (currentTool === 'brush' || currentTool === 'eraser') {
      const newPixels = applyBrushPixels(activeLayer.pixels, pt.x, pt.y, paintColor);
      onUpdateLayerPixels(activeLayer.id, newPixels, false);
      render();
    }
  };

  // 포인터 무브
  const handlePointerMove = (e: React.PointerEvent) => {
    const pt = screenToPixelCoord(e.clientX, e.clientY);
    setCursorPos(pt);

    if (isPanning) {
      setPanOffset({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
      return;
    }

    if (!isDrawingRef.current || !activeLayer || !pt) return;

    const paintColor = drawingButtonRef.current === 2 ? secondaryColor : (currentTool === 'eraser' ? '' : primaryColor);

    if (currentTool === 'brush' || currentTool === 'eraser') {
      if (lastPointRef.current) {
        const newPixels = applyLineStroke(
          activeLayer.pixels,
          lastPointRef.current.x,
          lastPointRef.current.y,
          pt.x,
          pt.y,
          paintColor
        );
        onUpdateLayerPixels(activeLayer.id, newPixels, false);
      }
      lastPointRef.current = pt;
      render();
    } else if (currentTool === 'line') {
      if (startPointRef.current) {
        const pts = getLinePoints(startPointRef.current.x, startPointRef.current.y, pt.x, pt.y);
        let preview = [...activeLayer.pixels];
        pts.forEach(p => {
          preview = applyBrushPixels(preview, p.x, p.y, paintColor);
        });
        previewPixelsRef.current = preview;
        render();
      }
    } else if (currentTool === 'rect') {
      if (startPointRef.current) {
        const pts = getRectanglePoints(startPointRef.current.x, startPointRef.current.y, pt.x, pt.y, fillShape);
        let preview = [...activeLayer.pixels];
        pts.forEach(p => {
          preview = applyBrushPixels(preview, p.x, p.y, paintColor);
        });
        previewPixelsRef.current = preview;
        render();
      }
    } else if (currentTool === 'circle') {
      if (startPointRef.current) {
        const pts = getCirclePoints(startPointRef.current.x, startPointRef.current.y, pt.x, pt.y, fillShape);
        let preview = [...activeLayer.pixels];
        pts.forEach(p => {
          preview = applyBrushPixels(preview, p.x, p.y, paintColor);
        });
        previewPixelsRef.current = preview;
        render();
      }
    }
  };

  // 포인터 업 (작업 완료 및 히스토리 기록)
  const handlePointerUp = (e: React.PointerEvent) => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (!isDrawingRef.current || !activeLayer) return;
    isDrawingRef.current = false;

    // 도형 미리보기를 실제 레이어 픽셀로 커밋
    if (previewPixelsRef.current) {
      onUpdateLayerPixels(activeLayer.id, previewPixelsRef.current, true, `${currentTool} 그리기`);
      previewPixelsRef.current = null;
    } else if (currentTool === 'brush' || currentTool === 'eraser') {
      onUpdateLayerPixels(activeLayer.id, activeLayer.pixels, true, `${currentTool} 스트로크`);
    }

    startPointRef.current = null;
    lastPointRef.current = null;
    render();
  };

  // 모바일 터치 제스처 (핀치 줌 & 2핑거 팬)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      isDrawingRef.current = false;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      touchDistanceRef.current = dist;
      touchCenterRef.current = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };
      panStartRef.current = {
        x: touchCenterRef.current.x - panOffset.x,
        y: touchCenterRef.current.y - panOffset.y,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchDistanceRef.current && touchCenterRef.current) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const newDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const newCenter = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };

      const scaleRatio = newDist / touchDistanceRef.current;
      const newZoom = Math.max(1, Math.min(64, Math.round(zoom * scaleRatio)));

      if (newZoom !== zoom) {
        onZoomChange(newZoom);
      }

      setPanOffset({
        x: newCenter.x - panStartRef.current.x,
        y: newCenter.y - panStartRef.current.y,
      });

      touchDistanceRef.current = newDist;
      touchCenterRef.current = newCenter;
    }
  };

  const handleTouchEnd = () => {
    touchDistanceRef.current = null;
    touchCenterRef.current = null;
  };

  // 뷰포트 맞춤 함수
  const fitToScreen = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pixelScale = Math.min((rect.width - 60) / width, (rect.height - 60) / height);
    const newZoom = Math.max(1, Math.min(32, Math.floor(pixelScale)));
    onZoomChange(newZoom);
    setPanOffset({
      x: (rect.width - width * newZoom) / 2,
      y: (rect.height - height * newZoom) / 2,
    });
  };

  return (
    <div 
      ref={containerRef}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => {
        setCursorPos(null);
        if (isDrawingRef.current && activeLayer) {
          isDrawingRef.current = false;
          if (previewPixelsRef.current) {
            onUpdateLayerPixels(activeLayer.id, previewPixelsRef.current, true, '도형 그리기');
            previewPixelsRef.current = null;
          } else {
            onUpdateLayerPixels(activeLayer.id, activeLayer.pixels, true, '스트로크');
          }
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative flex-1 w-full h-full overflow-hidden select-none cursor-crosshair ${
        isDark ? 'bg-[#050505]' : 'bg-gray-100'
      }`}
    >
      {/* 캔버스 및 투명 체크판 컨테이너 */}
      <div
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
          width: width * zoom,
          height: height * zoom,
        }}
        className={`absolute shadow-2xl border border-gray-800 ${
          isDark ? 'bg-checkered' : 'bg-checkered-light'
        }`}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full pixelated block"
        />
      </div>

      {/* 우측 상단 HUD: 좌표 및 캔버스 정보 */}
      <div className="absolute top-3 right-3 flex items-center gap-2 pointer-events-none z-10">
        <div className="bg-[#111111]/90 backdrop-blur-md border border-gray-800 rounded px-2.5 py-1 text-[10px] font-mono text-gray-300 shadow-md">
          {cursorPos ? (
            <span>X: <strong className="text-emerald-400">{cursorPos.x}</strong>, Y: <strong className="text-emerald-400">{cursorPos.y}</strong></span>
          ) : (
            <span className="text-gray-500">캔버스 밖</span>
          )}
        </div>
      </div>

      {/* 모바일/데스크탑 플로팅 뷰포트 컨트롤 바 */}
      <div className="absolute bottom-20 md:bottom-4 right-4 flex items-center gap-1 bg-[#111111]/95 backdrop-blur-md border border-gray-800 rounded p-1 shadow-xl z-10">
        <button
          onClick={() => onZoomChange(Math.max(1, zoom - 2))}
          className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          title="축소"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={fitToScreen}
          className="px-2 py-1 text-xs font-mono text-gray-300 hover:text-emerald-400 hover:bg-gray-800 rounded transition-colors flex items-center gap-1"
          title="화면 맞춤"
        >
          <Maximize2 className="w-3 h-3" />
          <span>{Math.round(zoom * 100 / 16)}%</span>
        </button>
        <button
          onClick={() => onZoomChange(Math.min(64, zoom + 2))}
          className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          title="확대"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>

      {/* 레이어 잠김 안내 오버레이 */}
      {activeLayer?.locked && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-amber-950/80 border border-amber-600/70 text-amber-300 text-xs px-3 py-1.5 rounded-full shadow-lg pointer-events-none">
          🔒 현재 레이어가 잠겨 있어 수정할 수 없습니다.
        </div>
      )}
    </div>
  );
};
