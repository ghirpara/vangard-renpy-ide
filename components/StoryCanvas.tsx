/**
 * @file StoryCanvas.tsx
 * @description Main visual canvas for editing Ren'Py projects.
 * Displays story blocks as draggable cards with connections between them (jumps/calls).
 * Supports pan, zoom, multi-select, grouping, sticky notes, minimap, and context menus.
 * Handles keyboard shortcuts (N=new, G=group, Delete=remove, etc.) and canvas interactions.
 */

import React, { useState, useRef, useCallback, useMemo, useEffect, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import CodeBlock from './CodeBlock';
import GroupContainer from './GroupContainer';
import StickyNote from './StickyNote';
import Minimap from './Minimap';
import CanvasContextMenu from './CanvasContextMenu';
import type { MinimapItem } from './Minimap';
import type { Block, Position, RenpyAnalysisResult, LabelLocation, BlockGroup, Link, StickyNote as StickyNoteType, MouseGestureSettings } from '../types';
import type { BlockType } from './CreateBlockModal';

interface StoryCanvasProps {
  blocks: Block[];
  groups: BlockGroup[];
  stickyNotes: StickyNoteType[];
  analysisResult: RenpyAnalysisResult;
  updateBlock: (id: string, newBlockData: Partial<Block>) => void;
  updateGroup: (id: string, newGroupData: Partial<BlockGroup>) => void;
  updateBlockPositions: (updates: { id: string, position: Position }[]) => void;
  updateGroupPositions: (updates: { id: string, position: Position }[]) => void;
  updateStickyNote: (id: string, data: Partial<StickyNoteType>) => void;
  deleteStickyNote: (id: string) => void;
  onInteractionEnd: () => void;
  deleteBlock: (id: string) => void;
  onOpenEditor: (id: string, line?: number) => void;
  selectedBlockIds: string[];
  setSelectedBlockIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  selectedGroupIds: string[];
  setSelectedGroupIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  findUsagesHighlightIds: Set<string> | null;
  clearFindUsages: () => void;
  dirtyBlockIds: Set<string>;
  canvasFilters: { story: boolean; screens: boolean; config: boolean; notes: boolean; minimap: boolean };
  setCanvasFilters: React.Dispatch<React.SetStateAction<{ story: boolean; screens: boolean; config: boolean; notes: boolean; minimap: boolean }>>;
  centerOnBlockRequest: { blockId: string, key: number } | null;
  flashBlockRequest: { blockId: string, key: number } | null;
  hoverHighlightIds: Set<string> | null;
  transform: { x: number, y: number, scale: number };
  onTransformChange: React.Dispatch<React.SetStateAction<{ x: number, y: number, scale: number }>>;
  onCreateBlock?: (type: BlockType, position: Position) => void;
  onAddStickyNote?: (position: Position) => void;
  mouseGestures?: MouseGestureSettings;
}

const getBlockById = (blocks: Block[], id: string) => blocks.find(b => b.id === id);
const getGroupById = (groups: BlockGroup[], id: string) => groups.find(g => g.id === id);
const getStickyNoteById = (notes: StickyNoteType[], id: string) => notes.find(n => n.id === id);

const getAttachmentPoint = (position: Position, width: number, height: number, side: 'left' | 'right' | 'top' | 'bottom'): Position => {
    switch(side) {
        case 'left': return { x: position.x, y: position.y + height / 2 };
        case 'right': return { x: position.x + width, y: position.y + height / 2 };
        case 'top': return { x: position.x + width / 2, y: position.y };
        case 'bottom': return { x: position.x + width / 2, y: position.y + height };
    }
}

const getOptimalPath = (
    sourcePos: Position, sourceW: number, sourceH: number, 
    targetPos: Position, targetW: number, targetH: number
): string => {
    const sourcePoints = {
        right: getAttachmentPoint(sourcePos, sourceW, sourceH, 'right'),
        left: getAttachmentPoint(sourcePos, sourceW, sourceH, 'left'),
        bottom: getAttachmentPoint(sourcePos, sourceW, sourceH, 'bottom'),
        top: getAttachmentPoint(sourcePos, sourceW, sourceH, 'top'),
    };
    const targetPoints = {
        left: getAttachmentPoint(targetPos, targetW, targetH, 'left'),
        right: getAttachmentPoint(targetPos, targetW, targetH, 'right'),
        top: getAttachmentPoint(targetPos, targetW, targetH, 'top'),
        bottom: getAttachmentPoint(targetPos, targetW, targetH, 'bottom'),
    };

    let bestPoints = [sourcePoints.right, targetPoints.left];
    let minDistance = Infinity;

    for (const sKey of Object.keys(sourcePoints) as Array<keyof typeof sourcePoints>) {
        for (const tKey of Object.keys(targetPoints) as Array<keyof typeof targetPoints>) {
            const dist = Math.hypot(sourcePoints[sKey].x - targetPoints[tKey].x, sourcePoints[sKey].y - targetPoints[tKey].y);
            if (dist < minDistance) {
                minDistance = dist;
                bestPoints = [sourcePoints[sKey], targetPoints[tKey]];
            }
        }
    }
    
    const [p1, p2] = bestPoints;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const controlX = p1.x + dx / 2 + (dy / 5);
    const controlY = p1.y + dy / 2 - (dx / 5);

    return `M${p1.x},${p1.y} Q${controlX},${controlY} ${p2.x},${p2.y}`;
};

const Arrow = forwardRef<SVGGElement, { 
  pathData: string;
  isDimmed: boolean;
  onHighlight: (startNodeId: string) => void;
  targetId: string;
}>(({ pathData, isDimmed, onHighlight, targetId }, ref) => {
    const handlePointerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
        onHighlight(targetId);
    };

    return (
        <g 
          ref={ref}
          className={`arrow-interaction-group transition-opacity duration-300 ${isDimmed ? 'opacity-20' : 'opacity-100'} pointer-events-auto`}
          onPointerDown={handlePointerDown}
        >
          <path
              d={pathData}
              stroke="transparent"
              strokeWidth="20"
              fill="none"
              className="cursor-pointer"
          />
          <path
              d={pathData}
              stroke="#4f46e5"
              strokeWidth="3"
              fill="none"
              markerEnd="url(#arrowhead)"
              className="pointer-events-none"
          />
        </g>
    );
});

