import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useImmer } from 'use-immer';
import Toolbar from './components/Toolbar';
import StoryCanvas from './components/StoryCanvas';
import FileExplorerPanel from './components/FileExplorerPanel';
import SearchPanel from './components/SearchPanel';
import EditorView from './components/EditorView';
import StoryElementsPanel from './components/StoryElementsPanel';
import RouteCanvas from './components/RouteCanvas';
import SettingsModal from './components/SettingsModal';
import ConfirmModal from './components/ConfirmModal';
import CreateBlockModal, { BlockType } from './components/CreateBlockModal';
import ConfigureRenpyModal from './components/ConfigureRenpyModal';
import Toast from './components/Toast';
import LoadingOverlay from './components/LoadingOverlay';
import WelcomeScreen from './components/WelcomeScreen';
import ImageEditorView from './components/ImageEditorView';
import AudioEditorView from './components/AudioEditorView';
import CharacterEditorView from './components/CharacterEditorView';
import SceneComposer from './components/SceneComposer';
import PunchlistManager from './components/PunchlistManager';
import TabContextMenu from './components/TabContextMenu';
import Sash from './components/Sash';
import StatusBar from './components/StatusBar';
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal';
import AboutModal from './components/AboutModal';
import AIGeneratorView from './components/AIGeneratorView';
import StatsView from './components/StatsView';
import { useRenpyAnalysis, performRenpyAnalysis, performRouteAnalysis } from './hooks/useRenpyAnalysis';
import { useHistory } from './hooks/useHistory';
import type { 
  Block, BlockGroup, Link, Position, FileSystemTreeNode, EditorTab, 
  ToastMessage, IdeSettings, Theme, ProjectImage, RenpyAudio, 
  ClipboardState, ImageMetadata, AudioMetadata, LabelNode, Character,
  AppSettings, ProjectSettings, StickyNote, SearchResult, SceneComposition, SceneSprite, PunchlistMetadata, MouseGestureSettings
} from './types';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import packageJson from './package.json';

// --- Versioning ---
const APP_VERSION = process.env.APP_VERSION || '0.4.0';
const BUILD_NUMBER = process.env.BUILD_NUMBER || 'dev';

// --- Utility: ArrayBuffer to Base64 (Browser Compatible) ---
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

// Minimal 1-sample silent WAV base64
const SILENT_WAV_BASE64 = "UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAAAAAA==";

// --- Utility: Word Count ---
const countWordsInRenpyScript = (script: string): number => {
    if (!script) return 0;
    // Regex to find dialogue (e.g., e "...") and narration ("...")
    const DIALOGUE_NARRATION_REGEX = /(?:[a-zA-Z0-9_]+\s)?"((?:\\.|[^"\\])*)"/g;
    let totalWords = 0;
    let match;
    while ((match = DIALOGUE_NARRATION_REGEX.exec(script)) !== null) {
        const text = match[1];
        if (text) {
            const words = text.trim().split(/\s+/).filter(Boolean);
            totalWords += words.length;
        }
    }
    return totalWords;
};


// --- Generic Layout Algorithm ---
interface LayoutNode {
    id: string;
    width: number;
    height: number;
    position: Position;
}

interface LayoutEdge {
    sourceId: string;
    targetId: string;
}

const computeAutoLayout = <T extends LayoutNode>(nodes: T[], edges: LayoutEdge[]): T[] => {
    if (!nodes || nodes.length === 0) return [];

    const PADDING_X = 100;
    const PADDING_Y = 80;
    const COMPONENT_SPACING = 200;
    const DEFAULT_WIDTH = 300;
    const DEFAULT_HEIGHT = 150;

    // 1. Sanitize inputs
    const sanitizedNodes = nodes.map(n => ({
        ...n,
        width: (n.width && n.width > 50) ? n.width : DEFAULT_WIDTH,
        height: (n.height && n.height > 50) ? n.height : DEFAULT_HEIGHT,
    }));
    
    const nodeMap = new Map(sanitizedNodes.map(n => [n.id, n]));
    const allNodeIds = new Set(sanitizedNodes.map(n => n.id));

    // 2. Identify Connected Components
    const undirectedAdj = new Map<string, string[]>();
    allNodeIds.forEach(id => undirectedAdj.set(id, []));
    
    edges.forEach(edge => {
        if (allNodeIds.has(edge.sourceId) && allNodeIds.has(edge.targetId)) {
            undirectedAdj.get(edge.sourceId)?.push(edge.targetId);
            undirectedAdj.get(edge.targetId)?.push(edge.sourceId);
        }
    });

    const components: string[][] = [];
    const visited = new Set<string>();

    for (const nodeId of allNodeIds) {
        if (!visited.has(nodeId)) {
            const component: string[] = [];
            const queue = [nodeId];
            visited.add(nodeId);
            while (queue.length > 0) {
                const u = queue.shift()!;
                component.push(u);
                undirectedAdj.get(u)?.forEach(v => {
                    if (!visited.has(v)) {
                        visited.add(v);
                        queue.push(v);
                    }
                });
            }
            components.push(component);
        }
    }

    // Sort components by size (largest first)
    components.sort((a, b) => b.length - a.length);

    // 3. Layout each component
    const finalPositions = new Map<string, Position>();
    let currentOffsetX = 50;

    // Directed adjacency for layering
    const adj = new Map<string, string[]>();
    allNodeIds.forEach(id => adj.set(id, []));
    edges.forEach(edge => {
        if (allNodeIds.has(edge.sourceId) && allNodeIds.has(edge.targetId)) {
            adj.get(edge.sourceId)?.push(edge.targetId);
        }
    });

    components.forEach(componentIds => {
        const compNodes = new Set(componentIds);
        const compInDegree = new Map<string, number>();
        componentIds.forEach(id => compInDegree.set(id, 0));

        componentIds.forEach(u => {
            adj.get(u)?.forEach(v => {
                if (compNodes.has(v)) {
                    compInDegree.set(v, (compInDegree.get(v) || 0) + 1);
                }
            });
        });

        const queue: string[] = [];
        compInDegree.forEach((d, id) => { if (d === 0) queue.push(id); });
        
        // Cycle breaking
        if (queue.length === 0 && componentIds.length > 0) {
            let minDegree = Infinity;
            let candidate = componentIds[0];
            compInDegree.forEach((d, id) => {
                if (d < minDegree) {
                    minDegree = d;
                    candidate = id;
                }
            });
            queue.push(candidate);
        }

        const layers: string[][] = [];
        const visitedInLayering = new Set<string>();
        let iterationCount = 0;
        const MAX_ITERATIONS = componentIds.length * 2 + 100; 

        while(queue.length > 0) {
            iterationCount++;
            if (iterationCount > MAX_ITERATIONS) break;

            const layerSize = queue.length;
            const layer: string[] = [];
            
            for(let i=0; i<layerSize; i++) {
                const u = queue.shift()!;
                if (visitedInLayering.has(u)) continue;
                visitedInLayering.add(u);
                layer.push(u);

                adj.get(u)?.forEach(v => {
                    if (compNodes.has(v)) {
                        const currentDeg = compInDegree.get(v) || 0;
                        compInDegree.set(v, currentDeg - 1);
                        if ((compInDegree.get(v) || 0) <= 0 && !visitedInLayering.has(v)) {
                            if (!queue.includes(v)) queue.push(v);
                        }
                    }
                });
            }
            if (layer.length > 0) layers.push(layer);
        }

        const remaining = componentIds.filter(id => !visitedInLayering.has(id));
        if (remaining.length > 0) layers.push(remaining);

        // Position layers
        let layerX = 0;
        layers.forEach(layer => {
            let maxW = 0;
            let totalH = 0;
            layer.forEach(id => {
                const n = nodeMap.get(id);
                if (n) {
                    maxW = Math.max(maxW, n.width);
                    totalH += n.height;
                }
            });
            totalH += (layer.length - 1) * PADDING_Y;

            let currentY = -totalH / 2;
            layer.forEach(id => {
                const n = nodeMap.get(id);
                if (n) {
                    const x = layerX + (maxW - n.width) / 2;
                    finalPositions.set(id, {
                        x: currentOffsetX + x,
                        y: currentY + 100 // Offset to avoid top edge
                    });
                    currentY += n.height + PADDING_Y;
                }
            });

            layerX += maxW + PADDING_X;
        });

        const componentWidth = Math.max(layerX - PADDING_X, DEFAULT_WIDTH); 
        currentOffsetX += componentWidth + COMPONENT_SPACING;
    });

    // Normalize Y
    let minY = Infinity;
    finalPositions.forEach(p => { if (p.y < minY) minY = p.y; });
    
    if (minY !== Infinity) {
        const targetY = 100;
        const shift = targetY - minY;
        finalPositions.forEach(p => { p.y += shift; });
    } else {
         // Fallback for completely disconnected single nodes if algorithm somehow failed
         let x = 50;
         const y = 100;
         nodes.forEach(n => {
             if (!finalPositions.has(n.id)) {
                 finalPositions.set(n.id, { x, y });
                 x += n.width + 50;
             }
         });
    }

    return nodes.map(n => {
        const pos = finalPositions.get(n.id);
        return pos ? { ...n, position: pos } : n;
    });
};


// --- Main App Component ---

interface UnsavedChangesModalInfo {
    title: string;
    message: string;
    confirmText: string;
    dontSaveText: string;
    onConfirm: () => Promise<void> | void;
    onDontSave: () => void;
    onCancel: () => void;
}

const AVAILABLE_MODELS = [
    'gemini-2.5-flash',
    'gemini-3-pro-preview',
    'gemini-2.5-flash-image',
    'gemini-3-pro-image-preview',
    'veo-3.1-fast-generate-preview',
    'gpt-4o',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
    'claude-3-5-sonnet-20241022',
    'claude-3-opus-20250219',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307'
];

