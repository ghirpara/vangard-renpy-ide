
import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { RenpyAudio, AudioMetadata } from '../types';
import AudioContextMenu from './AudioContextMenu';

interface AudioManagerProps {
  audios: RenpyAudio[];
  metadata: Map<string, AudioMetadata>;
  scanDirectories: string[];
  onAddScanDirectory: () => void;
  onRemoveScanDirectory: (dirName: string) => void;
  onCopyAudiosToProject: (sourceFilePaths: string[]) => void;
  onOpenAudioEditor: (filePath: string) => void;
  isFileSystemApiSupported: boolean;
  lastScanned: number | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}

const AudioItem: React.FC<{
  audio: RenpyAudio;
  isSelected: boolean;
  onSelect: (filePath: string, isSelected: boolean) => void;
  onDoubleClick: (filePath: string) => void;
  onContextMenu: (event: React.MouseEvent, audio: RenpyAudio) => void;
  onDragStart: (event: React.DragEvent) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
}> = ({ audio, isSelected, onSelect, onDoubleClick, onContextMenu, onDragStart, isPlaying, onTogglePlay }) => {
  const borderClass = (audio.isInProject || audio.projectFilePath) ? 'border-red-500 dark:border-red-400' : 'border-transparent';
  const selectionClass = isSelected ? 'ring-2 ring-offset-2 ring-indigo-500 dark:ring-indigo-400 ring-offset-gray-50 dark:ring-offset-gray-900' : '';

  return (
    <div
      className={`relative p-2 bg-gray-200 dark:bg-gray-700 rounded-md cursor-pointer group transition-all duration-150 border-2 ${borderClass} ${selectionClass} flex items-center space-x-2`}
      title={audio.filePath}
      onClick={() => onSelect(audio.filePath, isSelected)}
      onDoubleClick={() => onDoubleClick(audio.filePath)}
      onContextMenu={(e) => onContextMenu(e, audio)}
      draggable
      onDragStart={onDragStart}
    >
      <button 
        onClick={(e) => { e.stopPropagation(); onTogglePlay(); }}
        className="p-1 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors focus:outline-none flex-shrink-0"
        title={isPlaying ? "Stop" : "Play Preview"}
      >
        {isPlaying ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" /></svg>
        ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
        )}
      </button>
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0 opacity-50" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" /></svg>
      <p className="text-sm font-mono truncate">{audio.fileName}</p>
    </div>
  );
};