interface Rect { x: number; y: number; width: number; height: number; }

const RubberBand: React.FC<{ rect: Rect }> = ({ rect }) => {
    if (!rect) return null;
    return (
        <div
            className="absolute border-2 border-indigo-500 bg-indigo-500 bg-opacity-20 pointer-events-none"
            style={{
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height,
            }}
        />
    );
};

type InteractionState = 
  | { type: 'idle' }
  | { type: 'panning'; }
  | { type: 'rubber-band'; start: Position; }
  | { 
      type: 'dragging-blocks'; 
      dragInitialPositions: Map<string, Position>; // id -> original x,y
      draggedLinks: Array<{ 
          key: string; 
          sourceId: string; 
          targetId: string; 
          sourceDim: { w: number, h: number }; 
          targetDim: { w: number, h: number };
      }>;
    }
  | { 
      type: 'dragging-groups'; 
      dragInitialPositions: Map<string, Position>; // includes both groups and blocks
      draggedLinks: Array<{ 
          key: string; 
          sourceId: string; 
          targetId: string; 
          sourceDim: { w: number, h: number }; 
          targetDim: { w: number, h: number };
      }>;
    }
  | { type: 'dragging-notes'; dragInitialPositions: Map<string, Position>; }
  | { type: 'resizing-block'; block: Block; }
  | { type: 'resizing-group'; group: BlockGroup; }
  | { type: 'resizing-note'; note: StickyNoteType; };

