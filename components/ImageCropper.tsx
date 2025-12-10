import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Check, X, Move, Wand2, BezierCurve, Sparkles, Eraser } from 'lucide-react';
import { CLOUDFLARE_VISION_MODELS, GEMINI_MODELS, DEFAULT_SETTINGS } from '../constants';

interface ImageCropperProps {
  imageUrl: string;
  onCrop: (croppedBlob: Blob) => void;
  onCancel: () => void;
}

export const ImageCropper: React.FC<ImageCropperProps> = ({ imageUrl, onCrop, onCancel }) => {
  const [crop, setCrop] = useState({ x: 10, y: 10, width: 80, height: 80 }); // Percentages for bbox mode
  const [polyPoints, setPolyPoints] = useState<Array<{ x: number; y: number }>>([]); // 0-100 percentages
  const [mode, setMode] = useState<'bbox' | 'polyline' | 'contour' | 'segmentation' | 'wand'>('bbox');
  const [isDetecting, setIsDetecting] = useState(false);
  type CropProvider = 'cloudflare' | 'ollama' | 'google';
  const [provider, setProvider] = useState<CropProvider>('cloudflare');
  const [model, setModel] = useState<string>(CLOUDFLARE_VISION_MODELS[0]?.value || DEFAULT_SETTINGS.ollamaModel);
  const [wandPoints, setWandPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [isPainting, setIsPainting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef<string | null>(null);
  const startPos = useRef({ x: 0, y: 0 });
  const startCrop = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const dragPointIndex = useRef<number | null>(null);

  const rectToPoly = (c: { x: number; y: number; width: number; height: number }) => [
    { x: c.x, y: c.y },
    { x: c.x + c.width, y: c.y },
    { x: c.x + c.width, y: c.y + c.height },
    { x: c.x, y: c.y + c.height }
  ];

  const polyToRect = (pts: Array<{ x: number; y: number }>) => {
    if (!pts.length) return { x: crop.x, y: crop.y, width: crop.width, height: crop.height };
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.max(0, Math.min(...xs));
    const minY = Math.max(0, Math.min(...ys));
    const maxX = Math.min(100, Math.max(...xs));
    const maxY = Math.min(100, Math.max(...ys));
    return { x: minX, y: minY, width: Math.max(5, maxX - minX), height: Math.max(5, maxY - minY) };
  };

  useEffect(() => {
    // Seed polyline/contour/segmentation with the current box when switching modes
    if (mode !== 'bbox' && mode !== 'wand' && polyPoints.length === 0) {
      setPolyPoints(rectToPoly(crop));
    }
  }, [mode]);

  useEffect(() => {
    // Keep bbox crop synced to polygon extent so cropping still works
    if (mode !== 'bbox' && mode !== 'wand' && polyPoints.length >= 3) {
      setCrop(polyToRect(polyPoints));
    }
  }, [polyPoints, mode]);

  // Monotone chain convex hull for wand strokes
  const hull = (pts: Array<{ x: number; y: number }>) => {
    if (pts.length < 3) return pts;
    const points = [...pts].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
    const cross = (o: any, a: any, b: any) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower: any[] = [];
    for (const p of points) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    const upper: any[] = [];
    for (let i = points.length - 1; i >= 0; i--) {
      const p = points[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
  };

  const percentPoint = (clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)),
    };
  };

  const startWand = (e: React.MouseEvent) => {
    if (mode !== 'wand') return;
    e.preventDefault();
    const p = percentPoint(e.clientX, e.clientY);
    setWandPoints([p]);
    setIsPainting(true);
    setPolyPoints([]);
  };

  const moveWand = (e: React.MouseEvent) => {
    if (!isPainting || mode !== 'wand') return;
    const p = percentPoint(e.clientX, e.clientY);
    setWandPoints((prev) => [...prev, p]);
  };

  const endWand = () => {
    if (mode !== 'wand') return;
    setIsPainting(false);
    if (wandPoints.length >= 3) {
      const h = hull(wandPoints);
      if (h.length >= 3) {
        setPolyPoints(h);
        setCrop(polyToRect(h));
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent, type: string) => {
    e.preventDefault();
    isDragging.current = type;
    startPos.current = { x: e.clientX, y: e.clientY };
    startCrop.current = { ...crop };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const deltaX = ((e.clientX - startPos.current.x) / rect.width) * 100;
    const deltaY = ((e.clientY - startPos.current.y) / rect.height) * 100;

    let newCrop = { ...startCrop.current };

    if (isDragging.current === 'move') {
      newCrop.x = Math.min(Math.max(0, startCrop.current.x + deltaX), 100 - newCrop.width);
      newCrop.y = Math.min(Math.max(0, startCrop.current.y + deltaY), 100 - newCrop.height);
    } else if (isDragging.current === 'se') {
      newCrop.width = Math.min(Math.max(10, startCrop.current.width + deltaX), 100 - newCrop.x);
      newCrop.height = Math.min(Math.max(10, startCrop.current.height + deltaY), 100 - newCrop.y);
    }

    setCrop(newCrop);
  };

  const handleMouseUp = () => {
    isDragging.current = null;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  const performAutoDetect = async (detectMode: 'bbox' | 'segmentation' = 'bbox') => {
    setIsDetecting(true);
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const formData = new FormData();
      formData.append('image', blob);
      formData.append('mode', detectMode);
      if (model) {
        formData.append('model', model);
      }

      const res = await fetch('/api/ai/detect-weld', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error('Detection failed');

      const data = await res.json();

      // BBox
      if (data?.bbox) {
        const [ymin, xmin, ymax, xmax] = data.bbox as [number, number, number, number];
        const x = xmin / 10;
        const y = ymin / 10;
        const width = (xmax - xmin) / 10;
        const height = (ymax - ymin) / 10;
        setCrop({
          x: Math.max(0, Math.min(100, x)),
          y: Math.max(0, Math.min(100, y)),
          width: Math.max(5, Math.min(100 - x, width)),
          height: Math.max(5, Math.min(100 - y, height))
        });
      }

      // Polygon (normalized to percentages)
      if (Array.isArray(data?.polygon)) {
        const pts = (data.polygon as Array<{ x: number; y: number }>).map((p) => ({
          x: Math.max(0, Math.min(100, p.x / 10)),
          y: Math.max(0, Math.min(100, p.y / 10))
        }));
        if (pts.length >= 3) setPolyPoints(pts);
      }
    } catch (err) {
      console.error('Auto-detect failed:', err);
    } finally {
      setIsDetecting(false);
    }
  };

  const performCrop = async () => {
    const img = new Image();
    img.src = imageUrl;
    await new Promise((resolve) => (img.onload = resolve));

    const canvas = document.createElement('canvas');
    const scaleX = img.naturalWidth / 100;
    const scaleY = img.naturalHeight / 100;

    canvas.width = crop.width * scaleX;
    canvas.height = crop.height * scaleY;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(
      img,
      crop.x * scaleX,
      crop.y * scaleY,
      crop.width * scaleX,
      crop.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height
    );

    canvas.toBlob((blob) => {
      if (blob) onCrop(blob);
    }, 'image/jpeg', 0.95);
  };

  // Client-side contour: simple edge-like ridge along brightness changes within bbox -> synthetic wavy path
  const contourPath = useMemo(() => {
    if (mode !== 'contour' && mode !== 'segmentation' && mode !== 'wand') return '';
    if (!polyPoints.length || polyPoints.length < 3) return '';
    const pts = polyPoints;
    const first = pts[0];
    const path: string[] = [`M ${first.x} ${first.y}`];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      const prev = pts[i - 1];
      const cx = (prev.x + p.x) / 2;
      const cy = (prev.y + p.y) / 2;
      path.push(`Q ${prev.x} ${prev.y} ${cx} ${cy}`);
    }
    const last = pts[pts.length - 1];
    const cx = (last.x + first.x) / 2;
    const cy = (last.y + first.y) / 2;
    path.push(`Q ${last.x} ${last.y} ${cx} ${cy} Z`);
    return path.join(' ');
  }, [polyPoints, mode]);

  const handlePolyPointMouseDown = (e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    dragPointIndex.current = idx;
    document.addEventListener('mousemove', handlePolyMouseMove);
    document.addEventListener('mouseup', handlePolyMouseUp);
  };

  const handlePolyMouseMove = (e: MouseEvent) => {
    if (dragPointIndex.current === null || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPolyPoints((prev) => {
      const next = [...prev];
      next[dragPointIndex.current!] = {
        x: Math.max(0, Math.min(100, x)),
        y: Math.max(0, Math.min(100, y))
      };
      return next;
    });
  };

  const handlePolyMouseUp = () => {
    dragPointIndex.current = null;
    document.removeEventListener('mousemove', handlePolyMouseMove);
    document.removeEventListener('mouseup', handlePolyMouseUp);
  };

  const renderOverlay = () => {
    if (mode === 'bbox') {
      return (
        <div
          style={{
            left: `${crop.x}%`,
            top: `${crop.y}%`,
            width: `${crop.width}%`,
            height: `${crop.height}%`,
          }}
          className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] cursor-move"
          onMouseDown={(e) => handleMouseDown(e, 'move')}
        >
          <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-50">
            <div className="border-r border-b border-white/30" />
            <div className="border-r border-b border-white/30" />
            <div className="border-b border-white/30" />
            <div className="border-r border-b border-white/30" />
            <div className="border-r border-b border-white/30" />
            <div className="border-b border-white/30" />
            <div className="border-r border-white/30" />
            <div className="border-r border-white/30" />
          </div>
          <div
            className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-white rounded-full cursor-se-resize shadow-sm"
            onMouseDown={(e) => {
              e.stopPropagation();
              handleMouseDown(e, 'se');
            }}
          />
        </div>
      );
    }

    // Polyline / segmentation overlay
    if ((mode === 'polyline' || mode === 'segmentation' || mode === 'contour') && polyPoints.length >= 2) {
      return (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
          {/* show bbox for reference */}
          <rect
            x={crop.x}
            y={crop.y}
            width={crop.width}
            height={crop.height}
            fill="rgba(255,255,255,0.04)"
            stroke="rgba(255,255,255,0.5)"
            strokeDasharray="6 4"
            strokeWidth={1.5}
          />
          <path
            d={contourPath || ''}
            fill={mode === 'contour' || mode === 'segmentation' ? 'rgba(0,200,255,0.12)' : 'none'}
            stroke="rgba(255,255,255,0.9)"
            strokeWidth={2}
            strokeDasharray={mode === 'polyline' ? '4 4' : 'none'}
            style={{ filter: 'drop-shadow(0 0 6px rgba(0,255,255,0.5))' }}
          />
          {polyPoints.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="6"
              className="fill-white stroke-black stroke-1 pointer-events-auto cursor-pointer"
              onMouseDown={(e) => handlePolyPointMouseDown(e, i)}
            />
          ))}
        </svg>
      );
    }

    if (mode === 'wand') {
      return (
        <div
          className="absolute inset-0"
          onMouseDown={startWand}
          onMouseMove={moveWand}
          onMouseUp={endWand}
          onMouseLeave={endWand}
        >
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ pointerEvents: 'none' }}>
            <polyline
              points={wandPoints.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="rgba(0,200,255,0.9)"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: 'drop-shadow(0 0 6px rgba(0,255,255,0.6))' }}
            />
            {polyPoints.length >= 3 && (
              <path
                d={contourPath || ''}
                fill="rgba(0,200,255,0.12)"
                stroke="rgba(255,255,255,0.9)"
                strokeWidth={2}
              />
            )}
          </svg>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
      <div className="relative w-full max-w-3xl h-[80vh] flex flex-col bg-zinc-900 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h3 className="text-white font-medium">Crop Image</h3>
          <div className="flex gap-2">
            <div className="flex items-center gap-2 bg-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-300">
              <span className="text-zinc-400">Crop AI</span>
              <select
                value={provider}
                onChange={(e) => {
                  const next = e.target.value as CropProvider;
                  setProvider(next);
                  if (next === 'cloudflare') {
                    setModel(CLOUDFLARE_VISION_MODELS[0]?.value || model);
                  } else if (next === 'google') {
                    setModel(GEMINI_MODELS[0]?.value || model);
                  } else {
                    setModel(DEFAULT_SETTINGS.ollamaModel);
                  }
                }}
                className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
              >
                <option value="cloudflare">Cloudflare</option>
                <option value="ollama">Ollama</option>
                <option value="google">Google</option>
              </select>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white min-w-[11rem]"
              >
                {(provider === 'cloudflare' ? CLOUDFLARE_VISION_MODELS : provider === 'google' ? GEMINI_MODELS : [
                  { value: DEFAULT_SETTINGS.ollamaModel, label: `${DEFAULT_SETTINGS.ollamaModel} (default)` },
                  { value: 'llava:13b', label: 'llava:13b (custom)' },
                  { value: 'llava:7b', label: 'llava:7b (custom)' }
                ]).map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 bg-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-300">
              <span className="text-zinc-400">Mode</span>
              {[{ key: 'bbox', label: 'Box' }, { key: 'polyline', label: 'Polyline' }, { key: 'contour', label: 'Contour' }, { key: 'segmentation', label: 'Seg' }, { key: 'wand', label: 'Wand' }].map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setMode(opt.key as any)}
                  className={`px-2 py-1 rounded ${mode === opt.key ? 'bg-blue-600 text-white' : 'hover:bg-zinc-700'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => performAutoDetect(mode === 'segmentation' ? 'segmentation' : 'bbox')}
              disabled={isDetecting}
              className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 text-sm disabled:opacity-50"
            >
              <Wand2 className={`w-4 h-4 ${isDetecting ? 'animate-spin' : ''}`} />
              {isDetecting ? 'Detecting...' : 'Auto Detect'}
            </button>
            <div className="w-px h-8 bg-zinc-800 mx-2" />
            {mode === 'wand' && (
              <button
                onClick={() => {
                  setWandPoints([]);
                  setPolyPoints([]);
                }}
                className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400"
              >
                <Eraser className="w-5 h-5" />
              </button>
            )}
            <button onClick={onCancel} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400">
              <X className="w-5 h-5" />
            </button>
            <button onClick={performCrop} className="p-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white">
              <Check className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <div className="flex-1 relative bg-zinc-950 flex items-center justify-center p-4 overflow-hidden">
          <div ref={containerRef} className="relative inline-block">
            <img src={imageUrl} alt="Crop target" className="max-h-[65vh] object-contain select-none pointer-events-none" />
            <div className="absolute inset-0 bg-black/50">
              {renderOverlay()}
            </div>
          </div>
        </div>
        
        <div className="p-4 bg-zinc-900 text-center text-xs text-zinc-500">
          {mode === 'bbox' && 'Drag to move • Pull corner to resize'}
          {mode === 'polyline' && 'Drag points to adjust weld outline'}
          {mode === 'contour' && 'Auto outline; drag points if needed'}
          {mode === 'segmentation' && 'Segmentation outline; drag points if needed'}
          {mode === 'wand' && 'Paint the weld area; release to auto-outline'}
        </div>
      </div>
    </div>
  );
};