const AudioManager: React.FC<AudioManagerProps> = ({ audios, metadata, scanDirectories, onAddScanDirectory, onRemoveScanDirectory, onCopyAudiosToProject, onOpenAudioEditor, isFileSystemApiSupported, lastScanned, isRefreshing, onRefresh }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSource, setSelectedSource] = useState('Project');
  const [selectedAudioPaths, setSelectedAudioPaths] = useState(new Set<string>());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; audio: RenpyAudio } | null>(null);
  
  const [playingFile, setPlayingFile] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
      return () => {
          if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current.src = "";
              audioRef.current = null;
          }
      };
  }, []);

  const sources = useMemo(() => {
    return ['all', 'Project', ...scanDirectories];
  }, [scanDirectories]);

  useEffect(() => {
    if (!sources.includes(selectedSource)) {
        setSelectedSource('all');
    }
  }, [sources, selectedSource]);

  const filteredAudios = useMemo(() => {
    let visibleAudios = audios;

    if (selectedSource !== 'all') {
      if (selectedSource === 'Project') {
        visibleAudios = visibleAudios.filter(aud => aud.isInProject);
      } else {
        // Normalize selectedSource to match internal forward-slash paths
        const normalizedSource = selectedSource.replace(/\\/g, '/').replace(/\/$/, '');
        visibleAudios = visibleAudios.filter(aud => {
             const normalizedPath = aud.filePath.replace(/\\/g, '/');
             return normalizedPath.startsWith(`${normalizedSource}/`);
        });
      }
    } else {
      // When viewing 'all', hide external audios that have already been copied to the project
      // to avoid showing duplicates.
      visibleAudios = visibleAudios.filter(aud => aud.isInProject || !aud.projectFilePath);
    }

    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      visibleAudios = visibleAudios.filter(aud =>
        aud.fileName.toLowerCase().includes(lowerSearch) ||
        (metadata.get(aud.projectFilePath || '')?.renpyName || '').toLowerCase().includes(lowerSearch) ||
        (metadata.get(aud.projectFilePath || '')?.tags || []).some(tag => tag.toLowerCase().includes(lowerSearch))
      );
    }
    return visibleAudios;
  }, [audios, metadata, searchTerm, selectedSource]);

  const handleSelectAudio = (filePath: string, isCurrentlySelected: boolean) => {
    setSelectedAudioPaths(prev => {
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
    onCopyAudiosToProject(Array.from(selectedAudioPaths));
    setSelectedAudioPaths(new Set());
  };

  const handleContextMenu = (event: React.MouseEvent, audio: RenpyAudio) => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      audio,
    });
  };

  const getRenpyAudioTag = (audio: RenpyAudio): string => {
    const meta = metadata.get(audio.projectFilePath || audio.filePath);
    const name = meta?.renpyName || audio.fileName.split('.').slice(0, -1).join('.');
    const tags = (meta?.tags || []).join(' ');
    return `${name}${tags ? ` ${tags}` : ''}`.trim().replace(/\s+/g, ' ');
  };

  // Helper to get clean path for drag/drop and clipboard
  const getSmartAudioPath = (audio: RenpyAudio) => {
      let path = audio.projectFilePath || audio.filePath;
      // Normalize separators to forward slashes
      path = path.replace(/\\/g, '/');
      
      // Ren'Py searches game/audio recursively by default, so we can strip that prefix
      // to make the code cleaner (e.g. play music "track.mp3" instead of "game/audio/track.mp3")
      if (path.startsWith('game/audio/')) {
          return path.substring('game/audio/'.length);
      }
      return path;
  };

  const handleContextMenuSelect = (type: 'play' | 'queue') => {
    if (!contextMenu) return;
    const filePath = getSmartAudioPath(contextMenu.audio);
    const command = `${type} audio "${filePath}"`;
    navigator.clipboard.writeText(command);
    setContextMenu(null);
  };

  const handleTogglePlay = (audio: RenpyAudio) => {
      if (playingFile === audio.filePath) {
          // If currently playing, just stop it.
          if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current.currentTime = 0;
          }
          setPlayingFile(null);
      } else {
          // Stop any previous audio
          if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current = null;
          }

          // Create a new Audio object to avoid reuse issues
          const newAudio = new Audio();
          audioRef.current = newAudio;
          
          newAudio.onended = () => {
              setPlayingFile(null);
          };
          newAudio.onerror = (e) => {
              console.error("Audio playback error", e);
              setPlayingFile(null);
          };
          
          newAudio.src = audio.dataUrl;
          newAudio.play().catch(e => {
              console.error("Playback failed", e);
              setPlayingFile(null);
          });
          
          setPlayingFile(audio.filePath);
      }
  };

  const handleDragStart = (e: React.DragEvent, audio: RenpyAudio) => {
      const filePath = getSmartAudioPath(audio);
      const statement = `play audio "${filePath}"`;
      e.dataTransfer.setData('application/renpy-dnd', JSON.stringify({
          text: statement
      }));
      e.dataTransfer.setData('text/plain', statement);
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
          <h3 className="font-semibold mb-2">Audio Sources</h3>
            <div className="flex items-center space-x-2">
                <select
                    value={selectedSource}
                    onChange={(e) => setSelectedSource(e.target.value)}
                    className="flex-grow p-2 rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                >
                    {sources.map(source => (
                    <option key={source} value={source}>
                        {source === 'Project' ? 'Project Audio' : source}
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
           <button
              onClick={onAddScanDirectory}
              disabled={!isFileSystemApiSupported}
              title={isFileSystemApiSupported ? "Add external folder to scan for audio" : "Open a project folder to enable this feature"}
              className="w-full mt-2 px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
              <span>Add Directory to Scan</span>
            </button>
        </div>
        <div className="flex items-center space-x-2 mt-4">
          <input
            type="text"
            placeholder="Search audio by name or tag..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="flex-grow p-2 rounded bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <button
            onClick={handleCopySelected}
            disabled={selectedAudioPaths.size === 0}
            className="px-3 py-2 rounded bg-green-600 hover:bg-green-700 text-white text-sm font-bold disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Copy to Project ({selectedAudioPaths.size})
          </button>
        </div>
      </div>
      <div className="flex-grow overflow-y-auto -mr-4 pr-4 overscroll-contain">
        <div className="space-y-2">
          {filteredAudios.map(audio => (
            <AudioItem
              key={audio.filePath}
              audio={audio}
              isSelected={selectedAudioPaths.has(audio.filePath)}
              onSelect={handleSelectAudio}
              onDoubleClick={onOpenAudioEditor}
              onContextMenu={handleContextMenu}
              onDragStart={(e) => handleDragStart(e, audio)}
              isPlaying={playingFile === audio.filePath}
              onTogglePlay={() => handleTogglePlay(audio)}
            />
          ))}
        </div>
        {audios.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No audio found. Add a source directory to get started.</p>}
        {audios.length > 0 && filteredAudios.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No audio files match your filter.</p>}
      </div>
      {contextMenu && (
        <AudioContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          filePath={getSmartAudioPath(contextMenu.audio)}
          onSelect={handleContextMenuSelect}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};

export default AudioManager;