const StoryCanvas: React.FC<StoryCanvasProps> = ({ 
    blocks, groups, stickyNotes, analysisResult, 
    updateBlock, updateGroup, updateBlockPositions, updateGroupPositions, updateStickyNote, deleteStickyNote,
    onInteractionEnd, deleteBlock, onOpenEditor, 
    selectedBlockIds, setSelectedBlockIds, selectedGroupIds, setSelectedGroupIds, 
    findUsagesHighlightIds, clearFindUsages, dirtyBlockIds, 
    canvasFilters, setCanvasFilters, centerOnBlockRequest, flashBlockRequest, hoverHighlightIds, 
    transform, onTransformChange, onCreateBlock, onAddStickyNote, mouseGestures
}) => {
  const [rubberBandRect, setRubberBandRect] = useState<Rect | null>(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [canvasContextMenu, setCanvasContextMenu] = useState<{ x: number; y: number; worldPos: Position } | null>(null);
  
  // Refs for Imperative DOM updates
  const blockRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const groupRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const noteRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const arrowRefs = useRef<Map<string, SVGGElement>>(new Map());

  const [isDraggingSelection, setIsDraggingSelection] = useState(false);
  const [highlightedPath, setHighlightedPath] = useState<Set<string> | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const interactionState = useRef<InteractionState>({ type: 'idle' });
  const pointerStartPos = useRef<Position>({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const [flashingBlockId, setFlashingBlockId] = useState<string | null>(null);
  const lastHandledRequestKey = useRef<number | null>(null);
  const lastHandledFlashKey = useRef<number | null>(null);
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!canvasRef.current) return;
    const observer = new ResizeObserver(entries => {
        if (entries[0]) {
            const { width, height } = entries[0].contentRect;
            setCanvasDimensions({ width, height });
        }
    });
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!centerOnBlockRequest || !canvasRef.current) return;
    if (centerOnBlockRequest.key === lastHandledRequestKey.current) return;

    const { blockId } = centerOnBlockRequest;
    // Check blocks first
    const block = getBlockById(blocks, blockId);
    let targetX = 0;
    let targetY = 0;
    let found = false;

    if (block) {
        targetX = block.position.x + block.width / 2;
        targetY = block.position.y + block.height / 2;
        found = true;
    } else {
        // Fallback to check notes
        const note = getStickyNoteById(stickyNotes, blockId);
        if (note) {
            targetX = note.position.x + note.width / 2;
            targetY = note.position.y + note.height / 2;
            found = true;
            // Also select the note
            setSelectedNoteIds([blockId]);
            setSelectedBlockIds([]);
            setSelectedGroupIds([]);
        }
    }

    const canvasEl = canvasRef.current;

    if (found && canvasEl) {
        const canvasRect = canvasEl.getBoundingClientRect();
        const newX = (canvasRect.width / 2) - (targetX * transform.scale);
        const newY = (canvasRect.height / 2) - (targetY * transform.scale);
        
        onTransformChange(t => ({ ...t, x: newX, y: newY }));

        // Flash for visual feedback
        setFlashingBlockId(blockId);
        const timer = setTimeout(() => setFlashingBlockId(null), 1500);
        
        lastHandledRequestKey.current = centerOnBlockRequest.key;

        return () => clearTimeout(timer);
    }
  }, [centerOnBlockRequest, blocks, stickyNotes, transform.scale, onTransformChange, setSelectedNoteIds, setSelectedBlockIds, setSelectedGroupIds]);

  // Effect to handle flash requests without camera movement
  useEffect(() => {
    if (!flashBlockRequest) return;
    if (flashBlockRequest.key === lastHandledFlashKey.current) return;

    setFlashingBlockId(flashBlockRequest.blockId);
    const timer = setTimeout(() => setFlashingBlockId(null), 1500);
    lastHandledFlashKey.current = flashBlockRequest.key;

    return () => clearTimeout(timer);
  }, [flashBlockRequest]);

  const adjacencyMap = useMemo(() => {
    const adj = new Map<string, string[]>();
    blocks.forEach(b => adj.set(b.id, []));
    analysisResult.links.forEach(link => {
      if (adj.has(link.sourceId)) {
        adj.get(link.sourceId)!.push(link.targetId);
      }
    });
    return adj;
  }, [blocks, analysisResult.links]);

  const handleHighlightPath = useCallback((startNodeId: string) => {
    const path = new Set<string>([startNodeId]);
    const queue = [startNodeId];
    const visited = new Set<string>([startNodeId]);

    while (queue.length > 0) {
      const u = queue.shift()!;
      path.add(u);
      const neighbors = adjacencyMap.get(u) || [];
      for (const v of neighbors) {
        if (!visited.has(v)) {
          visited.add(v);
          queue.push(v);
        }
      }
    }

    let hasChanged = true;
    while(hasChanged) {
        hasChanged = false;
        for(const link of analysisResult.links) {
            if(path.has(link.targetId) && !path.has(link.sourceId)){
                path.add(link.sourceId);
                hasChanged = true;
            }
        }
    }

    setHighlightedPath(path);
  }, [adjacencyMap, analysisResult.links]);


  const getPointInWorldSpace = useCallback((clientX: number, clientY: number) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - transform.x) / transform.scale,
      y: (clientY - rect.top - transform.y) / transform.scale,
    };
  }, [transform.x, transform.y, transform.scale]);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only handle left click for interactions (drag/pan), or middle button when configured
    const gestures = mouseGestures ?? { canvasPanGesture: 'shift-drag' as const, middleMouseAlwaysPans: false, zoomScrollDirection: 'normal' as const, zoomScrollSensitivity: 1.0 };
    const isMiddlePan = (gestures.canvasPanGesture === 'middle-drag' || gestures.middleMouseAlwaysPans) && e.button === 1;
    if (e.button !== 0 && !isMiddlePan) return;
    
    // Close context menu if open
    if (canvasContextMenu) setCanvasContextMenu(null);

    const targetEl = e.target as HTMLElement;
    
    if (targetEl.closest('.arrow-interaction-group') || targetEl.closest('.filter-panel')) {
      return;
    }

    pointerStartPos.current = getPointInWorldSpace(e.clientX, e.clientY);
    
    const blockWrapper = targetEl.closest('.code-block-wrapper');
    const groupWrapper = targetEl.closest('.group-container-wrapper');
    const noteWrapper = targetEl.closest('.sticky-note-wrapper');

    const blockId = blockWrapper?.getAttribute('data-block-id');
    const groupId = groupWrapper?.getAttribute('data-group-id');
    const noteId = noteWrapper?.getAttribute('data-note-id');

    const block = blockId ? getBlockById(blocks, blockId) : null;
    const group = groupId ? getGroupById(groups, groupId) : null;
    const note = noteId ? getStickyNoteById(stickyNotes, noteId) : null;
    
    const canvasEl = e.currentTarget;

    if (note && noteId) {
        if (targetEl.closest('.resize-handle')) {
            interactionState.current = { type: 'resizing-note', note };
        } else if (targetEl.closest('.drag-handle') || targetEl.closest('.sticky-note-wrapper')) {
             if (targetEl.closest('.drag-handle')) {
                const currentSelection = selectedNoteIds.includes(noteId) ? selectedNoteIds : [noteId];
                const dragInitialPositions = new Map<string, Position>();
                
                stickyNotes.forEach(n => {
                    if (currentSelection.includes(n.id)) {
                        dragInitialPositions.set(n.id, { ...n.position });
                    }
                });
                interactionState.current = { type: 'dragging-notes', dragInitialPositions };
                setIsDraggingSelection(true);
             }
        }

        if (!targetEl.closest('button')) { // Don't select if clicking delete/color buttons
             if (e.shiftKey) {
                setSelectedNoteIds(prev => prev.includes(noteId) ? prev.filter(id => id !== noteId) : [...prev, noteId]);
            } else if (!selectedNoteIds.includes(noteId)) {
                setSelectedNoteIds([noteId]);
                setSelectedBlockIds([]);
                setSelectedGroupIds([]);
            }
        }
    } else if (block && blockId) {
        if (targetEl.closest('.resize-handle')) {
            interactionState.current = { type: 'resizing-block', block };
        } else if (targetEl.closest('.drag-handle') && !targetEl.closest('button, input')) {
            const currentSelection = selectedBlockIds.includes(blockId) ? selectedBlockIds : [blockId];
            
            const dragInitialPositions = new Map<string, Position>();
            const movingBlockIds = new Set<string>();

            blocks.forEach(b => {
                if (currentSelection.includes(b.id)) {
                    dragInitialPositions.set(b.id, { ...b.position });
                    movingBlockIds.add(b.id);
                }
            });

            // Pre-calculate affected links to optimize drag loop
            const draggedLinks = analysisResult.links.filter(link => 
                movingBlockIds.has(link.sourceId) || movingBlockIds.has(link.targetId)
            ).map(link => {
                const s = getBlockById(blocks, link.sourceId);
                const t = getBlockById(blocks, link.targetId);
                return {
                    key: `${link.sourceId}-${link.targetId}`,
                    sourceId: link.sourceId,
                    targetId: link.targetId,
                    sourceDim: s ? { w: s.width, h: s.height } : { w: 0, h: 0 },
                    targetDim: t ? { w: t.width, h: t.height } : { w: 0, h: 0 }
                };
            });

            interactionState.current = { type: 'dragging-blocks', dragInitialPositions, draggedLinks };
            setIsDraggingSelection(true);
        }

        if (e.shiftKey) {
            setSelectedBlockIds(prev => prev.includes(blockId) ? prev.filter(id => id !== blockId) : [...prev, blockId]);
        } else if (!selectedBlockIds.includes(blockId)) {
            setSelectedBlockIds([blockId]);
            setSelectedGroupIds([]);
            setSelectedNoteIds([]);
        }
    } else if (group && groupId) {
        if (targetEl.closest('.resize-handle')) {
            interactionState.current = { type: 'resizing-group', group };
        } else if (targetEl.closest('.drag-handle')) {
            const currentSelection = selectedGroupIds.includes(groupId) ? selectedGroupIds : [groupId];
            const dragInitialPositions = new Map<string, Position>();
            const movingIds = new Set<string>();

            currentSelection.forEach(id => {
              const g = getGroupById(groups, id);
              if (g) {
                dragInitialPositions.set(id, { ...g.position });
                g.blockIds.forEach(bId => {
                    const b = getBlockById(blocks, bId);
                    if(b) {
                        dragInitialPositions.set(bId, { ...b.position });
                        movingIds.add(bId);
                    }
                });
              }
            });
            
            const draggedLinks = analysisResult.links.filter(link => 
                movingIds.has(link.sourceId) || movingIds.has(link.targetId)
            ).map(link => {
                const s = getBlockById(blocks, link.sourceId);
                const t = getBlockById(blocks, link.targetId);
                return {
                    key: `${link.sourceId}-${link.targetId}`,
                    sourceId: link.sourceId,
                    targetId: link.targetId,
                    sourceDim: s ? { w: s.width, h: s.height } : { w: 0, h: 0 },
                    targetDim: t ? { w: t.width, h: t.height } : { w: 0, h: 0 }
                };
            });

            interactionState.current = { type: 'dragging-groups', dragInitialPositions, draggedLinks };
            setIsDraggingSelection(true);
        }

        if (e.shiftKey) {
            setSelectedGroupIds(prev => prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]);
        } else if (!selectedGroupIds.includes(groupId)) {
            setSelectedGroupIds([groupId]);
            setSelectedBlockIds([]);
            setSelectedNoteIds([]);
        }
    } else {
        const isPan =
            (gestures.canvasPanGesture === 'shift-drag' && e.shiftKey && e.button === 0) ||
            (gestures.canvasPanGesture === 'drag' && !e.shiftKey && e.button === 0) ||
            (gestures.canvasPanGesture === 'middle-drag' && e.button === 1) ||
            (gestures.middleMouseAlwaysPans && e.button === 1);
        if (isPan) {
            interactionState.current = { type: 'panning' };
        } else {
            interactionState.current = { type: 'rubber-band', start: pointerStartPos.current };
        }
        canvasEl.setPointerCapture(e.pointerId);
    }

    const handlePointerMove = (moveEvent: PointerEvent) => {
        const currentPos = getPointInWorldSpace(moveEvent.clientX, moveEvent.clientY);
        const dx = currentPos.x - pointerStartPos.current.x;
        const dy = currentPos.y - pointerStartPos.current.y;

        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        
        rafRef.current = requestAnimationFrame(() => {
            const state = interactionState.current;
            
            if (state.type === 'dragging-blocks' || state.type === 'dragging-groups') {
                const currentPositions = new Map<string, Position>();

                state.dragInitialPositions.forEach((startPos, id) => {
                    const newX = startPos.x + dx;
                    const newY = startPos.y + dy;
                    currentPositions.set(id, { x: newX, y: newY });

                    const blockEl = blockRefs.current.get(id);
                    if (blockEl) {
                        blockEl.style.left = `${newX}px`;
                        blockEl.style.top = `${newY}px`;
                    }
                    const groupEl = groupRefs.current.get(id);
                    if (groupEl) {
                        groupEl.style.left = `${newX}px`;
                        groupEl.style.top = `${newY}px`;
                    }
                });

                state.draggedLinks.forEach(link => {
                    const gEl = arrowRefs.current.get(link.key);
                    if (gEl) {
                        let sPos = currentPositions.get(link.sourceId);
                        if (!sPos) {
                            const b = getBlockById(blocks, link.sourceId);
                            if(b) sPos = b.position;
                        }

                        let tPos = currentPositions.get(link.targetId);
                        if (!tPos) {
                            const b = getBlockById(blocks, link.targetId);
                            if(b) tPos = b.position;
                        }

                        if (sPos && tPos) {
                            const newPath = getOptimalPath(
                                sPos, link.sourceDim.w, link.sourceDim.h,
                                tPos, link.targetDim.w, link.targetDim.h
                            );
                            const paths = gEl.querySelectorAll('path');
                            if (paths.length >= 2) {
                                paths[0].setAttribute('d', newPath);
                                paths[1].setAttribute('d', newPath);
                            }
                        }
                    }
                });

            } else if (state.type === 'dragging-notes') {
                state.dragInitialPositions.forEach((startPos, id) => {
                    const newX = startPos.x + dx;
                    const newY = startPos.y + dy;
                    const noteEl = noteRefs.current.get(id);
                    if (noteEl) {
                        noteEl.style.left = `${newX}px`;
                        noteEl.style.top = `${newY}px`;
                    }
                });
            } else if (state.type === 'resizing-block') {
                const { block } = state;
                updateBlock(block.id, {
                    width: Math.max(block.width + dx * transform.scale, 250),
                    height: Math.max(block.height + dy * transform.scale, 150),
                });
            } else if (state.type === 'resizing-group') {
                const { group } = state;
                updateGroup(group.id, {
                    width: Math.max(group.width + dx * transform.scale, 250),
                    height: Math.max(group.height + dy * transform.scale, 150),
                });
            } else if (state.type === 'resizing-note') {
                const { note } = state;
                updateStickyNote(note.id, {
                    width: Math.max(note.width + dx * transform.scale, 150),
                    height: Math.max(note.height + dy * transform.scale, 150),
                });
            } else if (state.type === 'panning') {
                onTransformChange(t => ({...t, x: t.x + moveEvent.movementX, y: t.y + moveEvent.movementY }));
            } else if (state.type === 'rubber-band') {
                const start = state.start;
                const x = Math.min(start.x, currentPos.x);
                const y = Math.min(start.y, currentPos.y);
                const width = Math.abs(start.x - currentPos.x);
                const height = Math.abs(start.y - currentPos.y);
                setRubberBandRect({ x, y, width, height });
            }
        });
    };
    
    const handlePointerUp = (upEvent: PointerEvent) => {
        const state = interactionState.current;
        const pointerEndPos = getPointInWorldSpace(upEvent.clientX, upEvent.clientY);
        const startPos = pointerStartPos.current;

        const dx = pointerEndPos.x - startPos.x;
        const dy = pointerEndPos.y - startPos.y;
        const distance = Math.hypot(dx, dy);

        if (state.type === 'rubber-band') {
            if (distance > 5) { // A drag occurred.
                const finalRect: Rect = {
                    x: Math.min(startPos.x, pointerEndPos.x),
                    y: Math.min(startPos.y, pointerEndPos.y),
                    width: Math.abs(dx),
                    height: Math.abs(dy),
                };

                 const selectedInRect = blocks.filter(b => 
                    b.position.x < finalRect.x + finalRect.width &&
                    b.position.x + b.width > finalRect.x &&
                    b.position.y < finalRect.y + finalRect.height &&
                    b.position.y + b.height > finalRect.y
                 ).map(b => b.id);
                
                const selectedGroupsInRect = groups.filter(g => 
                    g.position.x < finalRect.x + finalRect.width &&
                    g.position.x + g.width > finalRect.x &&
                    g.position.y < finalRect.y + finalRect.height &&
                    g.position.y + g.height > finalRect.y
                ).map(g => g.id);

                const selectedNotesInRect = stickyNotes.filter(n => 
                    n.position.x < finalRect.x + finalRect.width &&
                    n.position.x + n.width > finalRect.x &&
                    n.position.y < finalRect.y + finalRect.height &&
                    n.position.y + n.height > finalRect.y
                ).map(n => n.id);

                if (upEvent.shiftKey) {
                    setSelectedBlockIds(prev => [...new Set([...prev, ...selectedInRect])]);
                    setSelectedGroupIds(prev => [...new Set([...prev, ...selectedGroupsInRect])]);
                    setSelectedNoteIds(prev => [...new Set([...prev, ...selectedNotesInRect])]);
                } else {
                    setSelectedBlockIds(selectedInRect);
                    setSelectedGroupIds(selectedGroupsInRect);
                    setSelectedNoteIds(selectedNotesInRect);
                }
            } else { // It was a click, not a drag.
                setSelectedBlockIds([]);
                setSelectedGroupIds([]);
                setSelectedNoteIds([]);
                if (highlightedPath) setHighlightedPath(null);
                if (findUsagesHighlightIds) clearFindUsages();
                if (canvasContextMenu) setCanvasContextMenu(null);
            }
        }
        
        // Commit changes to React State
        if ((state.type === 'dragging-blocks' || state.type === 'dragging-groups' || state.type === 'dragging-notes') && distance > 0) {
            const blockUpdates: { id: string, position: Position }[] = [];
            const groupUpdates: { id: string, position: Position }[] = [];
            
            if (state.type === 'dragging-notes') {
                state.dragInitialPositions.forEach((startPos, id) => {
                    const newPos = { x: startPos.x + dx, y: startPos.y + dy };
                    updateStickyNote(id, { position: newPos });
                });
            } else {
                state.dragInitialPositions.forEach((startPos, id) => {
                    const newPos = { x: startPos.x + dx, y: startPos.y + dy };
                    if (getGroupById(groups, id)) {
                        groupUpdates.push({ id, position: newPos });
                    } else {
                        blockUpdates.push({ id, position: newPos });
                    }
                });

                if (blockUpdates.length > 0) updateBlockPositions(blockUpdates);
                if (groupUpdates.length > 0) updateGroupPositions(groupUpdates);
            }
        }
        
        const wasInteractiveMove = state.type === 'dragging-blocks' || 
                                 state.type === 'dragging-groups' || 
                                 state.type === 'dragging-notes' ||
                                 state.type === 'resizing-block' || 
                                 state.type === 'resizing-group' ||
                                 state.type === 'resizing-note';
        
        setIsDraggingSelection(false);
        if (wasInteractiveMove) onInteractionEnd();
        interactionState.current = { type: 'idle' };
        setRubberBandRect(null);
        if (canvasRef.current) canvasEl.releasePointerCapture(e.pointerId);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };
  
  const handleWheel = (e: React.WheelEvent) => {
    if (!canvasRef.current || (e.target as HTMLElement).closest('.filter-panel')) return;
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const gestures = mouseGestures ?? { canvasPanGesture: 'shift-drag' as const, middleMouseAlwaysPans: false, zoomScrollDirection: 'normal' as const, zoomScrollSensitivity: 1.0 };
    const sensitivity = gestures.zoomScrollSensitivity ?? 1.0;
    const direction = gestures.zoomScrollDirection === 'inverted' ? -1 : 1;
    onTransformChange(t => {
      const zoom = 1 - e.deltaY * 0.002 * sensitivity * direction;
      const newScale = Math.max(0.2, Math.min(3, t.scale * zoom));
      const worldX = (pointer.x - t.x) / t.scale;
      const worldY = (pointer.y - t.y) / t.scale;
      const newX = pointer.x - worldX * newScale;
      const newY = pointer.y - worldY * newScale;
      return { x: newX, y: newY, scale: newScale };
    });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      if ((e.target as HTMLElement).closest('.code-block-wrapper') || (e.target as HTMLElement).closest('.group-container-wrapper') || (e.target as HTMLElement).closest('.sticky-note-wrapper')) {
          return;
      }
      
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const worldX = (e.clientX - rect.left - transform.x) / transform.scale;
      const worldY = (e.clientY - rect.top - transform.y) / transform.scale;
      
      setCanvasContextMenu({
          x: e.clientX,
          y: e.clientY,
          worldPos: { x: worldX, y: worldY }
      });
  };

  const backgroundStyle = {
    backgroundSize: `${32 * transform.scale}px ${32 * transform.scale}px`,
    backgroundPosition: `${transform.x}px ${transform.y}px`,
  };
  
  const visibleBlocks = useMemo(() => {
    return blocks.filter(block => {
        const isStory = analysisResult.storyBlockIds.has(block.id);
        const isScreen = analysisResult.screenOnlyBlockIds.has(block.id);
        const isConfig = analysisResult.configBlockIds.has(block.id);

        if (isStory && canvasFilters.story) return true;
        if (isScreen && canvasFilters.screens) return true;
        if (isConfig && canvasFilters.config) return true;
        return false;
    });
  }, [blocks, canvasFilters, analysisResult]);

  const visibleBlockIds = useMemo(() => new Set(visibleBlocks.map(b => b.id)), [visibleBlocks]);

  const visibleLinks = useMemo(() => {
      return analysisResult.links.filter(link => 
          visibleBlockIds.has(link.sourceId) && visibleBlockIds.has(link.targetId)
      );
  }, [analysisResult.links, visibleBlockIds]);

  const svgBounds = useMemo(() => {
    if (visibleBlocks.length === 0) {
      return { top: 0, left: 0, width: 0, height: 0 };
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    visibleBlocks.forEach(block => {
      minX = Math.min(minX, block.position.x);
      minY = Math.min(minY, block.position.y);
      maxX = Math.max(maxX, block.position.x + block.width);
      maxY = Math.max(maxY, block.position.y + block.height);
    });

    const PADDING = 200;

    return {
      left: minX - PADDING,
      top: minY - PADDING,
      width: (maxX - minX) + PADDING * 2,
      height: (maxY - minY) + PADDING * 2,
    };
  }, [visibleBlocks]);

  const minimapItems = useMemo((): MinimapItem[] => {
    const blockItems: MinimapItem[] = visibleBlocks.map(b => {
        const isScreen = analysisResult.screenOnlyBlockIds.has(b.id);
        const isConfig = analysisResult.configBlockIds.has(b.id);
        let type: MinimapItem['type'] = 'block';
        if (isScreen) type = 'screen';
        if (isConfig) type = 'config';
        return { 
            id: b.id, 
            position: b.position, 
            width: b.width, 
            height: b.height, 
            type 
        };
    });
    const groupItems: MinimapItem[] = groups.map(g => ({ ...g, type: 'group', width: g.width, height: g.height }));
    const noteItems: MinimapItem[] = canvasFilters.notes ? stickyNotes.map(n => ({ ...n, type: 'note' })) : [];
    return [...blockItems, ...groupItems, ...noteItems];
  }, [visibleBlocks, groups, stickyNotes, canvasFilters.notes, analysisResult]);

  return (
    <div
      ref={canvasRef}
      className="absolute inset-0 overflow-hidden cursor-grab active:cursor-grabbing bg-primary bg-[radial-gradient(var(--dot-color)_1px,transparent_1px)]"
      style={backgroundStyle}
      onPointerDown={handlePointerDown}
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
    >
        {blocks.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="bg-secondary border border-primary rounded-xl shadow-xl p-8 max-w-sm text-center pointer-events-auto">
            <div className="text-4xl mb-3">📄</div>
            <h3 className="text-lg font-bold text-primary mb-1">Canvas is empty</h3>
            <p className="text-sm text-secondary mb-4">Create your first script block to get started.</p>
            <div className="text-xs text-secondary space-y-1 text-left bg-primary/5 rounded-lg p-3 mb-2">
              <div><kbd className="font-mono bg-primary/10 px-1 rounded">N</kbd> — New block</div>
              <div><kbd className="font-mono bg-primary/10 px-1 rounded">Shift</kbd> + drag — Pan canvas</div>
              <div><kbd className="font-mono bg-primary/10 px-1 rounded">Scroll</kbd> — Zoom in / out</div>
              <div><kbd className="font-mono bg-primary/10 px-1 rounded">G</kbd> — Group selected blocks</div>
            </div>
          </div>
        </div>
      )}
      <div className="filter-panel absolute top-4 right-4 z-20 bg-secondary p-2 rounded-lg shadow-lg border border-primary flex flex-col space-y-2">
            <h4 className="text-sm font-semibold text-center px-2 text-primary">View Filters</h4>
            <label className="flex items-center space-x-2 cursor-pointer text-sm text-secondary">
                <input type="checkbox" checked={canvasFilters.story} onChange={e => setCanvasFilters(f => ({ ...f, story: e.target.checked }))} className="h-4 w-4 rounded focus:ring-indigo-500" style={{ accentColor: 'rgb(79 70 229)' }} />
                <span>Story Blocks</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer text-sm text-secondary">
                <input type="checkbox" checked={canvasFilters.screens} onChange={e => setCanvasFilters(f => ({ ...f, screens: e.target.checked }))} className="h-4 w-4 rounded focus:ring-teal-500" style={{ accentColor: 'rgb(13 148 136)' }} />
                <span>Screen Blocks</span>
            </label>
             <label className="flex items-center space-x-2 cursor-pointer text-sm text-secondary">
                <input type="checkbox" checked={canvasFilters.config} onChange={e => setCanvasFilters(f => ({ ...f, config: e.target.checked }))} className="h-4 w-4 rounded focus:ring-red-500" style={{ accentColor: 'rgb(239 68 68)' }} />
                <span>Config Blocks</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer text-sm text-secondary">
                <input type="checkbox" checked={canvasFilters.notes} onChange={e => setCanvasFilters(f => ({ ...f, notes: e.target.checked }))} className="h-4 w-4 rounded focus:ring-yellow-500" style={{ accentColor: 'rgb(234 179 8)' }} />
                <span>Notes</span>
            </label>
            <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
            <label className="flex items-center space-x-2 cursor-pointer text-sm text-secondary">
                <input type="checkbox" checked={canvasFilters.minimap} onChange={e => setCanvasFilters(f => ({ ...f, minimap: e.target.checked }))} className="h-4 w-4 rounded" style={{ accentColor: 'rgb(107 114 128)' }} />
                <span>Minimap</span>
            </label>
        </div>

      <div
        className="absolute top-0 left-0"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: '0 0',
        }}
      >
        <svg 
          className="absolute pointer-events-none"
          style={{
            left: svgBounds.left,
            top: svgBounds.top,
            width: svgBounds.width,
            height: svgBounds.height,
          }}
        >
          <defs>
            <marker
              id="arrowhead"
              viewBox="-14 0 14 10"
              markerWidth="14"
              markerHeight="10"
              refX="0"
              refY="5"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <polygon points="-14 0, 0 5, -14 10" fill="#4f46e5" />
            </marker>
          </defs>
          <g transform={`translate(${-svgBounds.left}, ${-svgBounds.top})`}>
            {visibleLinks.map((link, index) => {
              const sourceBlock = getBlockById(blocks, link.sourceId);
              const targetBlock = getBlockById(blocks, link.targetId);
              if (!sourceBlock || !targetBlock) return null;
              
              const pathData = getOptimalPath(
                  sourceBlock.position, sourceBlock.width, sourceBlock.height,
                  targetBlock.position, targetBlock.width, targetBlock.height
              );
              
              const isDimmed = highlightedPath !== null && (!highlightedPath.has(link.sourceId) || !highlightedPath.has(link.targetId));
              const linkKey = `${link.sourceId}-${link.targetId}`;

              return (
                <Arrow 
                    key={linkKey} 
                    ref={(el) => {
                        if (el) arrowRefs.current.set(linkKey, el);
                        else arrowRefs.current.delete(linkKey);
                    }}
                    pathData={pathData} 
                    isDimmed={isDimmed} 
                    onHighlight={handleHighlightPath}
                    targetId={link.targetId}
                />
              );
            })}
          </g>
        </svg>

        {rubberBandRect && <RubberBand rect={rubberBandRect} />}

        {groups.map((group) => {
          const isDimmed = highlightedPath !== null && !group.blockIds.some(id => highlightedPath.has(id));
          return (
            <GroupContainer
              key={group.id}
              ref={(el) => {
                  if (el) groupRefs.current.set(group.id, el);
                  else groupRefs.current.delete(group.id);
              }}
              group={group}
              updateGroup={updateGroup}
              isSelected={selectedGroupIds.includes(group.id)}
              isDragging={isDraggingSelection && selectedGroupIds.includes(group.id)}
              isDimmed={isDimmed}
            />
          );
        })}

        {visibleBlocks.map((block) => {
          const isDimmed = (highlightedPath !== null && !highlightedPath.has(block.id)) || 
                          (findUsagesHighlightIds !== null && !findUsagesHighlightIds.has(block.id));
          const isUsageHighlighted = findUsagesHighlightIds?.has(block.id) ?? false;
          const isHoverHighlighted = hoverHighlightIds?.has(block.id) ?? false;
          const isScreenBlock = analysisResult.screenOnlyBlockIds.has(block.id);
          const isConfigBlock = analysisResult.configBlockIds.has(block.id);
          return (
            <CodeBlock
              key={block.id}
              ref={(el) => {
                  if (el) blockRefs.current.set(block.id, el);
                  else blockRefs.current.delete(block.id);
              }}
              block={block}
              analysisResult={analysisResult}
              updateBlock={updateBlock}
              deleteBlock={deleteBlock}
              onOpenEditor={onOpenEditor}
              isSelected={selectedBlockIds.includes(block.id)}
              isDragging={isDraggingSelection && selectedBlockIds.includes(block.id)}
              isRoot={analysisResult.rootBlockIds.has(block.id)}
              isLeaf={analysisResult.leafBlockIds.has(block.id)}
              isBranching={analysisResult.branchingBlockIds.has(block.id)}
              isDimmed={isDimmed}
              isUsageHighlighted={isUsageHighlighted}
              isHoverHighlighted={isHoverHighlighted}
              isDirty={dirtyBlockIds.has(block.id)}
              isScreenBlock={isScreenBlock}
              isConfigBlock={isConfigBlock}
              isFlashing={flashingBlockId === block.id}
            />
          );
        })}

        {canvasFilters.notes && stickyNotes.map((note) => (
            <StickyNote
                key={note.id}
                ref={(el) => {
                    if(el) noteRefs.current.set(note.id, el);
                    else noteRefs.current.delete(note.id);
                }}
                note={note}
                updateNote={updateStickyNote}
                deleteNote={deleteStickyNote}
                isSelected={selectedNoteIds.includes(note.id)}
                isDragging={isDraggingSelection && selectedNoteIds.includes(note.id)}
            />
        ))}
      </div>
      {canvasFilters.minimap && (
        <Minimap
          items={minimapItems}
          transform={transform}
          canvasDimensions={canvasDimensions}
          onTransformChange={onTransformChange}
        />
      )}
      
      {canvasContextMenu && onCreateBlock && onAddStickyNote && (
        <CanvasContextMenu
            x={canvasContextMenu.x}
            y={canvasContextMenu.y}
            onClose={() => setCanvasContextMenu(null)}
            onCreateBlock={(type) => onCreateBlock(type, canvasContextMenu.worldPos)}
            onAddStickyNote={() => onAddStickyNote(canvasContextMenu.worldPos)}
        />
      )}
    </div>
  );
};

export default StoryCanvas;
