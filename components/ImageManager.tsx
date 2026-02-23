
import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { ProjectImage, ImageMetadata } from '../types';
import ImageContextMenu from './ImageContextMenu';
import ImageThumbnail from './ImageThumbnail';

interface ImageManagerProps {
  images: ProjectImage[];
  metadata: Map<string, ImageMetadata>;
  scanDirectories: string[];
  onAddScanDirectory: () => void;
  onRemoveScanDirectory: (dirName: string) => void;
  onCopyImagesToProject: (sourceFilePaths: string[]) => void;
  onOpenImageEditor: (filePath: string) => void;
  isFileSystemApiSupported: boolean;
  lastScanned: number | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  onCreatePlaceholder?: () => void;
}

const GRID_ITEM_WIDTH = 120;
const GRID_ITEM_HEIGHT = 120;
const GAP = 12;

const ImageManager: React.FC<ImageManagerProps> = ({ images, metadata, scanDirectories, onAddScanDirectory, onRemoveScanDirectory, onCopyImagesToProject, onOpenImageEditor, isFileSystemApiSupported, lastScanned, isRefreshing, onRefresh, onCreatePlaceholder }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSource, setSelectedSource] = useState('Project');
  const [hideGuiAssets, setHideGuiAssets] = useState(true);
  const [selectedImagePaths, setSelectedImagePaths] = useState(new Set<string>());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; image: ProjectImage } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  const sources = useMemo(() => {
    return ['all', 'Project', ...scanDirectories];
  }, [scanDirectories]);

  useEffect(() => {
    // If the currently selected source directory is removed, reset the filter to 'all'
    if (!sources.includes(selectedSource)) {
        setSelectedSource('all');
    }
  }, [sources, selectedSource]);
  
  const filteredImages = useMemo(() => {
    let visibleImages = images;
    
    if (selectedSource !== 'all') {
      if (selectedSource === 'Project') {
        visibleImages = visibleImages.filter(img => {
          if (!img.isInProject) return false;
          if (hideGuiAssets) {
            const normalizedPath = img.filePath.replace(/\\/g, '/');
            if (normalizedPath.includes('/gui/')) return false;
          }
          return true;
        });
      } else {
        // Normalize selectedSource to match internal forward-slash paths
        const normalizedSource = selectedSource.replace(/\\/g, '/').replace(/\/$/, '');
        visibleImages = visibleImages.filter(img => {
             const normalizedPath = img.filePath.replace(/\\/g, '/');
             return normalizedPath.startsWith(`${normalizedSource}/`);
        });
      }
    } else {
      // When viewing 'all', hide external images that have already been copied to the project
      // to avoid showing duplicates (one external, one project).
      // We keep images that are IN the project, OR external images that haven't been copied yet.
      visibleImages = visibleImages.filter(img => img.isInProject || !img.projectFilePath);
    }
    
    if (searchTerm) {
        const lowerSearch = searchTerm.toLowerCase();
        visibleImages = visibleImages.filter(img => 
            img.fileName.toLowerCase().includes(lowerSearch) || 
            (metadata.get(img.projectFilePath || '')?.renpyName || '').toLowerCase().includes(lowerSearch) ||
            (metadata.get(img.projectFilePath || '')?.tags || []).some(tag => tag.toLowerCase().includes(lowerSearch))
        );
    }
    return visibleImages;
  }, [images, metadata, searchTerm, selectedSource, hideGuiAssets]);

  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver(entries => {
      if (entries[0]) setContainerWidth(entries[0].contentRect.width);
    });
    resizeObserver.observe(containerRef.current);
    // Initial width set
    setContainerWidth(containerRef.current.clientWidth);
    return () => resizeObserver.disconnect();
  }, []);

  const { virtualItems, totalHeight } = useMemo(() => {
    if (containerWidth === 0 || filteredImages.length === 0) {
      return { virtualItems: [], totalHeight: 0 };
    }

    const columns = Math.max(1, Math.floor(containerWidth / GRID_ITEM_WIDTH));
    const totalHeight = Math.ceil(filteredImages.length / columns) * GRID_ITEM_HEIGHT;
    
    const containerHeight = containerRef.current?.clientHeight || 0;
    const startIndex = Math.floor(scrollTop / GRID_ITEM_HEIGHT) * columns;
    const endIndex = Math.min(
      filteredImages.length,
      startIndex + (Math.ceil(containerHeight / GRID_ITEM_HEIGHT) * columns) + columns // render one extra row for buffer
    );

    const virtualItems = [];
    for (let i = startIndex; i < endIndex; i++) {
        virtualItems.push({
            image: filteredImages[i],
            style: {
                position: 'absolute',
                top: `${Math.floor(i / columns) * GRID_ITEM_HEIGHT}px`,
                left: `${(i % columns) * GRID_ITEM_WIDTH}px`,
                width: `${GRID_ITEM_WIDTH - GAP}px`,
                height: `${GRID_ITEM_HEIGHT - GAP}px`,
            } as React.CSSProperties
        });
    }

    return { virtualItems, totalHeight };
  }, [filteredImages, containerWidth, scrollTop]);

  const handleSelectImage = (filePath: string, isCurrentlySelected: boolean) => {
      setSelectedImagePaths(prev => {
          const newSet = new Set(prev);
          if (isCurrentlySelected) {
              newSet.delete(filePath);
          } else {
              newSet.add(filePath);
          }
          return newSet;
      });
  };

  const handleCopySelected = () => {
    onCopyImagesToProject(Array.from(selectedImagePaths));
    setSelectedImagePaths(new Set());
  };

  const handleContextMenu = (event: React.MouseEvent, image: ProjectImage) => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      image,
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const getRenpyImageTag = (image: ProjectImage): string => {
    const meta = metadata.get(image.projectFilePath || image.filePath);
    const name = meta?.renpyName || image.fileName.split('.').slice(0, -1).join('.');
    const tags = (meta?.tags || []).join(' ');
    return `${name}${tags ? ` ${tags}` : ''}`.trim().replace(/\s+/g, ' ');
  };

  const handleContextMenuSelect = (type: 'scene' | 'show') => {
    if (!contextMenu) return;
    const imageTag = getRenpyImageTag(contextMenu.image);
    const statement = `${type} ${imageTag}`;
    navigator.clipboard.writeText(statement);
    handleCloseContextMenu();
  };

  const handleDragStart = (e: React.DragEvent, image: ProjectImage) => {
      const imageTag = getRenpyImageTag(image);
      e.dataTransfer.setData('application/renpy-dnd', JSON.stringify({
          text: `show ${imageTag}`
      }));
      e.dataTransfer.setData('text/plain', `show ${imageTag}`);
      // Add specific path for Scene Composer drop target
      e.dataTransfer.setData('application/renpy-image-path', image.filePath);
      e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex-none space-y-4 mb-4">
        <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500 dark:text-gray-400">
                {lastScanned ? `Last scanned: ${new Date(lastScanned).toLocaleTimeString()}` : 'Not scanned.'}
            </span>
            <button onClick={onRefresh} disabled={!isFileSystemApiSupported || isRefreshing} className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1">
                 {isRefreshing ? (
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                 ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 110 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.885-.666A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566z" clipRule="evenodd" /></svg>
                 )}
                 <span>Refresh</span>
            </button>
        </div>
        <div>
            <h3 className="font-semibold mb-2">Image Sources</h3>
            <div className="flex items-center space-x-2">
                <select
                    value={selectedSource}
                    onChange={(e) => setSelectedSource(e.target.value)}
                    className="flex-grow p-2 rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                >
                    {sources.map(source => (
                    <option key={source} value={source}>
                        {source === 'Project' ? 'Project Images' : source}
                    </option>
                    ))}
                </select>
                {selectedSource !== 'all' && selectedSource !== 'Project' && (
                    <button
                        onClick={() => onRemoveScanDirectory(selectedSource)}
                        className="p-2 rounded-md hover:bg-red-200 dark:hover:bg-red-800/50 text-gray-500 dark:text-gray-400 hover:text-red-700 dark:hover:text-red-300 flex-shrink-0"
                        title={`Remove ${selectedSource} from scan list`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                    </button>
                )}
            </div>
            {selectedSource === 'Project' && (
                <label className="flex items-center gap-2 mt-2 cursor-pointer text-xs text-gray-500 dark:text-gray-400 select-none">
                    <input
                        type="checkbox"
                        checked={!hideGuiAssets}
                        onChange={e => setHideGuiAssets(!e.target.checked)}
                        className="h-3.5 w-3.5 rounded"
                    />
                    Show UI assets (gui/)
                </label>
            )}
            <div className="flex space-x-2 mt-2">
                <button
                    onClick={onAddScanDirectory}
                    disabled={!isFileSystemApiSupported}
                    title={isFileSystemApiSupported ? "Add external folder to scan for images" : "Open a project folder to enable this feature"}
                    className="flex-1 px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                    <span>Scan Dir</span>
                </button>
                {onCreatePlaceholder && (
                    <button
                        onClick={onCreatePlaceholder}
                        disabled={!isFileSystemApiSupported}
                        title="Generate a dummy image"
                        className="flex-1 px-3 py-2 rounded bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" /></svg>
                        <span>Placeholder</span>
                    </button>
                )}
            </div>
        </div>
        <div className="flex items-center space-x-2 mt-4">
            <input
                type="text"
                placeholder="Search images by name or tag..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="flex-grow p-2 rounded bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
            />
             <button
                onClick={handleCopySelected}
                disabled={selectedImagePaths.size === 0}
                className="px-3 py-2 rounded bg-green-600 hover:bg-green-700 text-white text-sm font-bold disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
                Copy ({selectedImagePaths.size})
            </button>
        </div>
      </div>
      <div ref={containerRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} className="flex-grow overflow-y-auto -mr-4 pr-4 overscroll-contain">
        {containerWidth > 0 && (
          <div style={{ position: 'relative', height: `${totalHeight}px` }}>
            {virtualItems.map(({ image, style }) => (
              <div key={image.filePath} style={style}>
                <ImageThumbnail
                  image={image}
                  isSelected={selectedImagePaths.has(image.filePath)}
                  onSelect={handleSelectImage}
                  onDoubleClick={onOpenImageEditor}
                  onContextMenu={handleContextMenu}
                  onDragStart={(e) => handleDragStart(e, image)}
                />
              </div>
            ))}
          </div>
        )}
        {filteredImages.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                No images found matching criteria.
            </p>
        )}
      </div>
      {contextMenu && (
        <ImageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          imageTag={getRenpyImageTag(contextMenu.image)}
          onSelect={handleContextMenuSelect}
          onClose={handleCloseContextMenu}
        />
      )}
    </div>
  );
};

export default ImageManager;
