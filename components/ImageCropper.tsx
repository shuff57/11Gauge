import React, { useState, useRef, useEffect } from 'react';
import { Check, X, Move } from 'lucide-react';

interface ImageCropperProps {
  imageUrl: string;
  onCrop: (croppedBlob: Blob) => void;
  onCancel: () => void;
}

export const ImageCropper: React.FC<ImageCropperProps> = ({ imageUrl, onCrop, onCancel }) => {
  const [crop, setCrop] = useState({ x: 10, y: 10, width: 80, height: 80 }); // Percentages
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef<string | null>(null);
  const startPos = useRef({ x: 0, y: 0 });
  const startCrop = useRef({ x: 0, y: 0, width: 0, height: 0 });

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
      <div className="relative w-full max-w-3xl h-[80vh] flex flex-col bg-zinc-900 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h3 className="text-white font-medium">Crop Image</h3>
          <div className="flex gap-2">
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
            
            {/* Overlay */}
            <div className="absolute inset-0 bg-black/50">
              {/* Crop Box */}
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
                {/* Grid Lines */}
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

                {/* Resize Handle (Bottom Right) */}
                <div
                  className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-white rounded-full cursor-se-resize shadow-sm"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    handleMouseDown(e, 'se');
                  }}
                />
              </div>
            </div>
          </div>
        </div>
        
        <div className="p-4 bg-zinc-900 text-center text-xs text-zinc-500">
          Drag to move • Pull corner to resize
        </div>
      </div>
    </div>
  );
};
