
import React, { useState, useEffect, useRef } from 'react';
import { useModalAccessibility } from '../hooks/useModalAccessibility';

interface PlaceholderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (fileName: string, dataUrl: string) => void;
  defaultPath: string;
}

const PlaceholderModal: React.FC<PlaceholderModalProps> = ({ isOpen, onClose, onGenerate, defaultPath }) => {
  const { modalProps, contentRef } = useModalAccessibility({ isOpen, onClose, titleId: 'placeholder-modal-title' });
  const [fileName, setFileName] = useState('placeholder.png');
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [color, setColor] = useState('#6366f1'); // Indigo-500
  const [text, setText] = useState('Placeholder');
  const [textColor, setTextColor] = useState('#ffffff');
  
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (isOpen) {
        generatePreview();
    }
  }, [isOpen, width, height, color, text, textColor]);

  const generatePreview = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw Background
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, width, height);

      // Draw Border
      ctx.strokeStyle = textColor;
      ctx.lineWidth = Math.max(2, Math.floor(width * 0.01));
      ctx.strokeRect(0, 0, width, height);

      // Draw Cross (X) for structure reference
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(width, height);
      ctx.moveTo(width, 0);
      ctx.lineTo(0, height);
      ctx.strokeStyle = textColor;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.3;
      ctx.stroke();
      ctx.globalAlpha = 1.0;

      // Draw Text
      const fontSize = Math.floor(height * 0.1);
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Shadow for readability
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;

      ctx.fillText(text, width / 2, height / 2);
      
      // Dimensions Text
      ctx.font = `${Math.floor(fontSize * 0.4)}px sans-serif`;
      ctx.fillText(`${width} x ${height}`, width / 2, height / 2 + fontSize);

      // Reset shadow
      ctx.shadowColor = "transparent";
  };

  const handleConfirm = () => {
      const canvas = canvasRef.current;
      if (canvas) {
          const dataUrl = canvas.toDataURL('image/png');
          const safeName = fileName.endsWith('.png') ? fileName : `${fileName}.png`;
          onGenerate(safeName, dataUrl);
          onClose();
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" onClick={onClose} {...modalProps}>
      <div
        ref={contentRef}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-4xl m-4 flex flex-col border border-gray-200 dark:border-gray-700 max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <header className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 id="placeholder-modal-title" className="text-xl font-bold text-gray-900 dark:text-gray-100">Create Placeholder Asset</h2>
        </header>
        
        <main className="p-6 flex flex-col md:flex-row gap-6 overflow-hidden">
            {/* Controls */}
            <div className="w-full md:w-1/3 space-y-4 overflow-y-auto">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Filename</label>
                    <input type="text" value={fileName} onChange={e => setFileName(e.target.value)} className="w-full p-2 rounded bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500" />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Width (px)</label>
                        <input type="number" value={width} onChange={e => setWidth(Number(e.target.value))} className="w-full p-2 rounded bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Height (px)</label>
                        <input type="number" value={height} onChange={e => setHeight(Number(e.target.value))} className="w-full p-2 rounded bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600" />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Label Text</label>
                    <input type="text" value={text} onChange={e => setText(e.target.value)} className="w-full p-2 rounded bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Background</label>
                        <div className="flex items-center space-x-2">
                            <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-10 w-full rounded cursor-pointer" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Text Color</label>
                        <div className="flex items-center space-x-2">
                            <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)} className="h-10 w-full rounded cursor-pointer" />
                        </div>
                    </div>
                </div>
                
                <div className="pt-4">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Saving to: <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">{defaultPath}</span>
                    </p>
                </div>
            </div>

            {/* Preview */}
            <div className="w-full md:w-2/3 bg-gray-100 dark:bg-black/20 rounded-lg flex items-center justify-center p-4 border border-gray-200 dark:border-gray-700 relative">
                <p className="absolute top-2 left-2 text-xs font-bold text-gray-400 uppercase">Preview</p>
                <div className="max-w-full max-h-full shadow-lg overflow-hidden">
                    <canvas 
                        ref={canvasRef} 
                        width={width} 
                        height={height} 
                        className="max-w-full max-h-[50vh] object-contain"
                    />
                </div>
            </div>
        </main>

        <footer className="bg-gray-50 dark:bg-gray-700 p-4 rounded-b-lg flex justify-end items-center space-x-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 rounded">
            Cancel
          </button>
          <button onClick={handleConfirm} className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded shadow-sm">
            Create Asset
          </button>
        </footer>
      </div>
    </div>
  );
};

export default PlaceholderModal;
