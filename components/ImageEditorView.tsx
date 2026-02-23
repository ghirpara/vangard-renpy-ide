
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { ProjectImage, ImageMetadata } from '../types';

interface ImageEditorViewProps {
  image: ProjectImage;
  allImages: ProjectImage[];
  metadata?: ImageMetadata;
  onUpdateMetadata: (projectFilePath: string, newMetadata: ImageMetadata) => void;
  onCopyToProject: (sourceFilePath: string, metadata: ImageMetadata) => void;
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 16;
const ZOOM_FACTOR = 1.15;

const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const MetadataRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">{label}</p>
        <p className="text-sm text-gray-800 dark:text-gray-200 font-mono break-words">{value}</p>
    </div>
);

const ImageEditorView: React.FC<ImageEditorViewProps> = ({ image, allImages, metadata, onUpdateMetadata, onCopyToProject }) => {
  const [renpyName, setRenpyName] = useState('');
  const [tags, setTags] = useState('');
  const [subfolder, setSubfolder] = useState('');

  const [dimensions, setDimensions] = useState<{ w: number, h: number } | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);

  // Onion Skin State
  const [onionSkinImageId, setOnionSkinImageId] = useState<string>('');
  const [onionSkinOpacity, setOnionSkinOpacity] = useState(0.5);
  const [showOnionSkin, setShowOnionSkin] = useState(true);

  // Zoom & pan state
  const [zoom, setZoom] = useState<number | null>(null); // null = fit to viewport
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  // Refs for use inside non-reactive event listeners
  const fitZoomRef = useRef(1);

  useEffect(() => {
    setRenpyName(metadata?.renpyName || image.fileName.split('.').slice(0, -1).join('.'));
    setTags((metadata?.tags || []).join(', '));
    setSubfolder(metadata?.projectSubfolder || '');
    setDimensions(null);
    setFileSize(null);
    setMimeType(null);
    setZoom(null); // reset to fit when switching images

    const img = new Image();
    img.onload = () => setDimensions({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = image.dataUrl || '';

    if (image.size !== undefined) {
        setFileSize(image.size);
    } else if (image.fileHandle) {
        image.fileHandle.getFile().then(file => {
            setFileSize(file.size);
            setMimeType(file.type);
        });
    } else if (image.dataUrl && image.dataUrl.startsWith('data:')) {
        const match = image.dataUrl.match(/^data:(.+);base64,/);
        if (match) setMimeType(match[1]);
        const base64Data = image.dataUrl.split(',')[1];
        if (base64Data) {
            const size = (base64Data.length * 3 / 4) - (base64Data.endsWith('==') ? 2 : base64Data.endsWith('=') ? 1 : 0);
            setFileSize(size);
        }
    }
  }, [image, metadata]);

  // Track viewport size for fit-zoom calculation
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(entries => {
        const e = entries[0];
        if (e) setContainerSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    observer.observe(viewport);
    setContainerSize({ w: viewport.clientWidth, h: viewport.clientHeight });
    return () => observer.disconnect();
  }, []);

  // Non-passive wheel listener for scroll-to-zoom
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
        setZoom(prev => {
            const current = prev ?? fitZoomRef.current;
            return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current * factor));
        });
    };
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, []);

  const fitZoom = useMemo(() => {
    if (!dimensions || !containerSize || containerSize.w === 0 || containerSize.h === 0) return 1;
    const padding = 32;
    const fz = Math.min(
        (containerSize.w - padding) / dimensions.w,
        (containerSize.h - padding) / dimensions.h
    );
    fitZoomRef.current = fz;
    return fz;
  }, [dimensions, containerSize]);

  const effectiveZoom = zoom ?? fitZoom;

  const imageDisplaySize = useMemo(() => {
    if (!dimensions) return null;
    return {
        width: Math.round(dimensions.w * effectiveZoom),
        height: Math.round(dimensions.h * effectiveZoom),
    };
  }, [dimensions, effectiveZoom]);

  // Compute padding so the image is centered when smaller than the viewport,
  // or has a fixed 16px margin when larger — avoids the flex-centering negative-overflow bug.
  const imgPad = useMemo(() => {
    const min = 16;
    if (!imageDisplaySize || !containerSize) return { left: min, top: min };
    return {
        left: imageDisplaySize.width  > containerSize.w ? min : Math.floor((containerSize.w - imageDisplaySize.width)  / 2),
        top:  imageDisplaySize.height > containerSize.h ? min : Math.floor((containerSize.h - imageDisplaySize.height) / 2),
    };
  }, [imageDisplaySize, containerSize]);

  // Drag-to-pan handlers
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
        x: e.clientX,
        y: e.clientY,
        scrollLeft: viewportRef.current?.scrollLeft ?? 0,
        scrollTop: viewportRef.current?.scrollTop ?? 0,
    };
    setIsDragging(true);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !viewportRef.current) return;
    viewportRef.current.scrollLeft = dragRef.current.scrollLeft - (e.clientX - dragRef.current.x);
    viewportRef.current.scrollTop = dragRef.current.scrollTop - (e.clientY - dragRef.current.y);
  }, []);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
    setIsDragging(false);
  }, []);

  const zoomIn  = () => setZoom(z => Math.min(MAX_ZOOM, (z ?? fitZoom) * ZOOM_FACTOR));
  const zoomOut = () => setZoom(z => Math.max(MIN_ZOOM, (z ?? fitZoom) / ZOOM_FACTOR));

  const handleSaveMetadata = () => {
    if (!image.projectFilePath) return;
    onUpdateMetadata(image.projectFilePath, {
        renpyName: renpyName.trim().replace(/\s+/g, '_'),
        tags: tags.split(',').map(t => t.trim().replace(/\s+/g, '_')).filter(Boolean),
        projectSubfolder: subfolder.trim(),
    });
  };

  const handleCopyToProject = () => {
    onCopyToProject(image.filePath, {
        renpyName: renpyName.trim().replace(/\s+/g, '_'),
        tags: tags.split(',').map(t => t.trim().replace(/\s+/g, '_')).filter(Boolean),
        projectSubfolder: subfolder.trim(),
    });
  };

  const renpyTag = `image ${renpyName} ${tags.split(',').map(t => t.trim()).filter(Boolean).join(' ')}`.trim().replace(/\s+/g, ' ');

  const onionSkinImage = useMemo(() => {
      if (!onionSkinImageId) return null;
      return allImages.find(img => img.filePath === onionSkinImageId);
  }, [onionSkinImageId, allImages]);

  const onionSkinOptions = useMemo(() => {
      return allImages
        .filter(img => img.filePath !== image.filePath)
        .sort((a, b) => a.fileName.localeCompare(b.fileName));
  }, [allImages, image.filePath]);

  const zoomPct = `${Math.round(effectiveZoom * 100)}%`;
  const checkered = "bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScyMCcgaGVpZ2h0PScyMCc+PHJlY3Qgd2lkdGg9JzEwJyBoZWlnaHQ9JzEwJyBmaWxsPSIjZjBmMGYwIiAvPjxyZWN0IHg9JzEwJyB5PScxMCcgd2lkdGg9JzEwJyBoZWlnaHQ9JzEwJyBmaWxsPSIjZjBmMGYwIiAvPjwvc3ZnPg==')] dark:bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScyMCcgaGVpZ2h0PScyMCc+PHJlY3Qgd2lkdGg9JzEwJyBoZWlnaHQ9JzEwJyBmaWxsPSIjMjcyNzJhIiAvPjxyZWN0IHg9JzEwJyB5PScxMCcgd2lkdGg9JzEwJyBoZWlnaHQ9JzEwJyBmaWxsPSIjMjcyNzJhIiAvPjwvc3ZnPg==')]";

  return (
    <div className="w-full h-full flex bg-gray-100 dark:bg-gray-900 overflow-hidden">

      {/* Image viewport */}
      <div className={`flex-grow min-w-0 flex flex-col ${checkered}`}>

        {/* Zoom toolbar */}
        <div className="flex-none flex items-center gap-1 px-3 py-1 bg-white/80 dark:bg-gray-800/80 backdrop-blur border-b border-gray-200 dark:border-gray-700 text-xs select-none">
          <button
            onClick={zoomOut}
            title="Zoom out (scroll down)"
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold"
          >−</button>
          <span className="min-w-[3rem] text-center font-mono text-gray-700 dark:text-gray-300">
            {zoom === null ? `Fit (${zoomPct})` : zoomPct}
          </span>
          <button
            onClick={zoomIn}
            title="Zoom in (scroll up)"
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold"
          >+</button>
          <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
          <button
            onClick={() => setZoom(null)}
            title="Fit to viewport"
            className={`px-2 h-6 rounded text-xs font-medium transition-colors ${zoom === null ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
          >Fit</button>
          <button
            onClick={() => setZoom(1)}
            title="100% — one screen pixel per image pixel"
            className={`px-2 h-6 rounded text-xs font-medium transition-colors ${zoom === 1 ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
          >1:1</button>
          {dimensions && (
            <>
              <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
              <span className="text-gray-400 dark:text-gray-500">{dimensions.w} × {dimensions.h}</span>
            </>
          )}
          <span className="ml-auto text-gray-400 dark:text-gray-500 hidden sm:inline">Scroll to zoom · Drag to pan</span>
        </div>

        {/* Scrollable pan area */}
        <div
          ref={viewportRef}
          className="flex-grow overflow-auto overscroll-contain"
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* Inner wrapper — explicit size so scroll content starts at left:0,
               giving equal scroll access to both left and right edges */}
          <div
            style={{
              position: 'relative',
              minWidth: '100%',
              minHeight: '100%',
              width: imageDisplaySize ? imageDisplaySize.width  + imgPad.left * 2 : undefined,
              height: imageDisplaySize ? imageDisplaySize.height + imgPad.top  * 2 : undefined,
            }}
          >
            {imageDisplaySize ? (
              <div
                style={{
                  position: 'absolute',
                  left: imgPad.left,
                  top: imgPad.top,
                  width: imageDisplaySize.width,
                  height: imageDisplaySize.height,
                }}
              >
                {/* Onion Skin Layer */}
                {onionSkinImage && showOnionSkin && (
                    <img
                        src={onionSkinImage.dataUrl}
                        alt="Onion Skin"
                        draggable={false}
                        className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10"
                        style={{ opacity: onionSkinOpacity }}
                    />
                )}
                {/* Main Image */}
                <img
                    src={image.dataUrl}
                    alt={image.fileName}
                    draggable={false}
                    className="w-full h-full object-contain block shadow-lg"
                />
              </div>
            ) : (
              // Fallback while dimensions load — brief flash, flex centering fine here
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <img
                  src={image.dataUrl}
                  alt={image.fileName}
                  draggable={false}
                  className="max-w-full max-h-full object-contain block shadow-lg"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <aside className="w-80 flex-shrink-0 h-full bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 p-4 flex flex-col space-y-4 overflow-y-auto overscroll-contain">

        {/* Onion Skin Controls */}
        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-lg border border-indigo-100 dark:border-indigo-800">
            <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-bold text-indigo-800 dark:text-indigo-300 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>
                    Compare / Alignment
                </h3>
                <button
                    onClick={() => setShowOnionSkin(!showOnionSkin)}
                    disabled={!onionSkinImageId}
                    className={`text-xs px-2 py-0.5 rounded border ${showOnionSkin ? 'bg-indigo-200 text-indigo-800 border-indigo-300' : 'bg-gray-100 text-gray-500 border-gray-200'}`}
                >
                    {showOnionSkin ? 'ON' : 'OFF'}
                </button>
            </div>
            <div className="space-y-2">
                <select
                    value={onionSkinImageId}
                    onChange={(e) => setOnionSkinImageId(e.target.value)}
                    className="w-full text-xs p-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                >
                    <option value="">-- Select Image to Overlay --</option>
                    {onionSkinOptions.map(img => (
                        <option key={img.filePath} value={img.filePath}>{img.fileName}</option>
                    ))}
                </select>
                {onionSkinImageId && (
                    <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-gray-500">
                            <span>Opacity</span>
                            <span>{Math.round(onionSkinOpacity * 100)}%</span>
                        </div>
                        <input
                            type="range"
                            min="0" max="1" step="0.05"
                            value={onionSkinOpacity}
                            onChange={(e) => setOnionSkinOpacity(parseFloat(e.target.value))}
                            className="w-full h-1.5 bg-gray-300 rounded-lg appearance-none cursor-pointer dark:bg-gray-600 accent-indigo-600"
                        />
                    </div>
                )}
            </div>
        </div>

        <h2 className="text-lg font-bold border-b pb-2 border-gray-200 dark:border-gray-700">Image Properties</h2>

        <div className="space-y-3">
            <MetadataRow label="File Path" value={image.filePath} />
            {image.lastModified && <MetadataRow label="Last Modified" value={new Date(image.lastModified).toLocaleString()} />}
            <MetadataRow label="Dimensions" value={dimensions ? `${dimensions.w} × ${dimensions.h} px` : 'Loading...'} />
            <MetadataRow label="File Size" value={fileSize !== null ? formatBytes(fileSize) : 'Loading...'} />
            <MetadataRow label="File Type" value={mimeType || 'N/A'} />
            <MetadataRow label="Project Status" value={image.isInProject ? 'In Project' : 'External'} />
        </div>

        <div className="border-t pt-4 border-gray-200 dark:border-gray-700 space-y-4">
            <h3 className="text-md font-semibold">Ren'Py Definition</h3>
            <div>
                <label htmlFor="renpyName" className="text-sm font-medium text-gray-700 dark:text-gray-300">Ren'Py Name</label>
                <input
                    id="renpyName"
                    type="text"
                    value={renpyName}
                    onChange={e => setRenpyName(e.target.value)}
                    placeholder="e.g., eileen"
                    className="w-full mt-1 p-2 rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">The short name for the image in code.</p>
            </div>
            <div>
                <label htmlFor="tags" className="text-sm font-medium text-gray-700 dark:text-gray-300">Tags</label>
                <input
                    id="tags"
                    type="text"
                    value={tags}
                    onChange={e => setTags(e.target.value)}
                    placeholder="e.g., happy, smiling"
                    className="w-full mt-1 p-2 rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Comma-separated list of tags.</p>
            </div>
            <div className="bg-gray-100 dark:bg-gray-700/50 p-2 rounded-md">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Generated Tag:</p>
                <code className="text-sm font-mono">{renpyTag}</code>
            </div>
        </div>

        <div className="flex-grow" />

        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
            <h3 className="font-semibold">Project Settings</h3>
            <div>
                <label htmlFor="subfolder" className="text-sm font-medium text-gray-700 dark:text-gray-300">Project Subfolder</label>
                <div className="flex items-center mt-1">
                    <span className="text-sm text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-2 rounded-l-md border border-r-0 border-gray-300 dark:border-gray-600">game/images/</span>
                    <input
                        id="subfolder"
                        type="text"
                        value={subfolder}
                        onChange={e => setSubfolder(e.target.value)}
                        placeholder="e.g., characters/eileen"
                        className="flex-grow p-2 rounded-r-md bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Optional subfolder to copy this image into.</p>
            </div>
            {image.isInProject ? (
                <button onClick={handleSaveMetadata} className="w-full py-2 px-4 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-colors">
                    Save Metadata
                </button>
            ) : image.projectFilePath ? (
                <div className="text-center text-sm text-green-600 dark:text-green-400 font-bold p-2 border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/30 rounded">
                    Copied to Project
                </div>
            ) : (
                <button onClick={handleCopyToProject} className="w-full py-2 px-4 rounded-md bg-green-600 hover:bg-green-700 text-white font-bold transition-colors">
                    Copy to Project
                </button>
            )}
        </div>

      </aside>
    </div>
  );
};

export default ImageEditorView;