const App: React.FC = () => {
  // --- State: Welcome Screen ---
  const [showWelcome, setShowWelcome] = useState(true);

  // --- State: Blocks & Groups (Undo/Redo) ---
  const { state: blocks, setState: setBlocks, undo, redo, canUndo, canRedo } = useHistory<Block[]>([]);
  const [groups, setGroups] = useImmer<BlockGroup[]>([]);
  const [stickyNotes, setStickyNotes] = useImmer<StickyNote[]>([]);
  
  // Use a ref to track blocks for effects that need current blocks without triggering updates
  const blocksRef = useRef(blocks);
  useEffect(() => { blocksRef.current = blocks; }, [blocks]);

  // --- State: File System & Environment ---
  const [projectRootPath, setProjectRootPath] = useState<string | null>(null);
  
  // Update window title based on project path
  useEffect(() => {
    if (projectRootPath) {
      document.title = `Ren'IDE (${projectRootPath})`;
    } else {
      document.title = "Ren'IDE";
    }
  }, [projectRootPath]);

  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [fileSystemTree, setFileSystemTree] = useState<FileSystemTreeNode | null>(null);
  
  // Use standard useState for Maps to avoid Immer proxy issues with native Maps
  const [images, setImages] = useState<Map<string, ProjectImage>>(new Map());
  const [audios, setAudios] = useState<Map<string, RenpyAudio>>(new Map());
  const [imageMetadata, setImageMetadata] = useState<Map<string, ImageMetadata>>(new Map());
  const [audioMetadata, setAudioMetadata] = useState<Map<string, AudioMetadata>>(new Map());
  
  // --- State: File Explorer Selection & Expansion ---
  const [explorerSelectedPaths, setExplorerSelectedPaths] = useState<Set<string>>(new Set());
  const [explorerLastClickedPath, setExplorerLastClickedPath] = useState<string | null>(null);
  const [explorerExpandedPaths, setExplorerExpandedPaths] = useState<Set<string>>(new Set());

  // --- State: Scanning ---
  const [imageScanDirectories, setImageScanDirectories] = useState<Map<string, FileSystemDirectoryHandle>>(new Map());
  const [audioScanDirectories, setAudioScanDirectories] = useState<Map<string, FileSystemDirectoryHandle>>(new Map());
  const [imagesLastScanned, setImagesLastScanned] = useState<number | null>(null);
  const [audiosLastScanned, setAudiosLastScanned] = useState<number | null>(null);
  const [isRefreshingImages, setIsRefreshingImages] = useState(false);
  const [isRefreshingAudios, setIsRefreshingAudios] = useState(false);

  // --- State: UI & Editor ---
  const [openTabs, setOpenTabs] = useState<EditorTab[]>([{ id: 'canvas', type: 'canvas' }]);
  const [activeTabId, setActiveTabId] = useState<string>('canvas');
  const [selectedBlockIds, setSelectedBlockIds] = useState<string[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dragSourcePaneId, setDragSourcePaneId] = useState<'primary' | 'secondary'>('primary');
  const [splitLayout, setSplitLayout] = useState<'none' | 'right' | 'bottom'>('none');
  const [splitPrimarySize, setSplitPrimarySize] = useState<number>(600);
  const [secondaryOpenTabs, setSecondaryOpenTabs] = useState<EditorTab[]>([]);
  const [secondaryActiveTabId, setSecondaryActiveTabId] = useState<string>('');
  const [activePaneId, setActivePaneId] = useState<'primary' | 'secondary'>('primary');
  
  // Scene Composer State
  const [sceneCompositions, setSceneCompositions] = useImmer<Record<string, SceneComposition>>({});
  const [sceneNames, setSceneNames] = useImmer<Record<string, string>>({});

  // Punchlist State
  const [punchlistMetadata, setPunchlistMetadata] = useImmer<Record<string, PunchlistMetadata>>({});
  
  const [dirtyBlockIds, setDirtyBlockIds] = useState<Set<string>>(new Set());
  const [dirtyEditors, setDirtyEditors] = useState<Set<string>>(new Set()); // Blocks modified in editor but not synced to block state yet
  const [hasUnsavedSettings, setHasUnsavedSettings] = useState(false); // Track project setting changes like sticky notes
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'error'>('saved');
  const [statusBarMessage, setStatusBarMessage] = useState('');
  
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const loadCancelRef = useRef(false);
  const [nonRenpyWarningPath, setNonRenpyWarningPath] = useState<string | null>(null);
  
  const [deleteConfirmInfo, setDeleteConfirmInfo] = useState<{ paths: string[]; onConfirm: () => void; } | null>(null);
  const [createBlockModalOpen, setCreateBlockModalOpen] = useState(false);
  const [unsavedChangesModalInfo, setUnsavedChangesModalInfo] = useState<UnsavedChangesModalInfo | null>(null);
  const [contextMenuInfo, setContextMenuInfo] = useState<{ x: number; y: number; tabId: string; paneId: 'primary' | 'secondary' } | null>(null);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);
  
  // --- State: View Transforms ---
  const [storyCanvasTransform, setStoryCanvasTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [routeCanvasTransform, setRouteCanvasTransform] = useState({ x: 0, y: 0, scale: 1 });

  // --- State: Game Execution ---
  const [isGameRunning, setIsGameRunning] = useState(false);
  const [showConfigureRenpyModal, setShowConfigureRenpyModal] = useState(false);

  // --- State: Application and Project Settings ---
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [appSettingsLoaded, setAppSettingsLoaded] = useState(false);
  const [characterProfiles, setCharacterProfiles] = useImmer<Record<string, string>>({});
  const [appSettings, updateAppSettings] = useImmer<AppSettings>({
    theme: 'system',
    isLeftSidebarOpen: true,
    leftSidebarWidth: 250,
    isRightSidebarOpen: true,
    rightSidebarWidth: 300,
    renpyPath: '',
    recentProjects: [],
    editorFontFamily: "'Consolas', 'Courier New', monospace",
    editorFontSize: 14,
    mouseGestures: { canvasPanGesture: 'shift-drag', middleMouseAlwaysPans: false, zoomScrollDirection: 'normal', zoomScrollSensitivity: 1.0 },
  });
  const [isRenpyPathValid, setIsRenpyPathValid] = useState(false);
  const [projectSettings, updateProjectSettings] = useImmer<Omit<ProjectSettings, 'openTabs' | 'activeTabId' | 'stickyNotes' | 'characterProfiles' | 'punchlistMetadata' | 'sceneCompositions' | 'sceneNames' | 'scannedImagePaths' | 'scannedAudioPaths'>>({
    enableAiFeatures: false,
    selectedModel: 'gemini-2.5-flash',
    draftingMode: false,
  });

  // --- State: Clipboard & Highlights ---
  const [clipboard, setClipboard] = useState<ClipboardState>(null);
  const [findUsagesHighlightIds, setFindUsagesHighlightIds] = useState<Set<string> | null>(null);
  const [centerOnBlockRequest, setCenterOnBlockRequest] = useState<{ blockId: string, key: number } | null>(null);
  const [flashBlockRequest, setFlashBlockRequest] = useState<{ blockId: string, key: number } | null>(null);
  const [canvasFilters, setCanvasFilters] = useState({ story: true, screens: true, config: false, notes: true, minimap: true });
  const [editorCursorPosition, setEditorCursorPosition] = useState<{ line: number; column: number } | null>(null);
  const [hoverHighlightIds, setHoverHighlightIds] = useState<Set<string> | null>(null);

  // --- State: Route Canvas ---
  const [routeNodeLayoutCache, setRouteNodeLayoutCache] = useState<Map<string, Position>>(new Map());

  // --- State: Search ---
  const [activeLeftPanel, setActiveLeftPanel] = useState<'explorer' | 'search'>('explorer');
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [searchOptions, setSearchOptions] = useImmer({
    isCaseSensitive: false,
    isWholeWord: false,
    isRegex: false,
  });
  const [searchResults, setSearchResults] = useImmer<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [replaceAllConfirmInfo, setReplaceAllConfirmInfo] = useState<{ onConfirm: () => void; totalMatches: number; totalFiles: number; } | null>(null);

  // --- Analysis ---
  const analysisResult = useRenpyAnalysis(blocks, 0); // 0 is a trigger for force re-analysis if needed
  
  // --- Refs ---
  const editorInstances = useRef<Map<string, monaco.editor.IStandaloneCodeEditor>>(new Map());
  const primaryTabBarRef = useRef<HTMLDivElement>(null);
  const secondaryTabBarRef = useRef<HTMLDivElement>(null);
  const initialLayoutNeeded = useRef(false);

  // --- Utility Functions ---
  const getCurrentContext = useCallback(() => {
    // Find the currently active editor tab
    const activeEditorTab = openTabs.find(t => t.id === activeTabId && t.type === 'editor');
    if (activeEditorTab && activeEditorTab.blockId) {
      const editor = editorInstances.current.get(activeEditorTab.blockId);
      if (editor) {
        const model = editor.getModel();
        const position = editor.getPosition();
        if (model && position) {
          return model.getValueInRange({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column
          });
        }
      }
    }
    return '';
  }, [activeTabId, openTabs]);

  const getCurrentBlockId = useCallback(() => {
    // Find the currently active editor tab
    const activeEditorTab = openTabs.find(t => t.id === activeTabId && t.type === 'editor');
    return activeEditorTab?.blockId || '';
  }, [activeTabId, openTabs]);

  // --- Derived State for Drafting Mode ---
  const existingImageTags = useMemo(() => {
      const tags = new Set<string>();
      // Defined in script (e.g. image eileen = ...)
      analysisResult.definedImages.forEach(img => tags.add(img));
      
      // Defined by files in project or scanned
      imageMetadata.forEach((meta) => {
          const fullTag = `${meta.renpyName} ${meta.tags.join(' ')}`.trim();
          tags.add(fullTag);
      });
      images.forEach((img) => {
          if (!img.projectFilePath && !imageMetadata.has(img.filePath)) {
              tags.add(img.fileName.split('.')[0]);
          }
      });
      return tags;
  }, [analysisResult.definedImages, imageMetadata, images]);

  const existingAudioPaths = useMemo(() => {
      const paths = new Set<string>();
      audios.forEach((audio) => {
          // Normalize to forward slashes
          let p = audio.projectFilePath || audio.filePath;
          p = p.replace(/\\/g, '/');
          
          paths.add(p); // Full path
          if (p.startsWith('game/audio/')) {
              paths.add(p.substring('game/audio/'.length)); // Relative to game/audio
          }
          paths.add(audio.fileName); // Just filename (Ren'Py search)
      });
      
      // Add explicit variable names for audio defined in scripts
      analysisResult.variables.forEach(v => {
          paths.add(v.name);
      });
      
      return paths;
  }, [audios, analysisResult.variables]);

  // --- Route View Logic ---
  const handleUpdateRouteNodePositions = useCallback((updates: { id: string, position: Position }[]) => {
      setRouteNodeLayoutCache(prev => {
          const next = new Map(prev);
          updates.forEach(u => next.set(u.id, u.position));
          return next;
      });
  }, []);

  const routeAnalysisResult = useMemo(() => {
      const raw = performRouteAnalysis(blocks, analysisResult.labels, analysisResult.jumps);
      
      // Compute default layout for all nodes to prevent stacking at 0,0
      // We run this every time the graph structure changes, essentially
      const edges = raw.routeLinks.map(l => ({ sourceId: l.sourceId, targetId: l.targetId }));
      const layoutedNodes = computeAutoLayout(raw.labelNodes, edges);

      // Apply User Overrides (Cache)
      // If the user has manually moved a node, we prioritize that position over the auto-layout
      const finalNodes = layoutedNodes.map(n => {
          const cached = routeNodeLayoutCache.get(n.id);
          return cached ? { ...n, position: cached } : n;
      });

      return {
          ...raw,
          labelNodes: finalNodes
      };
  }, [blocks, analysisResult, routeNodeLayoutCache]);

  // --- Scene Composer Management ---
  const handleCreateScene = useCallback((initialName?: string) => {
      const id = `scene-${Date.now()}`;
      const name = initialName || `Scene ${Object.keys(sceneCompositions).length + 1}`;
      
      setSceneCompositions(draft => {
          draft[id] = { background: null, sprites: [] };
      });
      setSceneNames(draft => {
          draft[id] = name;
      });
      
      setOpenTabs(prev => [...prev, { id, type: 'scene-composer', sceneId: id }]);
      setActiveTabId(id);
      setHasUnsavedSettings(true);
  }, [sceneCompositions, setSceneCompositions, setSceneNames]);

  const handleOpenScene = useCallback((sceneId: string) => {
      setOpenTabs(prev => {
          if (!prev.find(t => t.id === sceneId)) {
              return [...prev, { id: sceneId, type: 'scene-composer', sceneId }];
          }
          return prev;
      });
      setActiveTabId(sceneId);
  }, []);

  const handleSceneUpdate = useCallback((sceneId: string, value: React.SetStateAction<SceneComposition>) => {
      setSceneCompositions(draft => {
          const prev = draft[sceneId] || { background: null, sprites: [] };
          const next = typeof value === 'function' ? (value as (prevState: SceneComposition) => SceneComposition)(prev) : value;
          
          if (JSON.stringify(prev) !== JSON.stringify(next)) {
              draft[sceneId] = next;
              setHasUnsavedSettings(true);
          }
      });
  }, [setSceneCompositions]);

  const handleRenameScene = useCallback((sceneId: string, newName: string) => {
      setSceneNames(draft => {
          if (draft[sceneId] !== newName) {
              draft[sceneId] = newName;
              setHasUnsavedSettings(true);
          }
      });
  }, [setSceneNames]);

  const handleDeleteScene = useCallback((sceneId: string) => {
      setSceneCompositions(draft => { delete draft[sceneId]; });
      setSceneNames(draft => { delete draft[sceneId]; });
      
      setOpenTabs(prev => prev.filter(t => t.id !== sceneId));
      if (activeTabId === sceneId) setActiveTabId('canvas');
      setHasUnsavedSettings(true);
  }, [setSceneCompositions, setSceneNames, activeTabId]);


  // --- Sync Explorer with Active Tab ---
  useEffect(() => {
    if (activeTabId === 'canvas' || activeTabId === 'route-canvas' || activeTabId === 'punchlist') return;

    const activeTab = openTabs.find(t => t.id === activeTabId);
    let filePathToSync: string | undefined;

    if (activeTab) {
        if (activeTab.type === 'editor' && activeTab.blockId) {
            const block = blocks.find(b => b.id === activeTab.blockId);
            filePathToSync = block?.filePath;
        } else if (activeTab.type === 'image' || activeTab.type === 'audio') {
            filePathToSync = activeTab.filePath;
        }
    }

    if (filePathToSync) {
        // 1. Select the file
        setExplorerSelectedPaths(new Set([filePathToSync]));
        setExplorerLastClickedPath(filePathToSync);

        // 2. Expand all parent folders
        const parts = filePathToSync.split('/');
        parts.pop(); // Remove filename
        
        setExplorerExpandedPaths(prev => {
            const newExpanded = new Set(prev);
            let currentPath = '';
            let changed = false;
            
            parts.forEach((part, index) => {
                currentPath += (index > 0 ? '/' : '') + part;
                if (!newExpanded.has(currentPath)) {
                    newExpanded.add(currentPath);
                    changed = true;
                }
            });
            
            return changed ? newExpanded : prev;
        });
    }
  }, [activeTabId, openTabs, blocks]);

  const handleToggleExpandExplorer = useCallback((path: string) => {
      setExplorerExpandedPaths(prev => {
          const newSet = new Set(prev);
          if (newSet.has(path)) newSet.delete(path);
          else newSet.add(path);
          return newSet;
      });
  }, []);


  // --- Initial Load of App Settings & Theme Management ---
  useEffect(() => {
    // Load app-level settings from Electron main process or fallback to localStorage
    if (window.electronAPI?.getAppSettings) {
      window.electronAPI.getAppSettings().then(savedSettings => {
        if (savedSettings) {
          updateAppSettings(draft => { 
              Object.assign(draft, savedSettings);
              if (!draft.editorFontFamily) draft.editorFontFamily = "'Consolas', 'Courier New', monospace";
              if (!draft.editorFontSize) draft.editorFontSize = 14;
          });
        }
      }).finally(() => {
        setAppSettingsLoaded(true);
      });
    } else { // Browser fallback
      const savedSettings = localStorage.getItem('renpy-ide-app-settings');
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings);
          updateAppSettings(draft => { 
              Object.assign(draft, parsed);
              if (!draft.editorFontFamily) draft.editorFontFamily = "'Consolas', 'Courier New', monospace";
              if (!draft.editorFontSize) draft.editorFontSize = 14;
          });
        } catch (e) { console.error("Failed to load app settings from localStorage", e); }
      }
      setAppSettingsLoaded(true);
    }
  }, [updateAppSettings]);

  useEffect(() => {
    if (!appSettingsLoaded) return;

    if (window.electronAPI?.saveAppSettings) {
      window.electronAPI.saveAppSettings(appSettings)
        .then(result => {
            if (!result || !result.success) {
                console.error('Failed to save app settings:', result?.error);
            }
        });
    } else {
      localStorage.setItem('renpy-ide-app-settings', JSON.stringify(appSettings));
    }
    
    const root = window.document.documentElement;
    const applyTheme = (theme: Theme) => {
      root.classList.remove(
          'dark', 
          'theme-solarized-light', 
          'theme-solarized-dark', 
          'theme-colorful', 
          'theme-colorful-light',
          'theme-neon-dark', 
          'theme-ocean-dark', 
          'theme-candy-light', 
          'theme-forest-light'
      );
      
      if (theme === 'dark') root.classList.add('dark');
      if (theme === 'solarized-light') root.classList.add('theme-solarized-light');
      if (theme === 'solarized-dark') root.classList.add('dark', 'theme-solarized-dark');
      if (theme === 'colorful') root.classList.add('dark', 'theme-colorful');
      if (theme === 'colorful-light') root.classList.add('theme-colorful-light');
      
      // New Themes
      if (theme === 'neon-dark') root.classList.add('dark', 'theme-neon-dark');
      if (theme === 'ocean-dark') root.classList.add('dark', 'theme-ocean-dark');
      if (theme === 'candy-light') root.classList.add('theme-candy-light');
      if (theme === 'forest-light') root.classList.add('theme-forest-light');
    };

    if (appSettings.theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      applyTheme(systemTheme);
    } else {
      applyTheme(appSettings.theme);
    }
  }, [appSettings, appSettingsLoaded]);

  // --- Check Ren'Py Path Validity ---
  useEffect(() => {
    if (window.electronAPI?.checkRenpyPath && appSettings.renpyPath) {
      window.electronAPI.checkRenpyPath(appSettings.renpyPath).then(setIsRenpyPathValid);
    } else {
      setIsRenpyPathValid(false);
    }
  }, [appSettings.renpyPath]);

  // --- Toast Helper ---
  const addToast = useCallback((message: string, type: ToastMessage['type'] = 'info') => {
    const id = Math.random().toString(36).substring(7);
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // --- Block Management ---
  const updateBlock = useCallback((id: string, data: Partial<Block>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...data } : b));
    if (data.content !== undefined) {
      setDirtyBlockIds(prev => new Set(prev).add(id));
    }
  }, [setBlocks]);

  const updateGroup = useCallback((id: string, data: Partial<BlockGroup>) => {
    setGroups(draft => {
      const idx = draft.findIndex(g => g.id === id);
      if (idx !== -1) Object.assign(draft[idx], data);
    });
  }, [setGroups]);

  const updateBlockPositions = useCallback((updates: { id: string, position: Position }[]) => {
    setBlocks(prev => {
        const next = [...prev];
        updates.forEach(u => {
            const idx = next.findIndex(b => b.id === u.id);
            if (idx !== -1) next[idx] = { ...next[idx], position: u.position };
        });
        return next;
    });
  }, [setBlocks]);

   const updateGroupPositions = useCallback((updates: { id: string, position: Position }[]) => {
    setGroups(draft => {
      updates.forEach(u => {
        const g = draft.find(g => g.id === u.id);
        if (g) g.position = u.position;
      });
    });
  }, [setGroups]);


  const addBlock = useCallback((filePath: string, content: string, initialPosition?: Position) => {
    const id = `block-${Date.now()}`;
    const blockWidth = 320;
    const blockHeight = 200;

    let position: Position;

    if (initialPosition) {
        position = initialPosition;
    } else {
        const leftOffset = appSettings.isLeftSidebarOpen ? appSettings.leftSidebarWidth : 0;
        const rightOffset = appSettings.isRightSidebarOpen ? appSettings.rightSidebarWidth : 0;
        const topOffset = 64; // h-16 (header)

        const visibleWidth = window.innerWidth - leftOffset - rightOffset;
        const visibleHeight = window.innerHeight - topOffset;

        const screenCenterX = leftOffset + (visibleWidth / 2);
        const screenCenterY = topOffset + (visibleHeight / 2);

        const worldCenterX = (screenCenterX - storyCanvasTransform.x) / storyCanvasTransform.scale;
        const worldCenterY = (screenCenterY - storyCanvasTransform.y) / storyCanvasTransform.scale;

        position = {
            x: worldCenterX - (blockWidth / 2),
            y: worldCenterY - (blockHeight / 2)
        };
    }

    const newBlock: Block = {
      id,
      content,
      position,
      width: blockWidth,
      height: blockHeight,
      title: filePath.split('/').pop(),
      filePath
    };
    
    setBlocks(prev => [...prev, newBlock]);
    setDirtyBlockIds(prev => new Set(prev).add(id));
    
    setSelectedBlockIds([id]);
    setFlashBlockRequest({ blockId: id, key: Date.now() });

    if (fileSystemTree && filePath) {
        setFileSystemTree(prev => {
            if (!prev) return null;
            return prev;
        });
    }
    return id;
  }, [setBlocks, fileSystemTree, storyCanvasTransform, appSettings]);

  const handleCreateBlockConfirm = async (name: string, type: BlockType, folderPath: string) => {
    let content = '';
    const safeName = name.replace(/\.rpy$/, '');
    const fileName = `${safeName}.rpy`;
    
    switch (type) {
        case 'story':
            content = `label ${safeName}:\n    "Start writing your story here..."\n    return\n`;
            break;
        case 'screen':
            content = `screen ${safeName}():\n    zorder 100\n    frame:\n        align (0.5, 0.5)\n        text "New Screen"\n`;
            break;
        case 'config':
            content = `# Configuration for ${safeName}\ndefine ${safeName}_enabled = True\n`;
            break;
    }

    if (window.electronAPI && projectRootPath) {
        try {
            const cleanFolderPath = folderPath.endsWith('/') ? folderPath.slice(0, -1) : folderPath;
            const relativePath = cleanFolderPath ? `${cleanFolderPath}/${fileName}` : fileName;
            const fullPath = await window.electronAPI.path.join(projectRootPath!, cleanFolderPath, fileName) as string;
            
            const res = await window.electronAPI.writeFile(fullPath, content);
            if (res.success) {
                const id = addBlock(relativePath, content);
                addToast(`Created ${fileName} in ${cleanFolderPath || 'root'}`, 'success');
                const projData = await window.electronAPI.loadProject(projectRootPath!);
                setFileSystemTree(projData.tree);
            } else {
                const errorMsg = typeof res.error === 'string' ? res.error : 'Unknown error occurred during file creation';
                throw new Error(errorMsg);
            }
        } catch (e: any) {
            console.error(e);
            const errorMessage = e instanceof Error ? e.message : String(e);
            addToast(`Failed to create file: ${errorMessage}`, 'error');
        }
    } else {
        addBlock(fileName, content);
        addToast(`Created block ${fileName}`, 'success');
    }
  };

  const handleCreateBlockFromCanvas = useCallback(async (type: BlockType, position: Position) => {
      const timestamp = Date.now();
      const defaultName = `${type}_${timestamp}`;
      const fileName = `${defaultName}.rpy`;
      
      let content = '';
      switch (type) {
        case 'story':
            content = `label ${defaultName}:\n    "Start writing your story here..."\n    return\n`;
            break;
        case 'screen':
            content = `screen ${defaultName}():\n    zorder 100\n    frame:\n        align (0.5, 0.5)\n        text "New Screen"\n`;
            break;
        case 'config':
            content = `# Configuration for ${defaultName}\ndefine ${defaultName}_enabled = True\n`;
            break;
      }

      if (window.electronAPI && projectRootPath) {
          try {
              const folderPath = 'game';
              const fullPath = await window.electronAPI.path.join(projectRootPath!, folderPath, fileName) as string;
              const relativePath = `game/${fileName}`;
              
              const res = await window.electronAPI.writeFile(fullPath, content);
              if (res.success) {
                  addBlock(relativePath, content, position);
                  addToast(`Created ${fileName}`, 'success');
                  const projData = await window.electronAPI.loadProject(projectRootPath);
                  setFileSystemTree(projData.tree);
              } else {
                  const errorMsg = typeof res.error === 'string' ? res.error : 'Unknown error occurred during file creation';
                  throw new Error(errorMsg);
              }
          } catch(e: any) {
              console.error(e);
              const errorMessage = e instanceof Error ? e.message : String(e);
              addToast(`Failed to create file: ${errorMessage}`, 'error');
          }
      } else {
          addBlock(fileName, content, position);
          addToast(`Created block ${fileName}`, 'success');
      }
  }, [addBlock, projectRootPath, addToast]);

  // --- Sticky Note Management ---
  const addStickyNote = useCallback((initialPosition?: Position) => {
      const id = `note-${Date.now()}`;
      const width = 200;
      const height = 200;

      let position: Position;
      if (initialPosition) {
          position = initialPosition;
          // Center the note on the click position
          position.x -= width / 2;
          position.y -= height / 2;
      } else {
          const leftOffset = appSettings.isLeftSidebarOpen ? appSettings.leftSidebarWidth : 0;
          const rightOffset = appSettings.isRightSidebarOpen ? appSettings.rightSidebarWidth : 0;
          const topOffset = 64; 

          const visibleWidth = window.innerWidth - leftOffset - rightOffset;
          const visibleHeight = window.innerHeight - topOffset;

          const screenCenterX = leftOffset + (visibleWidth / 2);
          const screenCenterY = topOffset + (visibleHeight / 2);

          const worldCenterX = (screenCenterX - storyCanvasTransform.x) / storyCanvasTransform.scale;
          const worldCenterY = (screenCenterY - storyCanvasTransform.y) / storyCanvasTransform.scale;

          position = {
              x: worldCenterX - (width / 2),
              y: worldCenterY - (height / 2)
          };
      }

      const newNote: StickyNote = {
          id,
          content: '',
          position,
          width,
          height,
          color: 'yellow'
      };

      setStickyNotes(draft => {
          draft.push(newNote);
      });
      setHasUnsavedSettings(true);
  }, [appSettings, storyCanvasTransform, setStickyNotes]);

  const updateStickyNote = useCallback((id: string, data: Partial<StickyNote>) => {
      setStickyNotes(draft => {
          const idx = draft.findIndex(n => n.id === id);
          if (idx !== -1) Object.assign(draft[idx], data);
      });
      setHasUnsavedSettings(true);
  }, [setStickyNotes]);

  const deleteStickyNote = useCallback((id: string) => {
      setStickyNotes(draft => {
          const idx = draft.findIndex(n => n.id === id);
          if (idx !== -1) draft.splice(idx, 1);
      });
      setHasUnsavedSettings(true);
  }, [setStickyNotes]);


  const getSelectedFolderForNewBlock = useCallback(() => {
    if (explorerSelectedPaths.size === 1) {
        const selectedPath = Array.from(explorerSelectedPaths)[0];
        if (!fileSystemTree) return 'game/';
        const findNode = (node: FileSystemTreeNode, targetPath: string): FileSystemTreeNode | null => {
            if (node.path === targetPath) return node;
            if (node.children) {
                for (const child of node.children) {
                    const found = findNode(child, targetPath);
                    if (found) return found;
                }
            }
            return null;
        };
        const node = findNode(fileSystemTree, selectedPath);
        if (node) {
            if (node.children) {
                return node.path ? (node.path.endsWith('/') ? node.path : node.path + '/') : ''; 
            } else {
                const parts = node.path.split('/');
                parts.pop();
                return parts.length > 0 ? parts.join('/') + '/' : '';
            }
        }
    }
    return 'game/';
  }, [explorerSelectedPaths, fileSystemTree]);

  const deleteBlock = useCallback((id: string) => {
    setGroups(draft => {
        draft.forEach(g => {
            g.blockIds = g.blockIds.filter(bid => bid !== id);
        });
    });
    
    setBlocks(prev => prev.filter(b => b.id !== id));
    setOpenTabs(prev => prev.filter(t => t.blockId !== id));
    if (activeTabId === id) setActiveTabId('canvas');
  }, [setBlocks, setGroups, activeTabId]);

  // --- Layout ---
  const handleTidyUp = useCallback((showToast = true) => {
    setStatusBarMessage('Organizing layout...');
    // Use setTimeout to allow the UI to update with the status message before the heavy calculation
    setTimeout(() => {
        try {
            const links = analysisResult.links;
            const newLayout = computeAutoLayout(blocks, links);
            setBlocks(newLayout);
            if (showToast) {
                addToast('Layout organized', 'success');
            }
            setStatusBarMessage('Layout organized.');
            setTimeout(() => setStatusBarMessage(''), 2000);
        } catch (e) {
            console.error("Failed to tidy up layout:", e);
            if (showToast) {
                addToast('Failed to organize layout', 'error');
            }
            setStatusBarMessage('Error organizing layout.');
        }
    }, 10);
  }, [blocks, analysisResult, setBlocks, addToast]);

  useEffect(() => {
    if (initialLayoutNeeded.current && blocks.length > 0 && analysisResult) {
        initialLayoutNeeded.current = false; 
        setTimeout(() => handleTidyUp(false), 100);
    }
  }, [blocks, analysisResult, handleTidyUp]);

  // --- Tab Management Helpers ---
  const handleOpenStaticTab = useCallback((type: 'canvas' | 'route-canvas' | 'punchlist' | 'ai-generator' | 'stats') => {
        const id = type;
        // If already open in primary, activate it there
        if (openTabs.find(t => t.id === id)) {
            setActiveTabId(id);
            setActivePaneId('primary');
            return;
        }
        // If already open in secondary, activate it there
        if (secondaryOpenTabs.find(t => t.id === id)) {
            setSecondaryActiveTabId(id);
            setActivePaneId('secondary');
            return;
        }
        // Open in active pane
        if (activePaneId === 'secondary' && splitLayout !== 'none') {
            setSecondaryOpenTabs(prev => [...prev, { id, type }]);
            setSecondaryActiveTabId(id);
        } else {
            setOpenTabs(prev => [...prev, { id, type }]);
            setActiveTabId(id);
        }
  }, [openTabs, secondaryOpenTabs, activePaneId, splitLayout]);

  // --- File System Integration ---
  
  const loadProject = useCallback(async (path: string) => {
      loadCancelRef.current = false;
      setIsLoading(true);
      setLoadingMessage('Reading project files...');
      setStatusBarMessage(`Loading project from ${path}...`);
      try {
          const projectData = await window.electronAPI!.loadProject(path);

          // If the user cancelled while the directory was being read, discard results.
          if (loadCancelRef.current) {
              setStatusBarMessage('');
              return;
          }
          
          // Map existing blocks to preserve IDs and positions
          const existingBlocksMap = new Map<string, Block>();
          // Use ref to get current blocks to avoid stale closures and infinite loop dependency
          blocksRef.current.forEach(b => {
              if (b.filePath) existingBlocksMap.set(b.filePath, b);
          });

          const loadedBlocks: Block[] = projectData.files.map((f: any, index: number) => {
              const existing = existingBlocksMap.get(f.path);
              return {
                  id: existing ? existing.id : `block-${index}-${Date.now()}`,
                  content: f.content,
                  filePath: f.path,
                  position: existing ? existing.position : { x: (index % 5) * 350, y: Math.floor(index / 5) * 250 },
                  width: existing ? existing.width : 320,
                  height: existing ? existing.height : 200,
                  title: f.path.split('/').pop(),
                  color: existing ? existing.color : undefined
              };
          });
          const blockFilePathMap = new Map(loadedBlocks.map(b => [b.filePath, b]));

          if (loadedBlocks.length === 0) {
             const defaultBlock = {
                 id: `block-${Date.now()}`,
                 content: `label start:\n    "Welcome to your new project!"\n    return\n`,
                 filePath: `script.rpy`,
                 position: { x: 50, y: 50 },
                 width: 320, height: 200, title: 'script.rpy'
             };
             loadedBlocks.push(defaultBlock);
             if (window.electronAPI?.writeFile) {
                 const scriptPath = await window.electronAPI.path.join(projectData.rootPath as string, 'script.rpy') as string;
                 await window.electronAPI.writeFile(scriptPath, defaultBlock.content);
                 if (projectData.tree) {
                     projectData.tree.children = [...(projectData.tree.children || []), { name: 'script.rpy', path: 'script.rpy' }];
                 }
             }
          }

          setProjectRootPath(projectData.rootPath);
          
          // Update Recent Projects
          updateAppSettings(draft => {
              // Remove if exists to move to top
              const filtered = draft.recentProjects.filter(p => p !== projectData.rootPath);
              draft.recentProjects = [projectData.rootPath, ...filtered].slice(0, 25);
          });

          setBlocks(loadedBlocks);
          // Only trigger layout if this is a fresh load (no existing blocks)
          if (blocksRef.current.length === 0) {
              initialLayoutNeeded.current = true;
          }
          setFileSystemTree(projectData.tree);
          
          const imgMap = new Map<string, ProjectImage>();
          projectData.images.forEach((img: any) => {
              imgMap.set(img.path, { 
                  ...img, 
                  filePath: img.path,
                  fileName: img.path.split('/').pop(), 
                  isInProject: true, 
                  fileHandle: null 
              });
          });
          setImages(imgMap);

          const audioMap = new Map<string, RenpyAudio>();
          projectData.audios.forEach((aud: any) => {
              audioMap.set(aud.path, { 
                  ...aud, 
                  filePath: aud.path,
                  fileName: aud.path.split('/').pop(), 
                  isInProject: true, 
                  fileHandle: null 
              });
          });
          setAudios(audioMap);

          if (projectData.settings) {
              updateProjectSettings(draft => {
                  draft.enableAiFeatures = projectData.settings.enableAiFeatures ?? false;
                  draft.selectedModel = projectData.settings.selectedModel ?? 'gemini-2.5-flash';
                  draft.draftingMode = projectData.settings.draftingMode ?? false;
              });
              setStickyNotes(projectData.settings.stickyNotes || []);
              setCharacterProfiles(projectData.settings.characterProfiles || {});
              setPunchlistMetadata(projectData.settings.punchlistMetadata || {});
              
              // Load Scene Compositions
              // Helper to link saved paths back to loaded image objects
              const rehydrateSprite = (s: any) => {
                  const path = s.image.filePath;
                  // Try to find the image in the project images map
                  // If not found (e.g. was external), create a placeholder. 
                  const img = imgMap.get(path) || { 
                      filePath: path, 
                      fileName: path.split(/[/\\]/).pop() || 'unknown', 
                      isInProject: false, 
                      fileHandle: null,
                      dataUrl: '' 
                  };
                  return { ...s, image: img };
              };

              const rehydrateScene = (sc: any) => ({
                  background: sc.background ? rehydrateSprite(sc.background) : null,
                  sprites: (sc.sprites || []).map(rehydrateSprite)
              });

              if (projectData.settings.sceneCompositions) {
                  const restoredScenes: Record<string, SceneComposition> = {};
                  Object.entries(projectData.settings.sceneCompositions as Record<string, any>).forEach(([id, sc]) => {
                      const comp = sc as SceneComposition;
                      restoredScenes[id] = {
                          background: comp.background ? rehydrateSprite(comp.background) : null,
                          sprites: comp.sprites.map(rehydrateSprite)
                      };
                  });
                  setSceneCompositions(restoredScenes);
                  setSceneNames(projectData.settings.sceneNames || {});
              } else if (projectData.settings.sceneComposition) {
                  // Migration for legacy single scene
                  const defaultId = 'scene-default';
                  setSceneCompositions({ [defaultId]: rehydrateScene(projectData.settings.sceneComposition) });
                  setSceneNames({ [defaultId]: 'Default Scene' });
              } else {
                  setSceneCompositions({});
                  setSceneNames({});
              }

              // Restore Scan Directories
              if (projectData.settings.scannedImagePaths) {
                  const paths = (projectData.settings.scannedImagePaths || []) as string[];
                  const map = new Map<string, FileSystemDirectoryHandle>();
                  paths.forEach((p: string) => map.set(p, {} as any));
                  setImageScanDirectories(map);
                  
                  // Trigger scan
                  if (window.electronAPI) {
                       paths.forEach((dirPath: string) => {
                           window.electronAPI!.scanDirectory(dirPath).then(({ images: scanned }) => {
                               setImages(prev => {
                                   const next = new Map(prev);
                                   scanned.forEach((img: any) => {
                                       if (!next.has(img.path)) {
                                           // Check if this file exists in the project
                                           const fileName = img.path.split('/').pop();
                                           const potentialProjectPath = `game/images/${fileName}`;
                                           const linkedPath = next.has(potentialProjectPath) ? potentialProjectPath : undefined;

                                           // Ensure external images also have filePath set correctly
                                           next.set(img.path, { 
                                             ...img, 
                                             filePath: img.path, 
                                             isInProject: false, 
                                             fileHandle: null,
                                             projectFilePath: linkedPath 
                                           });
                                       }
                                   });
                                   return next;
                               });
                           });
                       });
                  }
              }
              
              if (projectData.settings.scannedAudioPaths) {
                  const paths = (projectData.settings.scannedAudioPaths || []) as string[];
                  const map = new Map<string, FileSystemDirectoryHandle>();
                  paths.forEach((p: string) => map.set(p, {} as any));
                  setAudioScanDirectories(map);

                  // Trigger scan
                  if (window.electronAPI) {
                       paths.forEach((dirPath: string) => {
                           window.electronAPI!.scanDirectory(dirPath).then(({ audios: scanned }) => {
                               setAudios(prev => {
                                   const next = new Map(prev);
                                   scanned.forEach((aud: any) => {
                                       if (!next.has(aud.path)) {
                                           // Check if this file exists in the project
                                           const fileName = aud.path.split('/').pop();
                                           const potentialProjectPath = `game/audio/${fileName}`;
                                           const linkedPath = next.has(potentialProjectPath) ? potentialProjectPath : undefined;

                                           // Ensure external audio also have filePath set correctly
                                           next.set(aud.path, { 
                                             ...aud, 
                                             filePath: aud.path, 
                                             isInProject: false, 
                                             fileHandle: null, 
                                             projectFilePath: linkedPath
                                           });
                                       }
                                   });
                                   return next;
                               });
                           });
                       });
                  }
              }

              const savedTabs: EditorTab[] = projectData.settings.openTabs ?? [{ id: 'canvas', type: 'canvas' }];
              const tempAnalysis = performRenpyAnalysis(loadedBlocks);

              const validTabs = savedTabs.filter(tab => {
                  if (tab.type === 'editor' && tab.filePath) {
                      return blockFilePathMap.has(tab.filePath);
                  }
                  if (tab.type === 'image' && tab.filePath) {
                      return imgMap.has(tab.filePath);
                  }
                  if (tab.type === 'audio' && tab.filePath) {
                      return audioMap.has(tab.filePath);
                  }
                  if (tab.type === 'character' && tab.characterTag) {
                      return tempAnalysis.characters.has(tab.characterTag);
                  }
                  if (tab.type === 'scene-composer' && tab.sceneId) {
                      // We allow opening even if not strictly in state yet (might be migrated)
                      return true;
                  }
                  return tab.type === 'canvas' || tab.type === 'route-canvas' || tab.type === 'punchlist' || tab.type === 'ai-generator' || tab.type === 'stats';
              });

              const rehydratedTabs = validTabs.map(tab => {
                  if (tab.type === 'editor' && tab.filePath) {
                      const matchingBlock = blockFilePathMap.get(tab.filePath);
                      if (matchingBlock) {
                          return { ...tab, id: matchingBlock.id, blockId: matchingBlock.id };
                      }
                  }
                  // Migrate old single scene tab
                  if (tab.type === 'scene-composer' && !tab.sceneId) {
                      return { ...tab, sceneId: 'scene-default' };
                  }
                  return tab;
              });

              setOpenTabs(rehydratedTabs);

              const activeTabIsValid = rehydratedTabs.some(t => t.id === projectData.settings.activeTabId);
              setActiveTabId(activeTabIsValid ? projectData.settings.activeTabId : 'canvas');

              // Restore split state
              const savedSplitLayout = projectData.settings.splitLayout ?? 'none';
              const savedSecondary: EditorTab[] = projectData.settings.secondaryOpenTabs ?? [];
              const validSecondary = savedSecondary.filter((tab: EditorTab) => {
                  if (tab.type === 'editor' && tab.filePath) return blockFilePathMap.has(tab.filePath);
                  if (tab.type === 'image' && tab.filePath) return imgMap.has(tab.filePath);
                  if (tab.type === 'audio' && tab.filePath) return audioMap.has(tab.filePath);
                  if (tab.type === 'character' && tab.characterTag) return tempAnalysis.characters.has(tab.characterTag);
                  return tab.type === 'canvas' || tab.type === 'route-canvas' || tab.type === 'punchlist' || tab.type === 'ai-generator' || tab.type === 'stats' || tab.type === 'scene-composer';
              });
              setSplitLayout(validSecondary.length > 0 ? savedSplitLayout : 'none');
              setSplitPrimarySize(projectData.settings.splitPrimarySize ?? 600);
              setSecondaryOpenTabs(validSecondary);
              const savedSecondaryActive = projectData.settings.secondaryActiveTabId ?? '';
              setSecondaryActiveTabId(validSecondary.some((t: EditorTab) => t.id === savedSecondaryActive) ? savedSecondaryActive : validSecondary[0]?.id ?? '');

          } else {
              updateProjectSettings(draft => {
                  draft.enableAiFeatures = false;
                  draft.selectedModel = 'gemini-2.5-flash';
                  draft.draftingMode = false;
              });
              setOpenTabs([{ id: 'canvas', type: 'canvas' }]);
              setActiveTabId('canvas');
              setSplitLayout('none');
              setSecondaryOpenTabs([]);
              setSecondaryActiveTabId('');
              setStickyNotes([]);
              setCharacterProfiles({});
              setPunchlistMetadata({});
              setSceneCompositions({});
              setSceneNames({});
          }
          
          setHasUnsavedSettings(false);
          setShowWelcome(false);
          addToast('Project loaded successfully', 'success');
          setStatusBarMessage('Project loaded.');
          setTimeout(() => setStatusBarMessage(''), 3000);
      } catch (err) {
          if (loadCancelRef.current) {
              setStatusBarMessage('');
              return;
          }
          console.error(err);
          addToast('Failed to load project', 'error');
          setStatusBarMessage('Error loading project.');
      } finally {
          setIsLoading(false);
          setLoadingMessage('');
          setLoadingProgress(0);
      }
  }, [setBlocks, setImages, setAudios, updateProjectSettings, addToast, setFileSystemTree, setStickyNotes, setCharacterProfiles, updateAppSettings, setSceneCompositions, setSceneNames, setPunchlistMetadata]);


  const handleCancelLoad = useCallback(() => {
      loadCancelRef.current = true;
      // Terminate the worker thread in the main process immediately.
      // The overlay stays visible in its "Cancelling..." state (local state in LoadingOverlay)
      // until the worker exits and the finally block in loadProject sets isLoading = false.
      // We deliberately do NOT call setIsLoading(false) here — doing so with flushSync caused
      // a blocking synchronous render that prevented Electron's IPC quit handshake from
      // being processed, making File->Quit appear broken for several seconds after cancel.
      window.electronAPI?.cancelProjectLoad?.();
      addToast('Project loading cancelled.', 'info');
  }, [addToast]);

  // Checks whether the selected folder looks like a Ren'Py project before loading.
  // If it doesn't (no game/ folder, no .rpy files), shows a confirmation warning first.
  const handleOpenWithRenpyCheck = useCallback(async (path: string) => {
      if (window.electronAPI?.checkRenpyProject) {
          const check = await window.electronAPI.checkRenpyProject(path);
          if (!check.isRenpyProject) {
              setNonRenpyWarningPath(path);
              return;
          }
      }
      await loadProject(path);
  }, [loadProject]);

  const handleOpenProjectFolder = useCallback(async () => {
    try {
        if (window.electronAPI) {
            const path = await window.electronAPI.openDirectory();
            if (path) {
                await handleOpenWithRenpyCheck(path);
            }
        } else {
            alert("To use local file system features, please run this app in Electron or use a compatible browser with FS Access API support (Chrome/Edge). For now, you are in Browser Mode.");
        }
    } catch (err) {
        console.error(err);
        addToast('Failed to open project', 'error');
    }
  }, [handleOpenWithRenpyCheck, addToast]);

  const handleCreateProject = useCallback(async () => {
      try {
          if (window.electronAPI?.createProject) {
              const path = await window.electronAPI.createProject();
              if (path) {
                  await loadProject(path);
              }
          } else {
              alert("Project creation is only supported in the Electron app.");
          }
      } catch (err) {
          console.error(err);
          addToast('Failed to create project', 'error');
      }
  }, [loadProject, addToast]);

  // --- Drafting Mode Logic ---
  const updateDraftingArtifacts = useCallback(async () => {
      if (!projectRootPath || !window.electronAPI || !projectSettings.draftingMode) return;

      const missingImages = new Set<string>();
      const missingAudioFiles = new Set<string>();
      const missingAudioVariables = new Set<string>();

      // 1. Scan Blocks for missing references
      blocks.forEach(block => {
          // Do not parse the placeholder file itself
          if (block.filePath && (block.filePath.endsWith('debug_placeholders.rpy') || block.filePath === 'game/debug_placeholders.rpy')) return;

          const lines = block.content.split('\n');
          lines.forEach(line => {
              const trimmed = line.trim();
              if (trimmed.startsWith('#')) return;

              // Images: show/scene <tag>
              const showMatch = trimmed.match(/^\s*(?:show|scene)\s+(.+)/);
              if (showMatch) {
                  const rest = showMatch[1];
                  const parts = rest.split(/\s+/);
                  
                  if (parts[0] !== 'expression') {
                      const tagParts: string[] = [];
                      for (const part of parts) {
                          if (['with', 'at', 'as', 'behind', 'zorder', 'on', ':', 'fade', 'in', 'out', 'dissolve', 'zoom', 'alpha', 'rotate', 'align', 'pos', 'anchor', 'xpos', 'ypos', 'xanchor', 'yanchor'].includes(part)) break;
                          if (part.endsWith(':')) {
                              tagParts.push(part.slice(0, -1));
                              break;
                          }
                          tagParts.push(part);
                      }
                      
                      if (tagParts.length > 0) {
                          const tag = tagParts.join(' ');
                          const firstWord = tagParts[0];
                          
                          const isDefined = 
                              analysisResult.definedImages.has(firstWord) || 
                              existingImageTags.has(tag) || 
                              existingImageTags.has(firstWord);

                          if (!isDefined) missingImages.add(tag);
                      }
                  }
              }

              // Audio: play/queue <channel> <file>
              const audioLineRegex = /^\s*(?:play|queue)\s+\w+\s+(.+)/;
              const audMatch = trimmed.match(audioLineRegex);
              
              if (audMatch) {
                  const content = audMatch[1].trim();
                  
                  // Case A: Quoted string -> explicit file path
                  const quotedMatch = content.match(/^["']([^"']+)["']/);
                  if (quotedMatch) {
                      const path = quotedMatch[1];
                      let found = false;
                      if (existingAudioPaths.has(path)) found = true;
                      else {
                          // Check fuzzy match against known audio
                          for (const existing of existingAudioPaths) {
                              if (existing.endsWith(path)) { found = true; break; }
                          }
                      }
                      if (!found) missingAudioFiles.add(path);
                  } 
                  // Case B: Unquoted -> variable or identifier
                  else {
                      // Grab the first token, stop before keywords like 'fadein', 'loop', etc.
                      const firstToken = content.split(/\s+/)[0];
                      
                      if (firstToken !== 'expression') {
                          // It's likely a variable. Check if it's a valid identifier.
                          if (/^[a-zA-Z0-9_]+$/.test(firstToken)) {
                              // If it's not defined in the project, mark as missing variable
                              let isDefined = false;
                              if (analysisResult.variables.has(firstToken)) isDefined = true;
                              // Also check if it happens to be an auto-defined audio file (Ren'Py does this for audio/ directory)
                              if (existingAudioPaths.has(firstToken)) isDefined = true;

                              if (!isDefined) {
                                  missingAudioVariables.add(firstToken);
                              }
                          }
                      }
                  }
              }
          });
      });

      // 2. Generate Content
      let rpyContent: string = `# Auto-generated by Ren'IDE Drafting Mode\n# This file provides placeholders for missing assets.\n\n`;
      
      missingImages.forEach(tag => {
          rpyContent += `image ${tag} = Placeholder("text", text="${tag}")\n`;
      });

      // Generate default variable definitions for missing audio variables
      missingAudioVariables.forEach(varName => {
          rpyContent += `default ${varName} = "renide_assets/placeholder_audio.wav"\n`;
      });

      // Ensure dummy audio file exists if we have ANY audio issues
      if (missingAudioFiles.size > 0 || missingAudioVariables.size > 0) {
          const audioDir = await window.electronAPI.path.join(projectRootPath, 'game/renide_assets');
          await window.electronAPI.createDirectory(audioDir);
          const audioPath = await window.electronAPI.path.join(audioDir, 'placeholder_audio.wav');
          await window.electronAPI.writeFile(audioPath, SILENT_WAV_BASE64, 'base64');

          // Injecting a callback to handle missing audio files (QUOTED STRINGS)
          // This callback intercepts file paths that Ren'Py fails to load.
          rpyContent += `\ninit python:\n`;
          rpyContent += `    if not hasattr(store, 'renide_audio_callback_installed'):\n`;
          rpyContent += `        store.renide_audio_callback_installed = True\n`;
          rpyContent += `        def renide_audio_filter(fn):\n`;
          rpyContent += `            if fn and renpy.loadable(fn):\n`;
          rpyContent += `                return fn\n`;
          rpyContent += `            # If missing, return placeholder\n`;
          rpyContent += `            return "renide_assets/placeholder_audio.wav"\n`;
          rpyContent += `        config.audio_filename_callback = renide_audio_filter\n`;
      }

      // 3. Write File
      const rpyPath = await window.electronAPI.path.join(projectRootPath as string, 'game/debug_placeholders.rpy');
      await window.electronAPI.writeFile(rpyPath, rpyContent);

  }, [blocks, projectRootPath, projectSettings.draftingMode, analysisResult.definedImages, analysisResult.variables, existingImageTags, existingAudioPaths]);

  const cleanupDraftingArtifacts = useCallback(async () => {
      if (!projectRootPath || !window.electronAPI) return;
      
      const rpyPath = await window.electronAPI.path.join(String(projectRootPath), 'game/debug_placeholders.rpy') as string;
      // We can remove it or rename to .disabled
      await window.electronAPI.removeEntry(rpyPath);

      // Also remove the compiled .rpyc file to ensure Ren'Py stops using placeholders
      const rpycPath = await window.electronAPI.path.join(String(projectRootPath), 'game/debug_placeholders.rpyc') as string;
      await window.electronAPI.removeEntry(rpycPath);
      
      // We leave the renide_assets folder as it might contain valid cache or be reused
  }, [projectRootPath]);

  const handleToggleDraftingMode = async (enabled: boolean) => {
      updateProjectSettings(draft => { draft.draftingMode = enabled; });
      setHasUnsavedSettings(true); // Persist this choice
      
      if (enabled) {
          addToast('Drafting Mode Enabled: Placeholders will be generated.', 'info');
      } else {
          addToast('Drafting Mode Disabled: Placeholders removed.', 'info');
          await cleanupDraftingArtifacts();
      }
  };

  // React to Drafting Mode changes or Block saves to update placeholders
  useEffect(() => {
      if (projectSettings.draftingMode) {
          updateDraftingArtifacts();
      }
  }, [projectSettings.draftingMode, blocks, updateDraftingArtifacts]);

  const syncEditorToStateAndMarkDirty = useCallback((blockId: string, content: string) => {
    // Update block content in React state
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, content } : b));
    
    // The editor is gone, so remove it from dirtyEditors...
    setDirtyEditors(prev => {
        const next = new Set(prev);
        next.delete(blockId);
        return next;
    });
    // ...but add it to dirtyBlockIds because it's still not saved to disk.
    setDirtyBlockIds(prev => new Set(prev).add(blockId));
  }, [setBlocks]);

  const handleSaveBlock = useCallback(async (blockId: string) => {
    const editor = editorInstances.current.get(blockId);
    if (!editor) return;

    const contentToSave = editor.getValue();
    
    // Save to disk first
    if (window.electronAPI && projectRootPath) {
        const block = blocksRef.current.find(b => b.id === blockId);
        if (block && block.filePath) {
             const absPath = await window.electronAPI.path.join(projectRootPath, block.filePath) as string;
             const res = await window.electronAPI.writeFile(absPath, contentToSave);
             if (res.success) {
                 addToast(`Saved ${block.title || 'file'}`, 'success');
             } else {
                 addToast(`Failed to save: ${String(res.error)}`, 'error');
                 return; // Abort if saving failed
             }
        }
    }

    // After successful save, update state and clear dirty flags.
    // This ensures React state matches the saved state on disk.
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, content: contentToSave } : b));
    
    // Clear ALL dirty flags for this block.
    setDirtyBlockIds(prev => {
        const next = new Set(prev);
        next.delete(blockId);
        return next;
    });
    setDirtyEditors(prev => {
        const next = new Set(prev);
        next.delete(blockId);
        return next;
    });

    if (projectSettings.draftingMode) {
        updateDraftingArtifacts();
    }

  }, [projectRootPath, projectSettings.draftingMode, addToast, setBlocks, updateDraftingArtifacts]);
  
  const handleSaveProjectSettings = useCallback(async () => {
    if (!projectRootPath || !window.electronAPI) return;
    try {
      // Serialize scenes: map images to just their paths to avoid circular refs and huge files
      const serializeSprite = (s: any) => ({
          ...s,
          image: { filePath: s.image.filePath }
      });

      const serializableScenes: Record<string, any> = {};
      Object.entries(sceneCompositions).forEach(([id, sc]) => {
          const comp = sc as SceneComposition;
          serializableScenes[id] = {
              background: comp.background ? serializeSprite(comp.background) : null,
              sprites: comp.sprites.map(serializeSprite)
          };
      });

      const settingsToSave: ProjectSettings = {
        ...projectSettings,
        openTabs,
        activeTabId,
        splitLayout,
        splitPrimarySize,
        secondaryOpenTabs,
        secondaryActiveTabId,
        stickyNotes: Array.from(stickyNotes),
        characterProfiles,
        punchlistMetadata,
        sceneCompositions: serializableScenes,
        sceneNames,
        scannedImagePaths: Array.from(imageScanDirectories.keys()),
        scannedAudioPaths: Array.from(audioScanDirectories.keys()),
      };
      const settingsPath = await window.electronAPI.path.join(projectRootPath as string, 'game/project.ide.json') as string;
      await window.electronAPI.writeFile(settingsPath, JSON.stringify(settingsToSave, null, 2));
      setHasUnsavedSettings(false);
    } catch (e) {
      console.error("Failed to save IDE settings:", e);
      addToast('Failed to save workspace settings', 'error');
    }
  }, [projectRootPath, projectSettings, openTabs, activeTabId, splitLayout, splitPrimarySize, secondaryOpenTabs, secondaryActiveTabId, stickyNotes, characterProfiles, addToast, sceneCompositions, sceneNames, imageScanDirectories, audioScanDirectories, punchlistMetadata]);


  const handleSaveAll = useCallback(async () => {
    setSaveStatus('saving');
    setStatusBarMessage('Saving files...');
    try {
        const currentBlocks = [...blocks];
        const editorUpdates = new Map<string, string>();

        for (const blockId of dirtyEditors) {
             const editor = editorInstances.current.get(blockId);
             if (editor) {
                 const content = editor.getValue();
                 editorUpdates.set(blockId, content);
                 const idx = currentBlocks.findIndex(b => b.id === blockId);
                 if (idx !== -1) {
                     currentBlocks[idx] = { ...currentBlocks[idx], content };
                 }
             }
        }

        if (editorUpdates.size > 0) {
            setBlocks(prev => prev.map(b => {
                if(editorUpdates.has(b.id)) {
                    return { ...b, content: editorUpdates.get(b.id)! };
                }
                return b;
            }));
        }

        const blocksToSave = new Set([...dirtyBlockIds, ...dirtyEditors]);

        if (!projectRootPath && !directoryHandle) {
             setDirtyBlockIds(new Set());
             setDirtyEditors(new Set());
             setHasUnsavedSettings(false);
             setSaveStatus('saved');
             addToast('Changes saved to memory', 'success');
             setStatusBarMessage('Saved to memory.');
             setTimeout(() => { setSaveStatus('saved'); setStatusBarMessage(''); }, 2000);
             return;
        }

        if (window.electronAPI) {
            for (const blockId of blocksToSave) {
                const block = currentBlocks.find(b => b.id === blockId);
                if (block && block.filePath) {
                    const absPath = await window.electronAPI.path.join(projectRootPath!, block.filePath) as string;
                    const res = await window.electronAPI.writeFile(absPath, block.content);
                    if (!res.success) throw new Error((res.error as string) || 'Unknown error saving file');
                }
            }
            // Update placeholders if needed on save all
            if (projectSettings.draftingMode) {
                // We need to wait for the block updates to settle, but we passed currentBlocks to save function.
                // updateDraftingArtifacts uses 'blocks' from scope, which might be stale inside this callback if not careful.
                // But the useEffect hook on blocks + draftingMode will catch the state update and run it.
            }
            await handleSaveProjectSettings();
        } 

        setDirtyBlockIds(new Set());
        setDirtyEditors(new Set());
        setSaveStatus('saved');
        addToast('All changes saved', 'success');
        setStatusBarMessage('All files saved.');
        setTimeout(() => { setSaveStatus('saved'); setStatusBarMessage(''); }, 2000);
    } catch (err) {
        console.error(err);
        setSaveStatus('error');
        addToast('Failed to save changes', 'error');
        setStatusBarMessage('Error saving files.');
    }
  }, [blocks, dirtyEditors, dirtyBlockIds, projectRootPath, directoryHandle, addToast, setBlocks, handleSaveProjectSettings, projectSettings.draftingMode]);
  
  const handleNewProjectRequest = useCallback(() => {
    const hasUnsaved = dirtyBlockIds.size > 0 || dirtyEditors.size > 0 || hasUnsavedSettings;
    
    if (hasUnsaved) {
      setUnsavedChangesModalInfo({
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Do you want to save them before creating a new project?',
        confirmText: 'Save & Create',
        dontSaveText: "Don't Save & Create",
        onConfirm: async () => {
          await handleSaveAll();
          handleCreateProject();
          setUnsavedChangesModalInfo(null);
        },
        onDontSave: () => {
          handleCreateProject();
          setUnsavedChangesModalInfo(null);
        },
        onCancel: () => {
          setUnsavedChangesModalInfo(null);
        }
      });
    } else {
      handleCreateProject();
    }
  }, [dirtyBlockIds, dirtyEditors, hasUnsavedSettings, handleCreateProject, handleSaveAll]);
  
  // --- Tab Management ---
  const handleOpenEditor = useCallback((blockId: string, line?: number) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    // If already in primary, activate there
    if (openTabs.find(t => t.id === blockId)) {
        if (line) setOpenTabs(prev => prev.map(t => t.id === blockId ? { ...t, scrollRequest: { line, key: Date.now() } } : t));
        setActiveTabId(blockId);
        setActivePaneId('primary');
        return;
    }
    // If already in secondary, activate there
    if (secondaryOpenTabs.find(t => t.id === blockId)) {
        if (line) setSecondaryOpenTabs(prev => prev.map(t => t.id === blockId ? { ...t, scrollRequest: { line, key: Date.now() } } : t));
        setSecondaryActiveTabId(blockId);
        setActivePaneId('secondary');
        return;
    }
    // Open in active pane
    const newTab: EditorTab = { id: blockId, type: 'editor', blockId, filePath: block.filePath, scrollRequest: line ? { line, key: Date.now() } : undefined };
    if (activePaneId === 'secondary' && splitLayout !== 'none') {
        setSecondaryOpenTabs(prev => [...prev, newTab]);
        setSecondaryActiveTabId(blockId);
    } else {
        setOpenTabs(prev => [...prev, newTab]);
        setActiveTabId(blockId);
    }
  }, [blocks, openTabs, secondaryOpenTabs, activePaneId, splitLayout]);

  const handleOpenImageEditorTab = useCallback((filePath: string) => {
    const tabId = `img-${filePath}`;
    if (openTabs.find(t => t.id === tabId)) { setActiveTabId(tabId); setActivePaneId('primary'); return; }
    if (secondaryOpenTabs.find(t => t.id === tabId)) { setSecondaryActiveTabId(tabId); setActivePaneId('secondary'); return; }
    const newTab: EditorTab = { id: tabId, type: 'image', filePath };
    if (activePaneId === 'secondary' && splitLayout !== 'none') {
        setSecondaryOpenTabs(prev => [...prev, newTab]);
        setSecondaryActiveTabId(tabId);
    } else {
        setOpenTabs(prev => [...prev, newTab]);
        setActiveTabId(tabId);
    }
  }, [openTabs, secondaryOpenTabs, activePaneId, splitLayout]);

  const handlePathDoubleClick = useCallback((filePath: string) => {
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp'];
    const lowerFilePath = filePath.toLowerCase();

    if (lowerFilePath.endsWith('.rpy')) {
      const block = blocks.find(b => b.filePath === filePath);
      if (block) {
        handleOpenEditor(block.id);
      }
    } else if (imageExtensions.some(ext => lowerFilePath.endsWith(ext))) {
      handleOpenImageEditorTab(filePath);
    }
  }, [blocks, handleOpenEditor, handleOpenImageEditorTab]);

  const handleCloseTab = useCallback((tabId: string, paneId: 'primary' | 'secondary', e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (paneId === 'primary') {
        setOpenTabs(prev => prev.filter(t => t.id !== tabId));
        if (activeTabId === tabId) setActiveTabId('canvas');
    } else {
        setSecondaryOpenTabs(prev => {
            const next = prev.filter(t => t.id !== tabId);
            if (next.length === 0) {
                // Auto-close pane when last secondary tab removed
                setSplitLayout('none');
                setActivePaneId('primary');
                setSecondaryActiveTabId('');
            } else {
                if (secondaryActiveTabId === tabId) setSecondaryActiveTabId(next[next.length - 1].id);
            }
            return next;
        });
    }
  }, [activeTabId, secondaryActiveTabId]);

  const handleTabContextMenu = useCallback((e: React.MouseEvent, tabId: string, paneId: 'primary' | 'secondary' = 'primary') => {
      e.preventDefault();
      setContextMenuInfo({ x: e.clientX, y: e.clientY, tabId, paneId });
  }, []);

  const processTabCloseRequest = useCallback((tabsToClose: EditorTab[], fallbackTabId: string, paneId: 'primary' | 'secondary' = 'primary') => {
    if (tabsToClose.length === 0) return;

    const hasUnsaved = tabsToClose.some(t => t.blockId && (dirtyBlockIds.has(t.blockId) || dirtyEditors.has(t.blockId)));

    const performClose = () => {
        const idsToClose = new Set(tabsToClose.map(t => t.id));
        if (paneId === 'primary') {
            setOpenTabs(prev => prev.filter(t => !idsToClose.has(t.id)));
            if (idsToClose.has(activeTabId)) setActiveTabId(fallbackTabId);
        } else {
            setSecondaryOpenTabs(prev => {
                const next = prev.filter(t => !idsToClose.has(t.id));
                if (next.length === 0) { setSplitLayout('none'); setActivePaneId('primary'); setSecondaryActiveTabId(''); }
                else if (idsToClose.has(secondaryActiveTabId)) setSecondaryActiveTabId(next[0].id);
                return next;
            });
        }
    };

    if (hasUnsaved) {
        setUnsavedChangesModalInfo({
            title: `Close ${tabsToClose.length > 1 ? 'Tabs' : 'Tab'}`,
            message: `You have unsaved changes in ${tabsToClose.length > 1 ? 'some tabs' : 'this tab'}. Do you want to save them before closing?`,
            confirmText: 'Save & Close',
            dontSaveText: "Don't Save & Close",
            onConfirm: async () => {
                await handleSaveAll();
                performClose();
                setUnsavedChangesModalInfo(null);
            },
            onDontSave: () => {
                // Clear dirty state for closed tabs without saving
                const blockIdsToClean = tabsToClose.map(t => t.blockId).filter(Boolean) as string[];
                setDirtyBlockIds(prev => {
                    const next = new Set(prev);
                    blockIdsToClean.forEach(id => next.delete(id));
                    return next;
                });
                 setDirtyEditors(prev => {
                    const next = new Set(prev);
                    blockIdsToClean.forEach(id => next.delete(id));
                    return next;
                });
                performClose();
                setUnsavedChangesModalInfo(null);
            },
            onCancel: () => {
                setUnsavedChangesModalInfo(null);
            }
        });
    } else {
        performClose();
    }
}, [dirtyBlockIds, dirtyEditors, activeTabId, secondaryActiveTabId, handleSaveAll]);

  const handleCloseOthersRequest = useCallback((tabId: string, paneId: 'primary' | 'secondary' = 'primary') => {
    const tabs = paneId === 'primary' ? openTabs : secondaryOpenTabs;
    const tabsToClose = tabs.filter(t => t.id !== tabId && t.id !== 'canvas' && t.id !== 'ai-generator');
    processTabCloseRequest(tabsToClose, tabId, paneId);
  }, [openTabs, secondaryOpenTabs, processTabCloseRequest]);

  const handleCloseAllRequest = useCallback((paneId: 'primary' | 'secondary' = 'primary') => {
    const tabs = paneId === 'primary' ? openTabs : secondaryOpenTabs;
    const tabsToClose = tabs.filter(t => t.id !== 'canvas' && t.id !== 'ai-generator');
    processTabCloseRequest(tabsToClose, 'canvas', paneId);
  }, [openTabs, secondaryOpenTabs, processTabCloseRequest]);

  const handleCloseLeftRequest = useCallback((tabId: string, paneId: 'primary' | 'secondary' = 'primary') => {
    const tabs = paneId === 'primary' ? openTabs : secondaryOpenTabs;
    const index = tabs.findIndex(t => t.id === tabId);
    if (index === -1) return;
    const tabsToClose = tabs.slice(0, index).filter(t => t.id !== 'canvas' && t.id !== 'ai-generator');
    processTabCloseRequest(tabsToClose, tabId, paneId);
  }, [openTabs, secondaryOpenTabs, processTabCloseRequest]);

  const handleCloseRightRequest = useCallback((tabId: string, paneId: 'primary' | 'secondary' = 'primary') => {
    const tabs = paneId === 'primary' ? openTabs : secondaryOpenTabs;
    const index = tabs.findIndex(t => t.id === tabId);
    if (index === -1) return;
    const tabsToClose = tabs.slice(index + 1).filter(t => t.id !== 'canvas' && t.id !== 'ai-generator');
    processTabCloseRequest(tabsToClose, tabId, paneId);
  }, [openTabs, secondaryOpenTabs, processTabCloseRequest]);

  const handleSwitchTab = (tabId: string, paneId: 'primary' | 'secondary' = 'primary') => {
    if (paneId === 'primary') { setActiveTabId(tabId); setActivePaneId('primary'); }
    else { setSecondaryActiveTabId(tabId); setActivePaneId('secondary'); }
  };

  // --- Split Pane Management ---
  const handleCreateSplit = useCallback((direction: 'right' | 'bottom') => {
    if (splitLayout !== 'none') return;
    const activeTab = openTabs.find(t => t.id === activeTabId);
    if (!activeTab) return;
    // Move the active tab to secondary so canvas/route-canvas are never duplicated across both panes
    const remaining = openTabs.filter(t => t.id !== activeTabId);
    setOpenTabs(remaining);
    if (remaining.length > 0) {
      const fallback = remaining.find(t => t.type === 'canvas') ?? remaining[0];
      setActiveTabId(fallback.id);
    }
    setSecondaryOpenTabs([activeTab]);
    setSecondaryActiveTabId(activeTab.id);
    setSplitLayout(direction);
    setSplitPrimarySize(direction === 'right' ? 600 : 400);
    setActivePaneId('secondary');
  }, [splitLayout, openTabs, activeTabId]);

  const handleOpenInSplit = useCallback((tabId: string, direction: 'right' | 'bottom') => {
    const tab = openTabs.find(t => t.id === tabId);
    if (!tab) return;
    if (splitLayout !== 'none') {
      // Already split — move to secondary
      if (!secondaryOpenTabs.find(t => t.id === tabId)) setSecondaryOpenTabs(prev => [...prev, tab]);
      setSecondaryActiveTabId(tabId);
      setOpenTabs(prev => prev.filter(t => t.id !== tabId));
      if (activeTabId === tabId) setActiveTabId('canvas');
      setActivePaneId('secondary');
      return;
    }
    // Create split and move tab to secondary
    setOpenTabs(prev => prev.filter(t => t.id !== tabId));
    if (activeTabId === tabId) setActiveTabId('canvas');
    setSecondaryOpenTabs([tab]);
    setSecondaryActiveTabId(tabId);
    setSplitLayout(direction);
    setSplitPrimarySize(direction === 'right' ? 600 : 400);
    setActivePaneId('secondary');
  }, [openTabs, activeTabId, secondaryOpenTabs, splitLayout]);

  const handleMoveToOtherPane = useCallback((tabId: string, fromPaneId: 'primary' | 'secondary') => {
    if (fromPaneId === 'primary') {
      const tab = openTabs.find(t => t.id === tabId);
      if (!tab) return;
      setOpenTabs(prev => prev.filter(t => t.id !== tabId));
      if (activeTabId === tabId) setActiveTabId('canvas');
      if (!secondaryOpenTabs.find(t => t.id === tabId)) setSecondaryOpenTabs(prev => [...prev, tab]);
      setSecondaryActiveTabId(tabId);
      setActivePaneId('secondary');
    } else {
      const tab = secondaryOpenTabs.find(t => t.id === tabId);
      if (!tab) return;
      const newSecondary = secondaryOpenTabs.filter(t => t.id !== tabId);
      if (newSecondary.length === 0) {
        setSecondaryOpenTabs([]);
        setSecondaryActiveTabId('');
        setSplitLayout('none');
        setActivePaneId('primary');
      } else {
        setSecondaryOpenTabs(newSecondary);
        if (secondaryActiveTabId === tabId) setSecondaryActiveTabId(newSecondary[0].id);
      }
      if (!openTabs.find(t => t.id === tabId)) setOpenTabs(prev => [...prev, tab]);
      setActiveTabId(tabId);
      setActivePaneId('primary');
    }
  }, [openTabs, activeTabId, secondaryOpenTabs, secondaryActiveTabId]);

  const handleCloseSecondaryPane = useCallback(() => {
    // Merge secondary tabs into primary (skip any already present) so nothing is lost
    if (secondaryOpenTabs.length > 0) {
      setOpenTabs(prev => {
        const existingIds = new Set(prev.map(t => t.id));
        const toAdd = secondaryOpenTabs.filter(t => !existingIds.has(t.id));
        return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
      });
    }
    setSecondaryOpenTabs([]);
    setSecondaryActiveTabId('');
    setSplitLayout('none');
    setActivePaneId('primary');
  }, [secondaryOpenTabs]);

  const handleClosePrimaryPane = useCallback(() => {
    // Promote secondary pane to primary; append any unique primary tabs after it
    const existingIds = new Set(secondaryOpenTabs.map(t => t.id));
    const uniquePrimaryTabs = openTabs.filter(t => !existingIds.has(t.id));
    setOpenTabs([...secondaryOpenTabs, ...uniquePrimaryTabs]);
    setActiveTabId(secondaryActiveTabId || secondaryOpenTabs[0]?.id || 'canvas');
    setSecondaryOpenTabs([]);
    setSecondaryActiveTabId('');
    setSplitLayout('none');
    setActivePaneId('primary');
  }, [openTabs, secondaryOpenTabs, secondaryActiveTabId]);

  const handleCenterOnBlock = useCallback((target: string) => {
      let blockId = target;
      let block = blocks.find(b => b.id === target);

      // If no block matches ID, try matching path
      if (!block) {
          // Normalize path separators just in case
          const targetPath = target.replace(/\\/g, '/');
          block = blocks.find(b => b.filePath === targetPath);
          if (block) blockId = block.id;
      }

      if (block) {
          // Ensure the block type is visible in filters
          setCanvasFilters(prev => {
              const next = { ...prev };
              let changed = false;
              
              if (analysisResult.screenOnlyBlockIds.has(blockId) && !prev.screens) {
                  next.screens = true;
                  changed = true;
              } else if (analysisResult.configBlockIds.has(blockId) && !prev.config) {
                  next.config = true;
                  changed = true;
              } else if (analysisResult.storyBlockIds.has(blockId) && !prev.story) {
                  next.story = true;
                  changed = true;
              }
              
              return changed ? next : prev;
          });

          setActiveTabId('canvas');
          // Small timeout to ensure canvas is rendered if switching tabs
          setTimeout(() => {
              setCenterOnBlockRequest({ blockId, key: Date.now() });
          }, 50);
      } else {
          // Attempt to find sticky note
          const note = stickyNotes.find(n => n.id === target);
          if (note) {
               // Ensure notes are visible
               if (!canvasFilters.notes) {
                   setCanvasFilters(prev => ({ ...prev, notes: true }));
               }
               setActiveTabId('canvas');
               // Reuse the block center request for notes (requires StoryCanvas update to handle notes, or a separate mechanism)
               // Assuming StoryCanvas is updated to check note IDs too
               setTimeout(() => {
                   setCenterOnBlockRequest({ blockId: target, key: Date.now() });
               }, 50);
               return;
          }

          addToast(`Could not find a block or note for "${target}"`, 'warning');
      }
  }, [blocks, analysisResult, addToast, stickyNotes, canvasFilters.notes]);

  // DnD Handlers for Tabs
  const handleTabDragStart = (e: React.DragEvent<HTMLDivElement>, tabId: string, paneId: 'primary' | 'secondary' = 'primary') => {
    setDraggedTabId(tabId);
    setDragSourcePaneId(paneId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tabId);
  };

  const handleTabDragOver = (e: React.DragEvent<HTMLDivElement>, targetTabId: string) => {
    e.preventDefault();
    if (draggedTabId && draggedTabId !== targetTabId) {
       e.dataTransfer.dropEffect = 'move';
    }
  };

  const handleTabDrop = (e: React.DragEvent<HTMLDivElement>, targetTabId: string | null, targetPaneId: 'primary' | 'secondary') => {
    e.preventDefault();
    if (!draggedTabId) { setDraggedTabId(null); return; }
    const sourcePaneId = dragSourcePaneId;

    // ── Same-pane reorder ──────────────────────────────────────────────────
    if (sourcePaneId === targetPaneId) {
      if (!targetTabId || draggedTabId === targetTabId) { setDraggedTabId(null); return; }
      const setTabs = targetPaneId === 'primary' ? setOpenTabs : setSecondaryOpenTabs;
      const tabs    = targetPaneId === 'primary' ? openTabs   : secondaryOpenTabs;
      const fromIndex = tabs.findIndex(t => t.id === draggedTabId);
      const toIndex   = tabs.findIndex(t => t.id === targetTabId);
      if (fromIndex !== -1 && toIndex !== -1) {
        setTabs(prev => {
          const next = [...prev];
          const [moved] = next.splice(fromIndex, 1);
          next.splice(toIndex, 0, moved);
          return next;
        });
        setHasUnsavedSettings(true);
      }
      setDraggedTabId(null);
      return;
    }

    // ── Cross-pane move ────────────────────────────────────────────────────
    const sourceTabs = sourcePaneId === 'primary' ? openTabs : secondaryOpenTabs;
    const targetTabs = targetPaneId === 'primary' ? openTabs : secondaryOpenTabs;
    const tab = sourceTabs.find(t => t.id === draggedTabId);
    if (!tab) { setDraggedTabId(null); return; }

    // Remove from source pane
    const newSourceTabs = sourceTabs.filter(t => t.id !== draggedTabId);
    if (sourcePaneId === 'primary') {
      setOpenTabs(newSourceTabs);
      if (activeTabId === draggedTabId) {
        const fallback = newSourceTabs.find(t => t.type === 'canvas') ?? newSourceTabs[0];
        if (fallback) setActiveTabId(fallback.id);
      }
    } else {
      if (newSourceTabs.length === 0) {
        // Secondary is now empty — collapse the split
        setSecondaryOpenTabs([]);
        setSecondaryActiveTabId('');
        setSplitLayout('none');
        setActivePaneId('primary');
      } else {
        setSecondaryOpenTabs(newSourceTabs);
        if (secondaryActiveTabId === draggedTabId) setSecondaryActiveTabId(newSourceTabs[0].id);
      }
    }

    // Insert into target pane (at the hovered tab position, or append)
    const insertAt = targetTabId !== null ? targetTabs.findIndex(t => t.id === targetTabId) : -1;
    if (targetPaneId === 'primary') {
      setOpenTabs(prev => {
        const next = [...prev];
        next.splice(insertAt >= 0 ? insertAt : next.length, 0, tab);
        return next;
      });
      setActiveTabId(tab.id);
    } else {
      setSecondaryOpenTabs(prev => {
        const next = [...prev];
        next.splice(insertAt >= 0 ? insertAt : next.length, 0, tab);
        return next;
      });
      setSecondaryActiveTabId(tab.id);
    }

    setActivePaneId(targetPaneId);
    setHasUnsavedSettings(true);
    setDraggedTabId(null);
  };

  const handleFindUsages = (id: string, type: 'character' | 'variable') => {
      const ids = new Set<string>();
      if (type === 'character') {
          const lines = analysisResult.dialogueLines;
          lines.forEach((dialogues, blockId) => {
              if (dialogues.some(d => d.tag === id)) ids.add(blockId);
          });
      } else {
          const usages = analysisResult.variableUsages.get(id);
          usages?.forEach(u => ids.add(u.blockId));
      }
      
      setFindUsagesHighlightIds(ids);
      setActiveTabId('canvas');
      addToast(`Found usages in ${ids.size} blocks`, 'info');
  };

  const analysisResultWithProfiles = useMemo(() => {
    if (!analysisResult) return analysisResult;
    const newCharacters = new Map(analysisResult.characters);
    newCharacters.forEach((char, tag) => {
        const profile = characterProfiles[tag];
        if (profile !== undefined) {
            newCharacters.set(tag, { ...char, profile });
        }
    });
    return { ...analysisResult, characters: newCharacters };
  }, [analysisResult, characterProfiles]);

  // --- Character Editor ---
  const handleOpenCharacterEditor = useCallback((tag: string) => {
      const tabId = `char-${tag}`;
      if (openTabs.find(t => t.id === tabId)) { setActiveTabId(tabId); setActivePaneId('primary'); return; }
      if (secondaryOpenTabs.find(t => t.id === tabId)) { setSecondaryActiveTabId(tabId); setActivePaneId('secondary'); return; }
      const newTab: EditorTab = { id: tabId, type: 'character', characterTag: tag };
      if (activePaneId === 'secondary' && splitLayout !== 'none') {
          setSecondaryOpenTabs(prev => [...prev, newTab]);
          setSecondaryActiveTabId(tabId);
      } else {
          setOpenTabs(prev => [...prev, newTab]);
          setActiveTabId(tabId);
      }
  }, [openTabs, secondaryOpenTabs, activePaneId, splitLayout]);

  const handleUpdateCharacter = useCallback(async (char: Character, oldTag?: string) => {
    const buildCharacterString = (char: Character): string => {
        const args: string[] = [];
        if (char.name && char.name !== char.tag) {
            args.push(`"${char.name}"`);
        }

        const kwargs: Record<string, string> = {};
        if (char.color) kwargs.color = `"${char.color}"`;
        if (char.image) kwargs.image = `"${char.image}"`;
        if (char.who_prefix) kwargs.who_prefix = `"${char.who_prefix}"`;
        if (char.who_suffix) kwargs.who_suffix = `"${char.who_suffix}"`;
        if (char.what_prefix) kwargs.what_prefix = `"${char.what_prefix}"`;
        if (char.what_suffix) kwargs.what_suffix = `"${char.what_suffix}"`;
        if (char.what_color) kwargs.what_color = `"${char.what_color}"`;
        if (char.slow) kwargs.slow = 'True';
        if (char.ctc) kwargs.ctc = `"${char.ctc}"`;
        if (char.ctc_position && char.ctc_position !== 'nestled') kwargs.ctc_position = `"${char.ctc_position}"`;

        const kwargStrings = Object.entries(kwargs).map(([key, value]) => `${key}=${value}`);
        const allArgs = [...args, ...kwargStrings].join(', ');

        return `define ${char.tag} = Character(${allArgs})`;
    };

    const newCharString = buildCharacterString(char);

    setCharacterProfiles(draft => {
        if (oldTag && oldTag !== char.tag) { // Should not happen with read-only tag
            delete draft[oldTag];
        }
        if (char.profile) {
            draft[char.tag] = char.profile;
        } else {
            delete draft[char.tag];
        }
    });
    setHasUnsavedSettings(true);

    if (oldTag) { // Updating existing character
        const originalCharDef = analysisResult.characters.get(oldTag);
        if (!originalCharDef) {
            addToast(`Error: Cannot find original definition for character '${oldTag}'.`, 'error');
            return;
        }

        const blockToUpdate = blocks.find(b => b.id === originalCharDef.definedInBlockId);
        if (!blockToUpdate) {
            addToast(`Error: Cannot find file for character '${oldTag}'.`, 'error');
            return;
        }

        const regex = new RegExp(`^(\\s*define\\s+${oldTag}\\s*=\\s*Character\\s*\\([\\s\\S]*?\\))`, 'm');
        if (regex.test(blockToUpdate.content)) {
            const newContent = blockToUpdate.content.replace(regex, newCharString);
            updateBlock(blockToUpdate.id, { content: newContent });
        } else {
            addToast(`Error: Could not find the Character definition for '${oldTag}' to update.`, 'error');
            return;
        }
    } else { // Creating new character
        const charFilePath = 'game/characters.rpy';
        const existingFileBlock = blocks.find(b => b.filePath === charFilePath);
        
        if (existingFileBlock) {
            const newContent = `${existingFileBlock.content.trim()}\n\n${newCharString}\n`;
            updateBlock(existingFileBlock.id, { content: newContent });
        } else {
            const newContent = `# This file stores character definitions.\n\n${newCharString}\n`;
            if (window.electronAPI && projectRootPath) {
                try {
                    const fullPath = await window.electronAPI.path.join(projectRootPath, charFilePath) as string;
                    const res = await window.electronAPI.writeFile(fullPath, newContent);
                    if (res.success) {
                        addBlock(charFilePath, newContent);
                        const projData = await window.electronAPI.loadProject(projectRootPath);
                        setFileSystemTree(projData.tree);
                    } else { throw new Error((res.error as string) || 'Unknown file creation error'); }
                } catch (e) {
                    addToast(`Failed to create characters.rpy: ${e instanceof Error ? e.message : String(e)}`, 'error');
                    return;
                }
            } else {
                addBlock(charFilePath, newContent);
            }
        }
    }
    
    addToast(`Character '${char.name}' saved.`, 'success');
  }, [addToast, analysisResult.characters, blocks, projectRootPath, setCharacterProfiles, updateBlock, addBlock, setFileSystemTree]);

  // --- Search ---
  const handleToggleSearch = () => {
    setActiveLeftPanel('search');
    if (!appSettings.isLeftSidebarOpen) {
      updateAppSettings(draft => { draft.isLeftSidebarOpen = true; });
    }
  };

  const handleCreateNode = useCallback(async (parentPath: string, name: string, type: 'file' | 'folder') => {
    if (!window.electronAPI || !projectRootPath) return;
    const fullPath = await window.electronAPI.path.join(projectRootPath, parentPath, name);
    if (type === 'folder') {
        await window.electronAPI.createDirectory(fullPath);
    } else {
        await window.electronAPI.writeFile(fullPath, '');
        
        // If it's an .rpy file, create a corresponding block
        if (name.toLowerCase().endsWith('.rpy')) {
            const relativePath = parentPath ? `${parentPath}/${name}` : name;
            const content = ''; // Empty content for newly created files
            addBlock(relativePath, content);
            addToast(`Created block for ${name}`, 'success');
        }
    }
    const projData = await window.electronAPI.loadProject(projectRootPath);
    setFileSystemTree(projData.tree);
  }, [projectRootPath, addBlock, addToast]);

  const handleRenameNode = useCallback(async (oldPath: string, newName: string) => {
      if (!window.electronAPI || !projectRootPath) return;
      const fullOldPath = await window.electronAPI.path.join(projectRootPath, oldPath) as string;
      const parentDir = oldPath.split('/').slice(0, -1).join('/');
      const fullNewPath = await window.electronAPI.path.join(projectRootPath, parentDir, newName) as string;
      await window.electronAPI.moveFile(fullOldPath, fullNewPath);
      const projData = await window.electronAPI.loadProject(projectRootPath);
      setFileSystemTree(projData.tree);
  }, [projectRootPath]);

  const handleDeleteNode = useCallback(async (paths: string[]) => {
      if (!window.electronAPI || !projectRootPath) return;
      
      // Check if any of the paths are .rpy files that have corresponding blocks
      const rpyFilesToDelete = paths.filter(path => path.toLowerCase().endsWith('.rpy'));
      const blocksToDelete = rpyFilesToDelete.map(rpyPath => 
          blocks.find(block => block.filePath === rpyPath)
      ).filter(Boolean) as Block[];
      
      // Show confirmation modal
      setDeleteConfirmInfo({
          paths,
          onConfirm: async () => {
              // Delete the files
              for (const p of paths) {
                  const fullPath = await window.electronAPI.path.join(projectRootPath, p) as string;
                  await window.electronAPI.removeEntry(fullPath);
              }
              
              // Remove corresponding blocks for .rpy files
              blocksToDelete.forEach(block => {
                  if (block) {
                      deleteBlock(block.id);
                      addToast(`Removed block for ${block.filePath}`, 'info');
                  }
              });
              
              const projData = await window.electronAPI.loadProject(projectRootPath);
              setFileSystemTree(projData.tree);
              
              if (blocksToDelete.length > 0) {
                  addToast(`Deleted ${paths.length} file(s) and removed ${blocksToDelete.length} block(s)`, 'success');
              } else {
                  addToast(`Deleted ${paths.length} file(s)`, 'success');
              }
          }
      });
  }, [projectRootPath, blocks, deleteBlock, addToast]);

  const handleMoveNode = useCallback(async (sourcePaths: string[], targetPath: string) => {
      if (!window.electronAPI || !projectRootPath) return;
      const fullTargetDir = await window.electronAPI.path.join(projectRootPath, targetPath);
      for (const p of sourcePaths) {
          const fullSource = await window.electronAPI.path.join(projectRootPath, p);
          const fileName = p.split('/').pop() || '';
          const fullDest = await window.electronAPI.path.join(fullTargetDir, fileName);
          await window.electronAPI.moveFile(fullSource, fullDest);
      }
      const projData = await window.electronAPI.loadProject(projectRootPath);
      setFileSystemTree(projData.tree);
  }, [projectRootPath]);

  const handleCut = useCallback((paths: string[]) => setClipboard({ type: 'cut', paths: new Set(paths) }), []);
  const handleCopy = useCallback((paths: string[]) => setClipboard({ type: 'copy', paths: new Set(paths) }), []);
  const handlePaste = useCallback(async (targetPath: string) => {
      if (!clipboard || !window.electronAPI || !projectRootPath) return;
      
      const fullTargetDir = await window.electronAPI.path.join(projectRootPath!, targetPath);
      
      for (const p of clipboard.paths) {
          const fullSource = await window.electronAPI.path.join(projectRootPath!, p);
          const fileName = p.split('/').pop() || '';
          const fullDest = await window.electronAPI.path.join(fullTargetDir, fileName);
          
          if (clipboard.type === 'cut') {
              await window.electronAPI.moveFile(fullSource, fullDest);
          } else {
              await window.electronAPI.copyEntry(fullSource, fullDest);
          }
      }
      
      if (clipboard.type === 'cut') setClipboard(null);
      const projData = await window.electronAPI.loadProject(projectRootPath);
      setFileSystemTree(projData.tree);
  }, [clipboard, projectRootPath]);

  const snippetCategoriesState = appSettings.snippetCategoriesState || {};
  const handleToggleSnippetCategory = (name: string, isOpen: boolean) => {
      updateAppSettings(draft => {
          if (!draft.snippetCategoriesState) draft.snippetCategoriesState = {};
          draft.snippetCategoriesState[name] = isOpen;
      });
  };

  // --- Menu Command Handling ---
  useEffect(() => {
        if (!window.electronAPI) return;
        const removeListener = window.electronAPI.onMenuCommand((data: { command: string, type?: 'canvas' | 'route-canvas' | 'punchlist' | 'ai-generator', path?: string }) => {
            if (data.command === 'new-project') handleNewProjectRequest();
            if (data.command === 'open-project') handleOpenProjectFolder();
            if (data.command === 'open-recent' && data.path) handleOpenWithRenpyCheck(data.path);
            if (data.command === 'save-all') handleSaveAll();
            if (data.command === 'run-project' && projectRootPath) window.electronAPI?.runGame(appSettings.renpyPath, projectRootPath);
            if (data.command === 'stop-project') window.electronAPI?.stopGame();
            if (data.command === 'open-static-tab' && data.type) handleOpenStaticTab(data.type as 'canvas' | 'route-canvas' | 'punchlist' | 'ai-generator');
            if (data.command === 'toggle-search') handleToggleSearch();
            if (data.command === 'open-settings') setSettingsModalOpen(true);
            if (data.command === 'open-shortcuts') setShortcutsModalOpen(true);
            if (data.command === 'open-about') setAboutModalOpen(true);
            if (data.command === 'toggle-left-sidebar') updateAppSettings(draft => { draft.isLeftSidebarOpen = !draft.isLeftSidebarOpen; });
            if (data.command === 'toggle-right-sidebar') updateAppSettings(draft => { draft.isRightSidebarOpen = !draft.isRightSidebarOpen; });
        });
        return removeListener;
  }, [handleNewProjectRequest, handleOpenProjectFolder, handleOpenWithRenpyCheck, loadProject, handleSaveAll, projectRootPath, appSettings.renpyPath, handleOpenStaticTab, handleToggleSearch, updateAppSettings]);

  // --- Game Running State ---
  useEffect(() => {
      if (!window.electronAPI) return;
      const removeStarted = window.electronAPI.onGameStarted(() => setIsGameRunning(true));
      const removeStopped = window.electronAPI.onGameStopped(() => setIsGameRunning(false));
      return () => { removeStarted(); removeStopped(); };
  }, []);

  // --- Auto-update notifications ---
  useEffect(() => {
      if (!window.electronAPI?.onUpdateAvailable) return;
      const removeAvailable = window.electronAPI.onUpdateAvailable((version: string) => {
          addToast(`Update v${version} is downloading in the background.`, 'info');
      });
      const removeNotAvailable = window.electronAPI.onUpdateNotAvailable?.(() => {
          addToast("Ren'IDE is up to date.", 'info');
      });
      const removeError = window.electronAPI.onUpdateError?.(() => {
          addToast('Could not check for updates. Check your connection and try again.', 'error');
      });
      const removeDownloaded = window.electronAPI.onUpdateDownloaded((version: string) => {
          addToast(`Update v${version} ready — restart Ren'IDE to install.`, 'success');
      });
      return () => {
          removeAvailable();
          removeNotAvailable?.();
          removeError?.();
          removeDownloaded();
      };
  }, [addToast]);

  // --- Exit Handling ---
  const dirtyBlockIdsRef = useRef(dirtyBlockIds);
  const dirtyEditorsRef = useRef(dirtyEditors);
  const hasUnsavedSettingsRef = useRef(hasUnsavedSettings);
  const handleSaveAllRef = useRef(handleSaveAll);
  const handleSaveProjectSettingsRef = useRef(handleSaveProjectSettings);

  useEffect(() => { dirtyBlockIdsRef.current = dirtyBlockIds; }, [dirtyBlockIds]);
  useEffect(() => { dirtyEditorsRef.current = dirtyEditors; }, [dirtyEditors]);
  useEffect(() => { hasUnsavedSettingsRef.current = hasUnsavedSettings; }, [hasUnsavedSettings]);
  useEffect(() => { handleSaveAllRef.current = handleSaveAll; }, [handleSaveAll]);
  useEffect(() => { handleSaveProjectSettingsRef.current = handleSaveProjectSettings; }, [handleSaveProjectSettings]);

  useEffect(() => {
      if (!window.electronAPI) return;

      const removeCheck = window.electronAPI.onCheckUnsavedChangesBeforeExit(() => {
          const hasUnsaved = dirtyBlockIdsRef.current.size > 0 || dirtyEditorsRef.current.size > 0 || hasUnsavedSettingsRef.current;
          window.electronAPI!.replyUnsavedChangesBeforeExit(hasUnsaved);
      });

      const removeShowModal = window.electronAPI.onShowExitModal(() => {
          setUnsavedChangesModalInfo({
              title: 'Unsaved Changes',
              message: 'You have unsaved changes. Do you want to save them before exiting?',
              confirmText: 'Save & Exit',
              dontSaveText: "Don't Save",
              onConfirm: async () => {
                  await handleSaveAllRef.current();
                  window.electronAPI!.ideStateSavedForQuit();
              },
              onDontSave: () => {
                  window.electronAPI!.ideStateSavedForQuit();
              },
              onCancel: () => {
                  setUnsavedChangesModalInfo(null);
              }
          });
      });

      const removeSaveState = window.electronAPI.onSaveIdeStateBeforeQuit(async () => {
          await handleSaveProjectSettingsRef.current();
          window.electronAPI!.ideStateSavedForQuit();
      });

      return () => {
          removeCheck();
          removeShowModal();
          removeSaveState();
      };
  }, []);

  // --- Tab helpers (used by both panes) ---
  const getTabLabel = (tab: EditorTab): React.ReactNode => {
    if (tab.id === 'canvas') return 'Story Canvas';
    if (tab.id === 'route-canvas') return 'Route Canvas';
    if (tab.id === 'punchlist') return 'Punchlist';
    if (tab.id === 'stats') return 'Stats';
    if (tab.type === 'ai-generator') return 'AI Generator';
    if (tab.type === 'scene-composer') return sceneNames[tab.sceneId!] || 'Scene';
    if (tab.type === 'character') return `Char: ${analysisResult.characters.get(tab.characterTag!)?.name || tab.characterTag}`;
    if (tab.type === 'editor') return blocks.find(b => b.id === tab.blockId)?.title || 'Untitled';
    return tab.filePath?.split('/').pop() ?? 'Untitled';
  };

  const renderTabContent = (tab: EditorTab): React.ReactNode => {
    if (tab.type === 'canvas') {
      return <StoryCanvas
        blocks={blocks} groups={groups} stickyNotes={stickyNotes} analysisResult={analysisResult}
        updateBlock={updateBlock} updateGroup={updateGroup} updateBlockPositions={updateBlockPositions}
        updateGroupPositions={updateGroupPositions} updateStickyNote={updateStickyNote} deleteStickyNote={deleteStickyNote}
        onInteractionEnd={() => {}} deleteBlock={deleteBlock} onOpenEditor={handleOpenEditor}
        selectedBlockIds={selectedBlockIds} setSelectedBlockIds={setSelectedBlockIds}
        selectedGroupIds={selectedGroupIds} setSelectedGroupIds={setSelectedGroupIds}
        findUsagesHighlightIds={findUsagesHighlightIds} clearFindUsages={() => setFindUsagesHighlightIds(null)}
        dirtyBlockIds={dirtyBlockIds} canvasFilters={canvasFilters} setCanvasFilters={setCanvasFilters}
        centerOnBlockRequest={centerOnBlockRequest} flashBlockRequest={flashBlockRequest}
        hoverHighlightIds={hoverHighlightIds} transform={storyCanvasTransform} onTransformChange={setStoryCanvasTransform}
        onCreateBlock={handleCreateBlockFromCanvas} onAddStickyNote={addStickyNote} mouseGestures={appSettings.mouseGestures}
      />;
    }
    if (tab.type === 'route-canvas') {
      return <RouteCanvas
        labelNodes={routeAnalysisResult.labelNodes} routeLinks={routeAnalysisResult.routeLinks}
        identifiedRoutes={routeAnalysisResult.identifiedRoutes} updateLabelNodePositions={handleUpdateRouteNodePositions}
        onOpenEditor={handleOpenEditor} transform={routeCanvasTransform} onTransformChange={setRouteCanvasTransform}
        mouseGestures={appSettings.mouseGestures}
      />;
    }
    if (tab.type === 'punchlist') {
      return <PunchlistManager
        blocks={blocks} stickyNotes={stickyNotes} analysisResult={analysisResult}
        projectImages={images} imageMetadata={imageMetadata} projectAudios={audios} audioMetadata={audioMetadata}
        punchlistMetadata={punchlistMetadata}
        onUpdateMetadata={(id, data) => { setPunchlistMetadata(draft => { if (data === undefined) { delete draft[id]; } else { draft[id] = { ...draft[id], ...data }; } }); setHasUnsavedSettings(true); }}
        onOpenBlock={handleOpenEditor} onHighlightBlock={(id) => handleCenterOnBlock(id)}
      />;
    }
    if (tab.type === 'ai-generator') {
      return <AIGeneratorView
        currentBlockId={getCurrentBlockId()} blocks={blocks} analysisResult={analysisResult}
        getCurrentContext={getCurrentContext} availableModels={AVAILABLE_MODELS} selectedModel={projectSettings.selectedModel}
      />;
    }
    if (tab.id === 'stats') {
      return <StatsView blocks={blocks} analysisResult={analysisResult} routeAnalysisResult={routeAnalysisResult} />;
    }
    if (tab.type === 'editor' && tab.blockId) {
      const block = blocks.find(b => b.id === tab.blockId);
      if (block) return <EditorView
        block={block} blocks={blocks} analysisResult={analysisResult} initialScrollRequest={tab.scrollRequest}
        onSwitchFocusBlock={handleOpenEditor} onSave={(id, content) => updateBlock(id, { content })}
        onTriggerSave={handleSaveBlock}
        onDirtyChange={(id, dirty) => { setDirtyEditors(prev => { const next = new Set(prev); if (dirty) { next.add(id); } else { next.delete(id); } return next; }); }}
        editorTheme={appSettings.theme.includes('dark') ? 'dark' : 'light'} editorFontFamily={appSettings.editorFontFamily}
        editorFontSize={appSettings.editorFontSize} enableAiFeatures={projectSettings.enableAiFeatures}
        availableModels={AVAILABLE_MODELS} selectedModel={projectSettings.selectedModel} addToast={addToast}
        onEditorMount={(id, editor) => editorInstances.current.set(id, editor)}
        onEditorUnmount={(id) => { const editor = editorInstances.current.get(id); if (editor) { const block = blocksRef.current.find(b => b.id === id); if (block && editor.getValue() !== block.content) { syncEditorToStateAndMarkDirty(id, editor.getValue()); } } editorInstances.current.delete(id); }}
        onCursorPositionChange={setEditorCursorPosition}
        draftingMode={projectSettings.draftingMode} existingImageTags={existingImageTags} existingAudioPaths={existingAudioPaths}
      />;
    }
    if (tab.type === 'image' && tab.filePath) {
      const img = images.get(tab.filePath);
      if (img) { const meta = imageMetadata.get(img.projectFilePath || img.filePath); return <ImageEditorView
        image={img} allImages={Array.from(images.values())} metadata={meta}
        onUpdateMetadata={(path, newMeta) => { setImageMetadata(prev => { const next = new Map(prev); next.set(path, newMeta); return next; }); setHasUnsavedSettings(true); }}
        onCopyToProject={async (sourcePath, meta) => { if (window.electronAPI && projectRootPath) { const fileName = sourcePath.split('/').pop() || 'image.png'; const subfolder = meta.projectSubfolder || ''; const destDir = await window.electronAPI.path.join(projectRootPath, 'game', 'images', subfolder); const destPath = await window.electronAPI.path.join(destDir, fileName); await window.electronAPI.copyEntry(sourcePath, destPath); await loadProject(projectRootPath); } }}
      />; }
    }
    if (tab.type === 'audio' && tab.filePath) {
      const aud = audios.get(tab.filePath);
      if (aud) { const meta = audioMetadata.get(aud.projectFilePath || aud.filePath); return <AudioEditorView
        audio={aud} metadata={meta}
        onUpdateMetadata={(path, newMeta) => { setAudioMetadata(prev => { const next = new Map(prev); next.set(path, newMeta); return next; }); setHasUnsavedSettings(true); }}
        onCopyToProject={async (sourcePath, meta) => { if (window.electronAPI && projectRootPath) { const fileName = sourcePath.split('/').pop() || 'audio.ogg'; const subfolder = meta.projectSubfolder || ''; const destDir = await window.electronAPI.path.join(projectRootPath, 'game', 'audio', subfolder); const destPath = await window.electronAPI.path.join(destDir, fileName); await window.electronAPI.copyEntry(sourcePath, destPath); await loadProject(projectRootPath); } }}
      />; }
    }
    if (tab.type === 'character' && tab.characterTag) {
      const char = analysisResultWithProfiles.characters.get(tab.characterTag);
      return <CharacterEditorView character={char} onSave={handleUpdateCharacter}
        existingTags={Array.from(analysisResult.characters.keys())}
        projectImages={Array.from(images.values())} imageMetadata={imageMetadata}
      />;
    }
    if (tab.type === 'scene-composer' && tab.sceneId) {
      const composition = sceneCompositions[tab.sceneId] || { background: null, sprites: [] };
      const name = sceneNames[tab.sceneId] || 'Scene';
      return <SceneComposer
        images={Array.from(images.values())} metadata={imageMetadata} scene={composition}
        onSceneChange={(val) => handleSceneUpdate(tab.sceneId!, val)} sceneName={name}
        onRenameScene={(newName) => handleRenameScene(tab.sceneId!, newName)}
      />;
    }
    return null;
  };

  const renderTabBar = (tabs: EditorTab[], activeId: string, paneId: 'primary' | 'secondary', scrollRef: React.RefObject<HTMLDivElement>) => (
    <div className={`flex-none flex items-center bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 ${splitLayout !== 'none' && activePaneId === paneId ? 'border-t-2 border-t-indigo-500' : ''}`}>
      {/* Scrollable tab strip — also a drop target for appending to this pane */}
      <div
        ref={scrollRef}
        className="flex flex-1 overflow-x-auto no-scrollbar min-w-0"
        onDragOver={(e) => { e.preventDefault(); if (draggedTabId) e.dataTransfer.dropEffect = 'move'; }}
        onDrop={(e) => handleTabDrop(e, null, paneId)}
      >
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`flex items-center px-3 py-2 text-sm border-r border-gray-200 dark:border-gray-700 cursor-pointer min-w-[100px] max-w-[200px] flex-none group ${activeId === tab.id ? 'bg-white dark:bg-gray-900 font-semibold' : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'}`}
            onClick={() => handleSwitchTab(tab.id, paneId)}
            draggable
            onDragStart={(e) => handleTabDragStart(e, tab.id, paneId)}
            onDragOver={(e) => handleTabDragOver(e, tab.id)}
            onDrop={(e) => { e.stopPropagation(); handleTabDrop(e, tab.id, paneId); }}
            onContextMenu={(e) => handleTabContextMenu(e, tab.id, paneId)}
          >
            <span className="truncate flex-grow">{getTabLabel(tab)}</span>
            {tab.id !== 'canvas' && (
              <button onClick={(e) => handleCloseTab(tab.id, paneId, e)} className="ml-2 opacity-0 group-hover:opacity-100 hover:text-red-500 rounded-full p-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              </button>
            )}
            {tab.blockId && (dirtyBlockIds.has(tab.blockId) || dirtyEditors.has(tab.blockId)) && <div className="w-2 h-2 ml-2 bg-blue-500 rounded-full flex-none" />}
          </div>
        ))}
      </div>
      {/* Pinned right actions */}
      <div className="flex items-center flex-none border-l border-gray-200 dark:border-gray-700">
        <button
          onClick={() => scrollRef.current?.scrollBy({ left: -150, behavior: 'smooth' })}
          title="Scroll tabs left"
          className="px-1 py-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none"><path d="M7.5 2L3.5 6L7.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <button
          onClick={() => scrollRef.current?.scrollBy({ left: 150, behavior: 'smooth' })}
          title="Scroll tabs right"
          className="px-1 py-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none"><path d="M4.5 2L8.5 6L4.5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        {paneId === 'primary' && splitLayout === 'none' && (
          <>
            <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-0.5" />
            <button onClick={() => handleCreateSplit('right')} title="Split Right" className="p-1 rounded text-gray-400 hover:text-indigo-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="6" height="12" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="9" y="2" width="6" height="12" rx="1" stroke="currentColor" strokeWidth="1.5"/></svg>
            </button>
            <button onClick={() => handleCreateSplit('bottom')} title="Split Below" className="p-1 rounded text-gray-400 hover:text-indigo-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none"><rect x="2" y="1" width="12" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="2" y="9" width="12" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/></svg>
            </button>
          </>
        )}
        {paneId === 'primary' && splitLayout !== 'none' && (
          <>
            <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-0.5" />
            <button onClick={handleClosePrimaryPane} title="Close Pane (moves tabs to other pane)" className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
          </>
        )}
        {paneId === 'secondary' && (
          <>
            <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-0.5" />
            <button onClick={handleCloseSecondaryPane} title="Close Pane (moves tabs to other pane)" className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className={`fixed inset-0 flex flex-col bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100 ${appSettings.theme}`}>
      <Toolbar
        directoryHandle={directoryHandle}
        projectRootPath={projectRootPath}
        dirtyBlockIds={dirtyBlockIds}
        dirtyEditors={dirtyEditors}
        hasUnsavedSettings={hasUnsavedSettings}
        saveStatus={saveStatus}
        canUndo={canUndo}
        canRedo={canRedo}
        undo={undo}
        redo={redo}
        addBlock={() => setCreateBlockModalOpen(true)}
        handleTidyUp={() => handleTidyUp(true)}
        onRequestNewProject={handleNewProjectRequest}
        requestOpenFolder={handleOpenProjectFolder}
        handleSave={handleSaveAll}
        onOpenSettings={() => setSettingsModalOpen(true)}
        onOpenStaticTab={handleOpenStaticTab as (type: 'canvas' | 'route-canvas' | 'stats') => void}
        onAddStickyNote={() => addStickyNote()}
        isGameRunning={isGameRunning}
        onRunGame={() => window.electronAPI?.runGame(appSettings.renpyPath, projectRootPath!)}
        onStopGame={() => window.electronAPI?.stopGame()}
        renpyPath={appSettings.renpyPath}
        isRenpyPathValid={isRenpyPathValid}
        draftingMode={projectSettings.draftingMode}
        onToggleDraftingMode={handleToggleDraftingMode}
      />
      
      <div className="flex-grow flex overflow-hidden">
        {/* Left Sidebar */}
        {!appSettings.isLeftSidebarOpen && (
          <div className="flex-none w-6 flex flex-col border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <button
              onClick={() => updateAppSettings(draft => { draft.isLeftSidebarOpen = true })}
              className="w-6 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer"
              title="Expand Left Sidebar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3.293 14.707a1 1 0 010-1.414L6.586 10 3.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0zm8 0a1 1 0 010-1.414L14.586 10l-3.293-3.293a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
            </button>
          </div>
        )}
        {appSettings.isLeftSidebarOpen && (
          <div style={{ width: appSettings.leftSidebarWidth }} className="flex-none flex flex-col border-r border-gray-200 dark:border-gray-700">
            <div className="flex-none flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setActiveLeftPanel('explorer')}
                  className={`px-3 py-1 rounded-md text-sm font-medium ${activeLeftPanel === 'explorer' ? 'bg-white dark:bg-gray-900 shadow' : 'text-gray-600 dark:text-gray-300'}`}
                >
                  Explorer
                </button>
                <button
                  onClick={() => setActiveLeftPanel('search')}
                  className={`px-3 py-1 rounded-md text-sm font-medium ${activeLeftPanel === 'search' ? 'bg-white dark:bg-gray-900 shadow' : 'text-gray-600 dark:text-gray-300'}`}
                >
                  Search
                </button>
              </div>
              <button
                onClick={() => updateAppSettings(draft => { draft.isLeftSidebarOpen = false })}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                title="Collapse Left Sidebar"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 14.707a1 1 0 010-1.414L13.414 10l3.293-3.293a1 1 0 00-1.414-1.414l-4 4a1 1 0 000 1.414l4 4a1 1 0 001.414 0zm-8 0a1 1 0 010-1.414L5.414 10l3.293-3.293a1 1 0 00-1.414-1.414l-4 4a1 1 0 000 1.414l4 4a1 1 0 001.414 0z" clipRule="evenodd" /></svg>
              </button>
            </div>

            <div className="flex-1 overflow-auto">
              {activeLeftPanel === 'explorer' ? (
                <FileExplorerPanel
                    tree={fileSystemTree}
                    onFileOpen={handlePathDoubleClick}
                    onCreateNode={handleCreateNode}
                    onRenameNode={handleRenameNode}
                    onDeleteNode={handleDeleteNode}
                    onMoveNode={handleMoveNode}
                    clipboard={clipboard}
                    onCut={handleCut}
                    onCopy={handleCopy}
                    onPaste={handlePaste}
                    onCenterOnBlock={handleCenterOnBlock}
                    selectedPaths={explorerSelectedPaths}
                    setSelectedPaths={setExplorerSelectedPaths}
                    lastClickedPath={explorerLastClickedPath}
                    setLastClickedPath={setExplorerLastClickedPath}
                    expandedPaths={explorerExpandedPaths}
                    onToggleExpand={handleToggleExpandExplorer}
                />
             ) : (
                <SearchPanel 
                    query={searchQuery}
                    setQuery={setSearchQuery}
                    replace={replaceQuery}
                    setReplace={setReplaceQuery}
                    options={searchOptions}
                    setOptions={setSearchOptions}
                    results={searchResults}
                    onSearch={async () => {
                        if (window.electronAPI && projectRootPath) {
                            const results = await window.electronAPI.searchInProject({ 
                                projectPath: projectRootPath, 
                                query: searchQuery, 
                                ...searchOptions 
                            });
                            setSearchResults(results);
                        }
                    }}
                    onReplaceAll={() => {/* Implementation for replace all */}}
                    onResultClick={(file, line) => {
                        const block = blocks.find(b => b.filePath === file);
                        if (block) handleOpenEditor(block.id, line);
                    }}
                    isSearching={isSearching}
                />
             )}
            </div>
          </div>
        )}
        {appSettings.isLeftSidebarOpen && (
            <Sash onDrag={(delta) => updateAppSettings(d => { d.leftSidebarWidth = Math.max(150, d.leftSidebarWidth + delta) })} />
        )}

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 bg-gray-50 dark:bg-gray-900 relative">
          {/* Panes container — flex-row for right split, flex-col for bottom split */}
          <div className={`flex-grow flex ${splitLayout === 'bottom' ? 'flex-col' : 'flex-row'} overflow-hidden min-h-0`}>

            {/* PRIMARY PANE */}
            <div
              className="flex flex-col min-w-0 min-h-0"
              style={splitLayout === 'right' ? { width: splitPrimarySize, flexShrink: 0 } : splitLayout === 'bottom' ? { height: splitPrimarySize, flexShrink: 0 } : { flex: 1 }}
              onClick={() => activePaneId !== 'primary' && setActivePaneId('primary')}
            >
              {renderTabBar(openTabs, activeTabId, 'primary', primaryTabBarRef)}
              <div className="flex-grow relative overflow-hidden">
                {openTabs.map(tab => (
                    <div key={tab.id} className="w-full h-full absolute" style={{ visibility: tab.id === activeTabId ? 'visible' : 'hidden' }}>
                        {renderTabContent(tab)}
                    </div>
                ))}
              </div>
            </div>

            {/* SASH between panes */}
            {splitLayout !== 'none' && (
              <Sash
                direction={splitLayout === 'right' ? 'horizontal' : 'vertical'}
                onDrag={(delta) => setSplitPrimarySize(prev => Math.max(200, prev + delta))}
              />
            )}

            {/* SECONDARY PANE */}
            {splitLayout !== 'none' && (
              <div
                className="flex-1 flex flex-col min-w-0 min-h-0"
                onClick={() => activePaneId !== 'secondary' && setActivePaneId('secondary')}
              >
                {renderTabBar(secondaryOpenTabs, secondaryActiveTabId, 'secondary', secondaryTabBarRef)}
                <div className="flex-grow relative overflow-hidden">
                  {secondaryOpenTabs.map(tab => (
                    <div key={tab.id} className="w-full h-full absolute" style={{ visibility: tab.id === secondaryActiveTabId ? 'visible' : 'hidden' }}>
                        {renderTabContent(tab)}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>{/* end panes container */}

          <StatusBar
              totalWords={useMemo(() => {
                  return blocks.reduce((acc, b) => acc + countWordsInRenpyScript(b.content), 0);
              }, [blocks])}
              currentFileWords={useMemo(() => {
                  if (activeTabId && activeTabId !== 'canvas') {
                      const activeBlock = blocks.find(b => b.id === activeTabId);
                      if (activeBlock) return countWordsInRenpyScript(activeBlock.content);
                  }
                  return null;
              }, [blocks, activeTabId])}
              readingTime={useMemo(() => {
                  const totalWords = blocks.reduce((acc, b) => acc + countWordsInRenpyScript(b.content), 0);
                  const minutes = Math.ceil(totalWords / 200);
                  if (minutes < 60) return `${minutes} min read`;
                  const hours = Math.floor(minutes / 60);
                  const mins = minutes % 60;
                  return `${hours}h ${mins}m read`;
              }, [blocks])}
              statusMessage={statusBarMessage}
              version={APP_VERSION}
              build={BUILD_NUMBER}
              cursorPosition={(() => {
                const focusedTabs = activePaneId === 'primary' ? openTabs : secondaryOpenTabs;
                const focusedActiveId = activePaneId === 'primary' ? activeTabId : secondaryActiveTabId;
                const focusedTab = focusedTabs.find(t => t.id === focusedActiveId);
                return focusedTab?.type === 'editor' ? editorCursorPosition : null;
              })()}
          />

        </div>

        {/* Right Sidebar */}
        {appSettings.isRightSidebarOpen && (
            <Sash onDrag={(delta) => updateAppSettings(d => { d.rightSidebarWidth = Math.max(200, d.rightSidebarWidth - delta) })} />
        )}
        {appSettings.isRightSidebarOpen && (
          <div style={{ width: appSettings.rightSidebarWidth }} className="flex-none relative border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <button
              onClick={() => updateAppSettings(draft => { draft.isRightSidebarOpen = false })}
              className="absolute top-3 right-3 z-10 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Collapse Right Sidebar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3.293 14.707a1 1 0 010-1.414L6.586 10 3.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0zm8 0a1 1 0 010-1.414L14.586 10l-3.293-3.293a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
            </button>
            <StoryElementsPanel
                analysisResult={analysisResultWithProfiles}
                onOpenCharacterEditor={handleOpenCharacterEditor}
                onFindCharacterUsages={(tag) => handleFindUsages(tag, 'character')}
                onAddVariable={(v) => {
                    const varContent = `default ${v.name} = ${v.initialValue}\n`;
                    const targetFile = 'game/variables.rpy';
                    const existing = blocks.find(b => b.filePath === targetFile);
                    if (existing) {
                        updateBlock(existing.id, { content: existing.content + '\n' + varContent });
                        addToast(`Added variable ${v.name} to variables.rpy`, 'success');
                    } else {
                        addToast(`Please create 'game/variables.rpy' first.`, 'warning');
                    }
                }}
                onFindVariableUsages={(name) => handleFindUsages(name, 'variable')}
                onAddScreen={(name) => handleCreateBlockConfirm(name, 'screen', 'game')}
                onFindScreenDefinition={(name) => {
                    const def = analysisResult.screens.get(name);
                    if (def) handleOpenEditor(def.definedInBlockId, def.line);
                }}
                // Image Props
                projectImages={images}
                imageMetadata={imageMetadata}
                imageScanDirectories={imageScanDirectories}
                onAddImageScanDirectory={async () => {
                    if (window.electronAPI) {
                        const path = await window.electronAPI.openDirectory();
                        if (path) {
                            setImageScanDirectories(prev => new Map(prev).set(path, {} as any));
                            const { images: scanned } = await window.electronAPI.scanDirectory(path);
                            setImages(prev => {
                                const next = new Map(prev);
                                scanned.forEach((img: any) => {
                                    if (!next.has(img.path)) next.set(img.path, { ...img, filePath: img.path, isInProject: false, fileHandle: null });
                                });
                                return next;
                            });
                            setHasUnsavedSettings(true);
                        }
                    }
                }}
                onRemoveImageScanDirectory={(path) => {
                    setImageScanDirectories(prev => {
                        const next = new Map(prev);
                        next.delete(path);
                        return next;
                    });
                    setHasUnsavedSettings(true);
                }}
                onCopyImagesToProject={async (sourcePaths) => {
                    if (window.electronAPI && projectRootPath) {
                        for (const src of sourcePaths) {
                            const fileName = src.split('/').pop() || 'image.png';
                            const destDir = await window.electronAPI.path.join(projectRootPath, 'game', 'images');
                            const destPath = await window.electronAPI.path.join(destDir, fileName);
                            await window.electronAPI.copyEntry(src, destPath);
                        }
                        await loadProject(projectRootPath);
                    }
                }}
                onUpdateImageMetadata={(path, meta) => {
                    setImageMetadata(prev => { 
                        const next = new Map(prev);
                        next.set(path, meta);
                        return next;
                    });
                    setHasUnsavedSettings(true);
                }}
                onOpenImageEditor={handleOpenImageEditorTab}
                imagesLastScanned={imagesLastScanned}
                isRefreshingImages={isRefreshingImages}
                onRefreshImages={() => {/* Logic to re-scan all directories */}}
                
                // Audio Props
                projectAudios={audios}
                audioMetadata={audioMetadata}
                audioScanDirectories={audioScanDirectories}
                onAddAudioScanDirectory={async () => {
                     if (window.electronAPI) {
                        const path = await window.electronAPI.openDirectory();
                        if (path) {
                            setAudioScanDirectories(prev => new Map(prev).set(path, {} as any));
                            const { audios: scanned } = await window.electronAPI.scanDirectory(path);
                            setAudios(prev => {
                                const next = new Map(prev);
                                scanned.forEach((aud: any) => {
                                    if (!next.has(aud.path)) next.set(aud.path, { ...aud, filePath: aud.path, isInProject: false, fileHandle: null });
                                });
                                return next;
                            });
                            setHasUnsavedSettings(true);
                        }
                    }
                }}
                onRemoveAudioScanDirectory={(path) => {
                    setAudioScanDirectories(prev => {
                        const next = new Map(prev);
                        next.delete(path);
                        return next;
                    });
                    setHasUnsavedSettings(true);
                }}
                onCopyAudiosToProject={async (sourcePaths) => {
                     if (window.electronAPI && projectRootPath) {
                        for (const src of sourcePaths) {
                            const fileName = src.split('/').pop() || 'audio.ogg';
                            const destDir = await window.electronAPI.path.join(projectRootPath, 'game', 'audio');
                            const destPath = await window.electronAPI.path.join(destDir, fileName);
                            await window.electronAPI.copyEntry(src, destPath);
                        }
                        await loadProject(projectRootPath);
                    }
                }}
                onUpdateAudioMetadata={(path, meta) => {
                    setAudioMetadata(prev => { 
                        const next = new Map(prev);
                        next.set(path, meta);
                        return next;
                    });
                    setHasUnsavedSettings(true);
                }}
                onOpenAudioEditor={(filePath) => {
                    const tabId = `aud-${filePath}`;
                    setOpenTabs(prev => {
                        if (!prev.find(t => t.id === tabId)) {
                            return [...prev, { id: tabId, type: 'audio', filePath }];
                        }
                        return prev;
                    });
                    setActiveTabId(tabId);
                }}
                audiosLastScanned={audiosLastScanned}
                isRefreshingAudios={isRefreshingAudios}
                onRefreshAudios={() => {}}
                isFileSystemApiSupported={!!window.electronAPI}
                onHoverHighlightStart={(key, type) => {
                    const ids = new Set<string>();
                    // Highlight logic same as find usages but transient
                    if (type === 'character') {
                        analysisResult.dialogueLines.forEach((dialogues, blockId) => {
                            if (dialogues.some(d => d.tag === key)) ids.add(blockId);
                        });
                    } else {
                        analysisResult.variableUsages.get(key)?.forEach(u => ids.add(u.blockId));
                    }
                    setHoverHighlightIds(ids);
                }}
                onHoverHighlightEnd={() => setHoverHighlightIds(null)}
                // Scene Props
                scenes={Object.keys(sceneCompositions).map(id => ({ id, name: sceneNames[id] || 'Scene' }))}
                onOpenScene={handleOpenScene}
                onCreateScene={handleCreateScene}
                onDeleteScene={handleDeleteScene}
                // Snippet Props
                snippetCategoriesState={snippetCategoriesState}
                onToggleSnippetCategory={handleToggleSnippetCategory}
            />
          </div>
        )}
        {!appSettings.isRightSidebarOpen && (
          <div className="flex-none w-6 flex flex-col border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <button
              onClick={() => updateAppSettings(draft => { draft.isRightSidebarOpen = true })}
              className="w-6 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer"
              title="Expand Right Sidebar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 14.707a1 1 0 010-1.414L13.414 10l3.293-3.293a1 1 0 00-1.414-1.414l-4 4a1 1 0 000 1.414l4 4a1 1 0 001.414 0zm-8 0a1 1 0 010-1.414L5.414 10l3.293-3.293a1 1 0 00-1.414-1.414l-4 4a1 1 0 000 1.414l4 4a1 1 0 001.414 0z" clipRule="evenodd" /></svg>
            </button>
          </div>
        )}
      </div>

      {/* Modals and Overlays */}
      {showWelcome && !isLoading && (
        <WelcomeScreen
            onOpenProject={handleOpenProjectFolder}
            onCreateProject={handleCreateProject}
            isElectron={!!window.electronAPI}
            recentProjects={appSettings.recentProjects}
            onOpenRecent={handleOpenWithRenpyCheck}
        />
      )}

      {nonRenpyWarningPath && (
        <ConfirmModal
          title="Folder may not be a Ren'Py project"
          confirmText="Open Anyway"
          confirmClassName="bg-indigo-600 hover:bg-indigo-700"
          onConfirm={() => {
            const path = nonRenpyWarningPath;
            setNonRenpyWarningPath(null);
            loadProject(path);
          }}
          onClose={() => setNonRenpyWarningPath(null)}
        >
          The selected folder doesn't appear to contain a Ren'Py project — no{' '}
          <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded text-sm">game/</code>{' '}
          folder or <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded text-sm">.rpy</code>{' '}
          files were found. You can still open it, but it may not work as expected.
        </ConfirmModal>
      )}

      {isLoading && <LoadingOverlay progress={loadingProgress} message={loadingMessage} onCancel={handleCancelLoad} />}
      
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col space-y-2 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast toast={toast} onDismiss={removeToast} />
          </div>
        ))}
      </div>

      <CreateBlockModal
        isOpen={createBlockModalOpen}
        onClose={() => setCreateBlockModalOpen(false)}
        onConfirm={(name, type) => handleCreateBlockConfirm(name, type, getSelectedFolderForNewBlock())}
        defaultPath={getSelectedFolderForNewBlock()}
      />

      <ConfigureRenpyModal
        isOpen={showConfigureRenpyModal}
        onClose={() => setShowConfigureRenpyModal(false)}
        onSave={(path) => {
            updateAppSettings(draft => { draft.renpyPath = path; });
            setShowConfigureRenpyModal(false);
            if (projectRootPath && window.electronAPI) {
                window.electronAPI.runGame(path, projectRootPath);
            }
        }}
      />

            {unsavedChangesModalInfo && (
                <ConfirmModal
                    title={unsavedChangesModalInfo.title}
                    onConfirm={unsavedChangesModalInfo.onConfirm}
                    onClose={unsavedChangesModalInfo.onCancel}
                    confirmText={unsavedChangesModalInfo.confirmText}
                    secondaryAction={{
                        onClick: unsavedChangesModalInfo.onDontSave,
                        label: unsavedChangesModalInfo.dontSaveText,
                        className: 'bg-red-600 hover:bg-red-700'
                    }}
                >
                        <div className="space-y-4">
                                <p>{unsavedChangesModalInfo.message}</p>
                        </div>
                </ConfirmModal>
            )}

      {deleteConfirmInfo && (
          <ConfirmModal
            title="Confirm Deletion"
            onConfirm={() => {
                deleteConfirmInfo.onConfirm();
                setDeleteConfirmInfo(null);
            }}
            onClose={() => setDeleteConfirmInfo(null)}
            confirmText="Delete"
            confirmClassName="bg-red-600 hover:bg-red-700"
          >
              Are you sure you want to delete {deleteConfirmInfo.paths.length} item(s)? This cannot be undone.
          </ConfirmModal>
      )}

      {contextMenuInfo && createPortal(
          <TabContextMenu
              x={contextMenuInfo.x}
              y={contextMenuInfo.y}
              tabId={contextMenuInfo.tabId}
              paneId={contextMenuInfo.paneId}
              splitLayout={splitLayout}
              onClose={() => setContextMenuInfo(null)}
              onCloseTab={(id) => handleCloseTab(id, contextMenuInfo.paneId)}
              onCloseOthers={(id) => handleCloseOthersRequest(id, contextMenuInfo.paneId)}
              onCloseLeft={(id) => handleCloseLeftRequest(id, contextMenuInfo.paneId)}
              onCloseRight={(id) => handleCloseRightRequest(id, contextMenuInfo.paneId)}
              onCloseAll={() => handleCloseAllRequest(contextMenuInfo.paneId)}
              onSplitRight={(id) => handleOpenInSplit(id, 'right')}
              onSplitBottom={(id) => handleOpenInSplit(id, 'bottom')}
              onMoveToOtherPane={(id) => handleMoveToOtherPane(id, contextMenuInfo.paneId)}
          />,
          document.body
      )}

      <SettingsModal 
        isOpen={settingsModalOpen} 
        onClose={() => setSettingsModalOpen(false)}
        settings={{ ...appSettings, ...projectSettings }}
        onSettingsChange={(key: keyof IdeSettings, value: any) => {
            if (key in appSettings) {
                updateAppSettings(draft => {
                    (draft as any)[key] = value;
                });
            } else {
                updateProjectSettings(draft => {
                    (draft as any)[key] = value;
                });
                setHasUnsavedSettings(true);
            }
        }}
        availableModels={AVAILABLE_MODELS}
      />

      <KeyboardShortcutsModal
        isOpen={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
        mouseGestures={appSettings.mouseGestures}
        onOpenSettings={() => { setShortcutsModalOpen(false); setSettingsModalOpen(true); }}
      />

      <AboutModal
        isOpen={aboutModalOpen}
        onClose={() => setAboutModalOpen(false)}
      />
    </div>
  );
};

export default App;