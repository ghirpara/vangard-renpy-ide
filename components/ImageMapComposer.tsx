import React, { useState, useRef, useEffect } from 'react';
import type { ProjectImage, ImageMapComposition, ImageMapHotspot, ImageMapActionType } from '../types';
import CopyButton from './CopyButton';

interface ImageMapComposerProps {
    images: ProjectImage[];
    imagemap: ImageMapComposition;
    onImageMapChange: (newImageMap: React.SetStateAction<ImageMapComposition>) => void;
    imagemapName: string;
    onRenameImageMap: (newName: string) => void;
    labels: string[];
}

const ImageMapComposer: React.FC<ImageMapComposerProps> = ({
    images,
    imagemap,
    onImageMapChange,
    imagemapName,
    onRenameImageMap,
    labels
}) => {
    const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
    const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
    const [isRenaming, setIsRenaming] = useState(false);
    const [editName, setEditName] = useState(imagemapName);
    const [draggingHotspotId, setDraggingHotspotId] = useState<string | null>(null);
    const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [isResizing, setIsResizing] = useState(false);
    const [resizeHandle, setResizeHandle] = useState<'se' | 'sw' | 'ne' | 'nw' | null>(null);

    const canvasRef = useRef<HTMLDivElement>(null);
    const nameInputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setEditName(imagemapName);
    }, [imagemapName]);

    useEffect(() => {
        if (isRenaming && nameInputRef.current) {
            nameInputRef.current.focus();
            nameInputRef.current.select();
        }
    }, [isRenaming]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            if (e.key === 'Escape') {
                setSelectedHotspotId(null);
                setIsDrawing(false);
                setDrawStart(null);
                setDrawCurrent(null);
                return;
            }

            if (selectedHotspotId && (e.key === 'Delete' || e.key === 'Backspace')) {
                e.preventDefault();
                removeHotspot(selectedHotspotId);
            }
        };

        const container = containerRef.current;
        if (container) {
            container.addEventListener('keydown', handleKeyDown);
            container.tabIndex = 0;
        }
        return () => {
            if (container) container.removeEventListener('keydown', handleKeyDown);
        };
    }, [selectedHotspotId]);

    const removeHotspot = (id: string) => {
        onImageMapChange(prev => ({
            ...prev,
            hotspots: prev.hotspots.filter(h => h.id !== id)
        }));
        setSelectedHotspotId(null);
    };

    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        if (!canvasRef.current || !imagemap.groundImage) return;

        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Check if clicking on an existing hotspot
        const clickedHotspot = imagemap.hotspots.find(h =>
            x >= h.x && x <= h.x + h.width &&
            y >= h.y && y <= h.y + h.height
        );

        if (clickedHotspot) {
            setSelectedHotspotId(clickedHotspot.id);
            setDraggingHotspotId(clickedHotspot.id);
            setDragOffset({ x: x - clickedHotspot.x, y: y - clickedHotspot.y });
        } else {
            // Start drawing new hotspot
            setIsDrawing(true);
            setDrawStart({ x, y });
            setDrawCurrent({ x, y });
            setSelectedHotspotId(null);
        }
    };

    const handleCanvasMouseMove = (e: React.MouseEvent) => {
        if (!canvasRef.current) return;

        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (isDrawing && drawStart) {
            setDrawCurrent({ x, y });
        } else if (draggingHotspotId) {
            const newX = Math.max(0, x - dragOffset.x);
            const newY = Math.max(0, y - dragOffset.y);

            onImageMapChange(prev => ({
                ...prev,
                hotspots: prev.hotspots.map(h =>
                    h.id === draggingHotspotId
                        ? { ...h, x: newX, y: newY }
                        : h
                )
            }));
        }
    };

    const handleCanvasMouseUp = () => {
        if (isDrawing && drawStart && drawCurrent) {
            const x = Math.min(drawStart.x, drawCurrent.x);
            const y = Math.min(drawStart.y, drawCurrent.y);
            const width = Math.abs(drawCurrent.x - drawStart.x);
            const height = Math.abs(drawCurrent.y - drawStart.y);

            // Only create hotspot if it has meaningful size
            if (width > 10 && height > 10) {
                const newHotspot: ImageMapHotspot = {
                    id: `hotspot-${Date.now()}`,
                    x,
                    y,
                    width,
                    height,
                    actionType: 'jump',
                    targetLabel: ''
                };

                onImageMapChange(prev => ({
                    ...prev,
                    hotspots: [...prev.hotspots, newHotspot]
                }));

                setSelectedHotspotId(newHotspot.id);
            }
        }

        setIsDrawing(false);
        setDrawStart(null);
        setDrawCurrent(null);
        setDraggingHotspotId(null);
    };

    const updateHotspot = (id: string, updates: Partial<ImageMapHotspot>) => {
        onImageMapChange(prev => ({
            ...prev,
            hotspots: prev.hotspots.map(h =>
                h.id === id ? { ...h, ...updates } : h
            )
        }));
    };

    const handleGroundImageDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const data = e.dataTransfer.getData('application/renpy-image-path');
        if (!data) return;

        const image = images.find(img => img.filePath === data);
        if (image) {
            onImageMapChange(prev => ({ ...prev, groundImage: image }));
        }
    };

    const handleHoverImageDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const data = e.dataTransfer.getData('application/renpy-image-path');
        if (!data) return;

        const image = images.find(img => img.filePath === data);
        if (image) {
            onImageMapChange(prev => ({ ...prev, hoverImage: image }));
        }
    };

    const generateCode = (): string => {
        if (!imagemap.groundImage) {
            return '# Add a ground image to generate code';
        }

        const groundPath = imagemap.groundImage.filePath.replace(/\\/g, '/');
        const hoverPath = imagemap.hoverImage?.filePath.replace(/\\/g, '/');

        let code = `screen ${imagemap.screenName}:\n`;
        code += `    imagemap:\n`;
        code += `        ground "${groundPath}"\n`;

        if (hoverPath) {
            code += `        hover "${hoverPath}"\n`;
        }

        code += `\n`;

        for (const hotspot of imagemap.hotspots) {
            const action = hotspot.actionType === 'jump' ? 'Jump' : 'Call';
            const target = hotspot.targetLabel || 'label_name';
            code += `        hotspot (${Math.round(hotspot.x)}, ${Math.round(hotspot.y)}, ${Math.round(hotspot.width)}, ${Math.round(hotspot.height)}) action ${action}("${target}")\n`;
        }

        return code;
    };


    const selectedHotspot = imagemap.hotspots.find(h => h.id === selectedHotspotId);

    // Calculate drawing rectangle
    let drawRect: { x: number; y: number; width: number; height: number } | null = null;
    if (isDrawing && drawStart && drawCurrent) {
        const x = Math.min(drawStart.x, drawCurrent.x);
        const y = Math.min(drawStart.y, drawCurrent.y);
        const width = Math.abs(drawCurrent.x - drawStart.x);
        const height = Math.abs(drawCurrent.y - drawStart.y);
        drawRect = { x, y, width, height };
    }

    return (
        <div ref={containerRef} className="flex flex-col h-full bg-gray-100 dark:bg-gray-900" tabIndex={0}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center space-x-2">
                    <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {isRenaming ? (
                        <input
                            ref={nameInputRef}
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onBlur={() => {
                                setIsRenaming(false);
                                if (editName.trim()) onRenameImageMap(editName.trim());
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    setIsRenaming(false);
                                    if (editName.trim()) onRenameImageMap(editName.trim());
                                } else if (e.key === 'Escape') {
                                    setIsRenaming(false);
                                    setEditName(imagemapName);
                                }
                            }}
                            className="px-2 py-1 text-sm font-semibold border border-indigo-500 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                        />
                    ) : (
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {imagemapName}
                        </h2>
                    )}
                    {!isRenaming && (
                        <button
                            onClick={() => setIsRenaming(true)}
                            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                            aria-label="Rename imagemap"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                        </button>
                    )}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                    {imagemap.hotspots.length} hotspot{imagemap.hotspots.length !== 1 ? 's' : ''}
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left Panel - Settings */}
                <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-y-auto">
                    <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Screen Settings</h3>
                    </div>

                    <div className="p-3 space-y-4">
                        {/* Screen Name */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                Screen Name
                            </label>
                            <input
                                type="text"
                                value={imagemap.screenName}
                                onChange={(e) => onImageMapChange(prev => ({ ...prev, screenName: e.target.value }))}
                                className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                                placeholder="my_imagemap"
                            />
                        </div>

                        {/* Ground Image */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                Ground Image
                            </label>
                            <div
                                onDrop={handleGroundImageDrop}
                                onDragOver={(e) => e.preventDefault()}
                                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded p-2 text-center hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors"
                            >
                                {imagemap.groundImage ? (
                                    <div className="space-y-2">
                                        <img
                                            src={imagemap.groundImage.dataUrl}
                                            alt="Ground"
                                            className="w-full h-32 object-contain rounded"
                                        />
                                        <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                                            {imagemap.groundImage.fileName}
                                        </p>
                                        <button
                                            onClick={() => onImageMapChange(prev => ({ ...prev, groundImage: null }))}
                                            className="text-xs text-red-600 dark:text-red-400 hover:underline"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Drag an image here from Assets
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Hover Image */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                Hover Image (Optional)
                            </label>
                            <div
                                onDrop={handleHoverImageDrop}
                                onDragOver={(e) => e.preventDefault()}
                                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded p-2 text-center hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors"
                            >
                                {imagemap.hoverImage ? (
                                    <div className="space-y-2">
                                        <img
                                            src={imagemap.hoverImage.dataUrl}
                                            alt="Hover"
                                            className="w-full h-32 object-contain rounded"
                                        />
                                        <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                                            {imagemap.hoverImage.fileName}
                                        </p>
                                        <button
                                            onClick={() => onImageMapChange(prev => ({ ...prev, hoverImage: null }))}
                                            className="text-xs text-red-600 dark:text-red-400 hover:underline"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Drag an image here from Assets
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Center Panel - Canvas and Code */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Canvas */}
                    <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900 p-4">
                        {imagemap.groundImage ? (
                            <div className="relative inline-block">
                                <img
                                    src={imagemap.groundImage.dataUrl}
                                    alt="Ground"
                                    className="max-w-full h-auto"
                                />
                                <div
                                    ref={canvasRef}
                                    className="absolute inset-0 cursor-crosshair"
                                    onMouseDown={handleCanvasMouseDown}
                                    onMouseMove={handleCanvasMouseMove}
                                    onMouseUp={handleCanvasMouseUp}
                                    onMouseLeave={handleCanvasMouseUp}
                                >
                                    {/* Existing hotspots */}
                                    {imagemap.hotspots.map(hotspot => (
                                        <div
                                            key={hotspot.id}
                                            className={`absolute border-2 cursor-move ${
                                                selectedHotspotId === hotspot.id
                                                    ? 'border-indigo-500 bg-indigo-500/20'
                                                    : 'border-green-500 bg-green-500/10 hover:bg-green-500/20'
                                            }`}
                                            style={{
                                                left: hotspot.x,
                                                top: hotspot.y,
                                                width: hotspot.width,
                                                height: hotspot.height
                                            }}
                                        />
                                    ))}

                                    {/* Drawing rectangle */}
                                    {drawRect && (
                                        <div
                                            className="absolute border-2 border-dashed border-blue-500 bg-blue-500/10"
                                            style={{
                                                left: drawRect.x,
                                                top: drawRect.y,
                                                width: drawRect.width,
                                                height: drawRect.height
                                            }}
                                        />
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-center text-gray-400 dark:text-gray-500">
                                    <svg className="w-16 h-16 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <p className="text-sm font-medium">Add a ground image to start</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Code Preview */}
                    <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex-shrink-0">
                        <div className="flex justify-between items-center px-2 py-1">
                            <span className="text-[10px] font-bold text-gray-400 uppercase">Code Preview</span>
                            <CopyButton text={generateCode()} size="xs" />
                        </div>
                        <pre className="p-3 font-mono text-xs overflow-auto text-gray-600 dark:text-gray-400 select-text max-h-24 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                            {generateCode()}
                        </pre>
                    </div>
                </div>

                {/* Right Panel - Hotspot List */}
                <div className="w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col">
                    <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                            Hotspots ({imagemap.hotspots.length})
                        </h3>
                    </div>

                    {/* Hotspot List */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {imagemap.hotspots.map((hotspot, index) => (
                            <div
                                key={hotspot.id}
                                onClick={() => setSelectedHotspotId(hotspot.id)}
                                className={`p-2 rounded cursor-pointer border ${
                                    selectedHotspotId === hotspot.id
                                        ? 'bg-indigo-100 dark:bg-indigo-900/50 border-indigo-200 dark:border-indigo-700'
                                        : 'hover:bg-gray-100 dark:hover:bg-gray-700 border-transparent'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                        Hotspot {index + 1}
                                    </span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeHotspot(hotspot.id);
                                        }}
                                        className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                                        aria-label="Delete hotspot"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                                <div className="text-[10px] text-gray-500 dark:text-gray-400 space-y-0.5">
                                    <div>Position: ({Math.round(hotspot.x)}, {Math.round(hotspot.y)})</div>
                                    <div>Size: {Math.round(hotspot.width)} × {Math.round(hotspot.height)}</div>
                                </div>
                            </div>
                        ))}

                        {imagemap.hotspots.length === 0 && (
                            <div className="text-center py-8 text-gray-400 dark:text-gray-500">
                                <p className="text-xs">No hotspots yet</p>
                                <p className="text-xs mt-1">Click and drag on the canvas to create one</p>
                            </div>
                        )}
                    </div>

                    {/* Selected Hotspot Properties */}
                    {selectedHotspot && (
                        <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 space-y-3">
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Properties</h4>

                            {/* Action Type */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                    Action
                                </label>
                                <select
                                    value={selectedHotspot.actionType}
                                    onChange={(e) => updateHotspot(selectedHotspot.id, { actionType: e.target.value as ImageMapActionType })}
                                    className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                                >
                                    <option value="jump">Jump</option>
                                    <option value="call">Call</option>
                                </select>
                            </div>

                            {/* Target Label */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                    Target Label
                                </label>
                                <input
                                    type="text"
                                    value={selectedHotspot.targetLabel}
                                    onChange={(e) => updateHotspot(selectedHotspot.id, { targetLabel: e.target.value })}
                                    list="label-suggestions"
                                    className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                                    placeholder="label_name"
                                />
                                <datalist id="label-suggestions">
                                    {labels.map(label => (
                                        <option key={label} value={label} />
                                    ))}
                                </datalist>
                            </div>

                            {/* Bounds */}
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                        X
                                    </label>
                                    <input
                                        type="number"
                                        value={Math.round(selectedHotspot.x)}
                                        onChange={(e) => updateHotspot(selectedHotspot.id, { x: parseInt(e.target.value) || 0 })}
                                        className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                        Y
                                    </label>
                                    <input
                                        type="number"
                                        value={Math.round(selectedHotspot.y)}
                                        onChange={(e) => updateHotspot(selectedHotspot.id, { y: parseInt(e.target.value) || 0 })}
                                        className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                        Width
                                    </label>
                                    <input
                                        type="number"
                                        value={Math.round(selectedHotspot.width)}
                                        onChange={(e) => updateHotspot(selectedHotspot.id, { width: parseInt(e.target.value) || 0 })}
                                        className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                        Height
                                    </label>
                                    <input
                                        type="number"
                                        value={Math.round(selectedHotspot.height)}
                                        onChange={(e) => updateHotspot(selectedHotspot.id, { height: parseInt(e.target.value) || 0 })}
                                        className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImageMapComposer;
