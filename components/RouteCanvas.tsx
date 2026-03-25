/**
 * @file RouteCanvas.tsx
 * @description Label-by-label narrative flow visualization (521 lines).
 * Shows each label as a node and traces execution paths through the story.
 * Displays different routes in different colors for visual analysis of story paths.
 * Supports pan, zoom, drag labels, and navigation to editor.
 * Uses graph layout algorithm to arrange nodes without overlap.
 */

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import LabelBlock from './LabelBlock';
import ViewRoutesPanel from './ViewRoutesPanel';
import Minimap from './Minimap';
import type { MinimapItem } from './Minimap';
import type { LabelNode, RouteLink, Position, IdentifiedRoute, MouseGestureSettings } from '../types';

interface RouteCanvasProps {
  labelNodes: LabelNode[];
  routeLinks: RouteLink[];
  identifiedRoutes: IdentifiedRoute[];
  updateLabelNodePositions: (updates: { id: string, position: Position }[]) => void;
  onOpenEditor: (blockId: string, line: number) => void;
  transform: { x: number, y: number, scale: number };
  onTransformChange: React.Dispatch<React.SetStateAction<{ x: number, y: number, scale: number }>>;
  mouseGestures?: MouseGestureSettings;
}

interface Rect { x: number; y: number; width: number; height: number; }

interface MenuPopoverChoice {
  choiceText: string;
  choiceCondition?: string;
  targetLabel: string;
  sourceLine?: number;
  blockId: string;
}

interface ActivePopover {
  sourceLabel: string;
  menuLine: number;
  choices: MenuPopoverChoice[];
  x: number;
  y: number;
}

const getAttachmentPoint = (node: LabelNode, side: 'left' | 'right' | 'top' | 'bottom'): Position => {
    switch(side) {
        case 'left': return { x: node.position.x, y: node.position.y + node.height / 2 };
        case 'right': return { x: node.position.x + node.width, y: node.position.y + node.height / 2 };
        case 'top': return { x: node.position.x + node.width / 2, y: node.position.y };
        case 'bottom': return { x: node.position.x + node.width / 2, y: node.position.y + node.height };
    }
}

const getOptimalPath = (sourceNode: LabelNode, targetNode: LabelNode): [Position, Position] => {
    // If predominantly vertical alignment, prefer top/bottom connections
    const isVertical = Math.abs(targetNode.position.y - sourceNode.position.y) > Math.abs(targetNode.position.x - sourceNode.position.x);

    let sourcePoints, targetPoints;

    if (isVertical) {
        sourcePoints = {
            bottom: getAttachmentPoint(sourceNode, 'bottom'),
            top: getAttachmentPoint(sourceNode, 'top'),
        };
        targetPoints = {
            top: getAttachmentPoint(targetNode, 'top'),
            bottom: getAttachmentPoint(targetNode, 'bottom'),
        };
    } else {
        sourcePoints = {
            right: getAttachmentPoint(sourceNode, 'right'),
            left: getAttachmentPoint(sourceNode, 'left'),
        };
        targetPoints = {
            left: getAttachmentPoint(targetNode, 'left'),
            right: getAttachmentPoint(targetNode, 'right'),
        };
    }

    let bestPath: [Position, Position] | null = null;
    let minDistance = Infinity;

    for (const sKey of Object.keys(sourcePoints)) {
        for (const tKey of Object.keys(targetPoints)) {
            // @ts-expect-error — dynamic key access on typed object
            const p1 = sourcePoints[sKey];
            // @ts-expect-error — dynamic key access on typed object
            const p2 = targetPoints[tKey];
            const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
            
            // Penalize "backward" links slightly to encourage flow
            let penalty = 0;
            if (!isVertical && p1.x > p2.x) penalty = 100;
            if (isVertical && p1.y > p2.y) penalty = 100;

            if (dist + penalty < minDistance) {
                minDistance = dist + penalty;
                bestPath = [p1, p2];
            }
        }
    }
    
    // Fallback if something went wrong
    if (!bestPath) {
        return [getAttachmentPoint(sourceNode, 'right'), getAttachmentPoint(targetNode, 'left')];
    }

    return bestPath;
};

const Arrow: React.FC<{
  sourcePos: Position;
  targetPos: Position;
  type: RouteLink['type'];
  color: string;
  isDimmed: boolean;
}> = ({ sourcePos, targetPos, type, color, isDimmed }) => {
    const isVertical = Math.abs(targetPos.y - sourcePos.y) > Math.abs(targetPos.x - sourcePos.x);

    let pathData: string;

    if (isVertical) {
        const dy = targetPos.y - sourcePos.y;
        const midY = sourcePos.y + dy / 2;
        pathData = `M${sourcePos.x},${sourcePos.y} C${sourcePos.x},${midY} ${targetPos.x},${midY} ${targetPos.x},${targetPos.y}`;
    } else {
        const dx = targetPos.x - sourcePos.x;
        const midX = sourcePos.x + dx / 2;
        pathData = `M${sourcePos.x},${sourcePos.y} C${midX},${sourcePos.y} ${midX},${targetPos.y} ${targetPos.x},${targetPos.y}`;
    }

    return (
        <g className={`pointer-events-none transition-opacity duration-300 ${isDimmed ? 'opacity-20' : 'opacity-100'}`}>
          <path
              d={pathData}
              stroke={color}
              strokeWidth="4"
              fill="none"
              strokeDasharray={type === 'implicit' ? "10, 6" : "none"}
              markerEnd={`url(#arrowhead-${color.replace('#', '')})`}
          />
        </g>
    );
};

const MenuPill: React.FC<{
  cx: number;
  cy: number;
  count: number;
  color: string;
  onClick: (e: React.MouseEvent<SVGGElement>) => void;
}> = ({ cx, cy, count, color, onClick }) => {
  const R = 11;
  return (
    <g
      style={{ pointerEvents: 'auto', cursor: 'pointer' }}
      onPointerDown={e => e.stopPropagation()}
      onClick={onClick}
    >
      <circle cx={cx} cy={cy} r={R + 4} fill="transparent" />
      <circle cx={cx} cy={cy} r={R} fill={color} opacity={0.95} />
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="white" strokeWidth={1.5} opacity={0.4} />
      <text
        x={cx} y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={10}
        fontFamily="sans-serif"
        fontWeight="700"
        fill="white"
      >
        {count > 9 ? '9+' : count}
      </text>
    </g>
  );
};

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

// Container for grouping labels visually
const BlockContainer: React.FC<{ 
    id: string; 
    title: string; 
    rect: Rect; 
    isDimmed: boolean; 
}> = ({ id: _id, title, rect, isDimmed }) => {
    // Add padding to the visual box
    const padding = 20;
    const x = rect.x - padding;
    const y = rect.y - padding - 30; // Extra top space for title
    const width = rect.width + padding * 2;
    const height = rect.height + padding * 2 + 30;

    return (
        <div 
            className={`absolute rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 transition-opacity duration-300 pointer-events-none ${isDimmed ? 'opacity-30' : 'opacity-100'}`}
            style={{
                left: x,
                top: y,
                width: width,
                height: height,
                zIndex: 1, // Behind connections (in SVG) and nodes
            }}
        >
            <div className="absolute top-2 left-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider truncate max-w-[90%]">
                {title}
            </div>
        </div>
    );
};

const MenuPopover: React.FC<{
  popover: ActivePopover;
  onClose: () => void;
  onOpenEditor: (blockId: string, line: number) => void;
}> = ({ popover, onClose, onOpenEditor }) => {
  const { sourceLabel, menuLine, choices, x, y } = popover;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const firstChoice = choices[0];

  return (
    <div
      className="absolute z-50 w-72 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl text-sm"
      style={{ left: x, top: y }}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <div className="px-3 py-2.5 flex items-center gap-2 border-b border-gray-100 dark:border-gray-700">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Menu</span>
        <span className="font-mono text-xs text-indigo-600 dark:text-indigo-400 truncate flex-1">{sourceLabel}</span>
        <button
          className="shrink-0 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          onClick={onClose}
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
      <ul className="divide-y divide-gray-100 dark:divide-gray-700 max-h-64 overflow-y-auto">
        {choices.map((choice, i) => (
          <li key={i} className="px-3 py-2">
            <div className="flex items-start gap-2">
              <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-gray-900 dark:text-gray-100 leading-snug break-words">
                  &ldquo;{choice.choiceText}&rdquo;
                </p>
                {choice.choiceCondition && (
                  <span className="mt-1 text-xs font-mono text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 rounded px-1 py-px inline-block">
                    if {choice.choiceCondition}
                  </span>
                )}
                <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                  → <span className="font-mono text-indigo-500 dark:text-indigo-400">{choice.targetLabel}</span>
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {firstChoice && (
        <>
          <div className="border-t border-gray-100 dark:border-gray-700" />
          <div className="px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-gray-400 dark:text-gray-500">line {menuLine}</span>
            <button
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:underline"
              onClick={() => { onOpenEditor(firstChoice.blockId, menuLine); onClose(); }}
            >
              Open in editor ↗
            </button>
          </div>
        </>
      )}
    </div>
  );
};

type InteractionState =
  | { type: 'idle' }
  | { type: 'panning'; }
  | { type: 'rubber-band'; start: Position; }
  | { type: 'dragging-nodes'; dragStartPositions: Map<string, Position>; };

const RouteCanvas: React.FC<RouteCanvasProps> = ({ labelNodes, routeLinks, identifiedRoutes, updateLabelNodePositions, onOpenEditor, transform, onTransformChange, mouseGestures }) => {
  const [rubberBandRect, setRubberBandRect] = useState<Rect | null>(null);
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [checkedRoutes, setCheckedRoutes] = useState(new Set<number>());
  const [activePopover, setActivePopover] = useState<ActivePopover | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  
  const canvasRef = useRef<HTMLDivElement>(null);
  const interactionState = useRef<InteractionState>({ type: 'idle' });
  const pointerStartPos = useRef<Position>({ x: 0, y: 0 });
  const nodeMap = useMemo(() => new Map(labelNodes.map(n => [n.id, n])), [labelNodes]);
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 });

  // Derive start→end label names for each identified route
  const routeLabels = useMemo(() => {
    const map = new Map<number, { startLabel: string; endLabel: string }>();
    const toLabel = (id: string) => nodeMap.get(id)?.label ?? id.split(':').slice(1).join(':');
    identifiedRoutes.forEach(route => {
      const links = routeLinks.filter(l => route.linkIds.has(l.id));
      if (links.length === 0) return;
      const sourceIds = new Set(links.map(l => l.sourceId));
      const targetIds = new Set(links.map(l => l.targetId));
      const startCandidates = [...sourceIds].filter(id => !targetIds.has(id));
      const endCandidates = [...targetIds].filter(id => !sourceIds.has(id));
      const startLabel = startCandidates.length > 0 ? toLabel(startCandidates[0]) : toLabel(links[0].sourceId);
      const endLabel = endCandidates.length > 0 ? toLabel(endCandidates[endCandidates.length - 1]) : toLabel(links[links.length - 1].targetId);
      map.set(route.id, { startLabel, endLabel });
    });
    return map;
  }, [identifiedRoutes, routeLinks, nodeMap]);

  // Entry nodes: no other label jumps to them
  const entryNodeIds = useMemo(() => {
    const targeted = new Set(routeLinks.map(l => l.targetId));
    return new Set(labelNodes.filter(n => !targeted.has(n.id)).map(n => n.id));
  }, [routeLinks, labelNodes]);

  // Dead-end nodes: no outgoing jumps from them
  const deadEndNodeIds = useMemo(() => {
    const sourced = new Set(routeLinks.map(l => l.sourceId));
    return new Set(labelNodes.filter(n => !sourced.has(n.id)).map(n => n.id));
  }, [routeLinks, labelNodes]);

  const fitToScreen = useCallback(() => {
    if (labelNodes.length === 0 || !canvasRef.current) return;
    const { width: cw, height: ch } = canvasRef.current.getBoundingClientRect();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    labelNodes.forEach(n => {
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + n.width);
      maxY = Math.max(maxY, n.position.y + n.height);
    });
    const PAD = 80;
    const scale = Math.min((cw - PAD * 2) / (maxX - minX), (ch - PAD * 2) / (maxY - minY), 2);
    const tx = (cw - (maxX - minX) * scale) / 2 - minX * scale;
    const ty = (ch - (maxY - minY) * scale) / 2 - minY * scale;
    onTransformChange({ x: tx, y: ty, scale });
  }, [labelNodes, onTransformChange]);

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
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'f' || e.key === 'F') fitToScreen();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fitToScreen]);

  const handleToggleRoute = (routeId: number) => {
    setCheckedRoutes(prev => {
        const newSet = new Set(prev);
        if (newSet.has(routeId)) {
            newSet.delete(routeId);
        } else {
            newSet.add(routeId);
        }
        return newSet;
    });
  };

  const linkColors = useMemo(() => {
    if (checkedRoutes.size === 0) return null;

    const colorMap = new Map<string, string>();
    identifiedRoutes.forEach(route => {
        if (checkedRoutes.has(route.id)) {
            route.linkIds.forEach(linkId => {
                if (!colorMap.has(linkId)) { // First checked route containing the link wins
                    colorMap.set(linkId, route.color);
                }
            });
        }
    });
    return colorMap;
  }, [checkedRoutes, identifiedRoutes]);

  // Group visible choice links by (sourceId, menuLine) for per-menu pills
  const menuGroups = useMemo(() => {
    const groups = new Map<string, { links: RouteLink[]; sourcePos: Position }[]>();
    routeLinks.forEach(link => {
      if (!link.choiceText || link.menuLine === undefined) return;
      if (linkColors && !linkColors.has(link.id)) return; // only show when route is highlighted
      const sourceNode = nodeMap.get(link.sourceId);
      const targetNode = nodeMap.get(link.targetId);
      if (!sourceNode || !targetNode) return;
      const [srcPos] = getOptimalPath(sourceNode, targetNode);
      const key = `${link.sourceId}::${link.menuLine}`;
      const existing = groups.get(key);
      if (existing) {
        existing[0].links.push(link);
        existing[0].sourcePos = {
          x: (existing[0].sourcePos.x * (existing[0].links.length - 1) + srcPos.x) / existing[0].links.length,
          y: (existing[0].sourcePos.y * (existing[0].links.length - 1) + srcPos.y) / existing[0].links.length,
        };
      } else {
        groups.set(key, [{ links: [link], sourcePos: srcPos }]);
      }
    });
    return groups;
  }, [routeLinks, linkColors, nodeMap]);

  const handleMenuPillClick = useCallback((e: React.MouseEvent<SVGGElement>, groupKey: string) => {
    e.stopPropagation();
    if (!canvasRef.current) return;
    const group = menuGroups.get(groupKey);
    if (!group) return;
    const { links } = group[0];
    const firstLink = links[0];

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const clickX = e.clientX - canvasRect.left;
    const clickY = e.clientY - canvasRect.top;

    const POPOVER_W = 288; // w-72
    const POPOVER_H = 80 + links.length * 56; // approximate

    let px = clickX + 12;
    let py = clickY - POPOVER_H - 8;
    if (px + POPOVER_W > canvasRect.width - 8) px = clickX - POPOVER_W - 12;
    if (py < 8) py = clickY + 12;

    const sourceLabel = nodeMap.get(firstLink.sourceId)?.label ?? firstLink.sourceId.split(':').slice(1).join(':');
    const choices: MenuPopoverChoice[] = links.map(link => ({
      choiceText: link.choiceText!,
      choiceCondition: link.choiceCondition,
      targetLabel: nodeMap.get(link.targetId)?.label ?? link.targetId.split(':').slice(1).join(':'),
      sourceLine: link.sourceLine,
      blockId: link.sourceId.split(':')[0],
    }));

    setActivePopover({ sourceLabel, menuLine: firstLink.menuLine!, choices, x: px, y: py });
  }, [canvasRef, menuGroups, nodeMap]);

  // Compute Group Bounding Boxes
  const blockGroups = useMemo(() => {
      const groups = new Map<string, { id: string, title: string, rect: Rect }>();
      
      labelNodes.forEach(node => {
          if (!groups.has(node.blockId)) {
              groups.set(node.blockId, {
                  id: node.blockId,
                  title: node.containerName || 'Block',
                  rect: { x: node.position.x, y: node.position.y, width: node.width, height: node.height }
              });
          } else {
              const group = groups.get(node.blockId)!;
              const minX = Math.min(group.rect.x, node.position.x);
              const minY = Math.min(group.rect.y, node.position.y);
              const maxX = Math.max(group.rect.x + group.rect.width, node.position.x + node.width);
              const maxY = Math.max(group.rect.y + group.rect.height, node.position.y + node.height);
              
              group.rect = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
          }
      });
      return Array.from(groups.values());
  }, [labelNodes]);

  const getPointInWorldSpace = useCallback((clientX: number, clientY: number) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - transform.x) / transform.scale,
      y: (clientY - rect.top - transform.y) / transform.scale,
    };
  }, [transform.x, transform.y, transform.scale]);

  const handlePointerDown = (e: React.PointerEvent) => {
    const gestures = mouseGestures ?? { canvasPanGesture: 'shift-drag' as const, middleMouseAlwaysPans: false, zoomScrollDirection: 'normal' as const, zoomScrollSensitivity: 1.0 };
    const isMiddlePan = (gestures.canvasPanGesture === 'middle-drag' || gestures.middleMouseAlwaysPans) && e.button === 1;
    if (e.button !== 0 && !isMiddlePan) return;
    const targetEl = e.target as HTMLElement;

    // Prevent canvas interactions when interacting with the panel
    if (targetEl.closest('.view-routes-panel')) {
        return;
    }
    
    pointerStartPos.current = getPointInWorldSpace(e.clientX, e.clientY);
    
    const nodeWrapper = (e.target as HTMLElement).closest('.label-block-wrapper');
    const nodeId = nodeWrapper?.getAttribute('data-label-node-id');
    const canvasEl = e.currentTarget;

    if (nodeId && nodeMap.has(nodeId)) {
        const currentSelection = selectedNodeIds.includes(nodeId) ? selectedNodeIds : [nodeId];
        const dragStartPositions = new Map<string, Position>();
        currentSelection.forEach(id => {
            const node = nodeMap.get(id);
            if (node) dragStartPositions.set(id, node.position);
        });
        interactionState.current = { type: 'dragging-nodes', dragStartPositions };
        setIsDraggingSelection(true);

        if (e.shiftKey) {
            setSelectedNodeIds(prev => prev.includes(nodeId) ? prev.filter(id => id !== nodeId) : [...prev, nodeId]);
        } else if (!selectedNodeIds.includes(nodeId)) {
            setSelectedNodeIds([nodeId]);
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

        switch(interactionState.current.type) {
            case 'dragging-nodes': {
                const updates = Array.from(interactionState.current.dragStartPositions.entries()).map(([id, startPos]) => ({
                    id,
                    position: { x: startPos.x + dx, y: startPos.y + dy }
                }));
                updateLabelNodePositions(updates);
                break;
            }
            case 'panning': {
                onTransformChange(t => ({...t, x: t.x + moveEvent.movementX, y: t.y + moveEvent.movementY }));
                break;
            }
            case 'rubber-band': {
                const start = interactionState.current.start;
                const x = Math.min(start.x, currentPos.x);
                const y = Math.min(start.y, currentPos.y);
                const width = Math.abs(start.x - currentPos.x);
                const height = Math.abs(start.y - currentPos.y);
                setRubberBandRect({ x, y, width, height });
                break;
            }
        }
    };
    
    const handlePointerUp = (upEvent: PointerEvent) => {
        const state = interactionState.current;
        const pointerEndPos = getPointInWorldSpace(upEvent.clientX, upEvent.clientY);
        const startPos = pointerStartPos.current;

        const dx = pointerEndPos.x - startPos.x;
        const dy = pointerEndPos.y - startPos.y;
        const distance = Math.hypot(dx, dy);

        if (state.type === 'rubber-band') {
            if (distance > 5) {
                const finalRect: Rect = {
                    x: Math.min(startPos.x, pointerEndPos.x),
                    y: Math.min(startPos.y, pointerEndPos.y),
                    width: Math.abs(dx),
                    height: Math.abs(dy),
                };

                 const selectedInRect = labelNodes.filter(n => 
                    n.position.x < finalRect.x + finalRect.width &&
                    n.position.x + n.width > finalRect.x &&
                    n.position.y < finalRect.y + finalRect.height &&
                    n.position.y + n.height > finalRect.y
                ).map(n => n.id);
                
                if (upEvent.shiftKey) {
                    setSelectedNodeIds(prev => [...new Set([...prev, ...selectedInRect])]);
                } else {
                    setSelectedNodeIds(selectedInRect);
                }
            } else { // Click on canvas
                setSelectedNodeIds([]);
            }
        }
        
        setIsDraggingSelection(false);
        interactionState.current = { type: 'idle' };
        setRubberBandRect(null);
        if (canvasRef.current) canvasEl.releasePointerCapture(e.pointerId);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };
  
  // Setup manual wheel listener for non-passive behavior
  useEffect(() => {
      const el = canvasRef.current;
      if (!el) return;

      const onWheel = (e: WheelEvent) => {
          if ((e.target as HTMLElement).closest('.view-routes-panel')) return;
          e.preventDefault(); // Stop browser native zoom/scroll
          const rect = el.getBoundingClientRect();
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

      el.addEventListener('wheel', onWheel, { passive: false });
      return () => el.removeEventListener('wheel', onWheel);
  }, [onTransformChange, mouseGestures]);

  const backgroundStyle = {
    backgroundSize: `${32 * transform.scale}px ${32 * transform.scale}px`,
    backgroundPosition: `${transform.x}px ${transform.y}px`,
  };
  
  const svgBounds = useMemo(() => {
    if (labelNodes.length === 0) return { top: 0, left: 0, width: 0, height: 0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    labelNodes.forEach(node => {
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + node.width);
      maxY = Math.max(maxY, node.position.y + node.height);
    });
    // Extra padding for block containers
    const PADDING = 300;
    return {
      left: minX - PADDING, top: minY - PADDING,
      width: (maxX - minX) + PADDING * 2, height: (maxY - minY) + PADDING * 2,
    };
  }, [labelNodes]);

  const minimapItems = useMemo((): MinimapItem[] => {
    return labelNodes.map(n => ({ ...n, type: 'label' }));
  }, [labelNodes]);

  return (
    <div
      ref={canvasRef}
      className="absolute inset-0 overflow-hidden cursor-grab active:cursor-grabbing bg-gray-100 dark:bg-gray-900 bg-[radial-gradient(#d4d4d8_1px,transparent_1px)] dark:bg-[radial-gradient(#4b5563_1px,transparent_1px)]"
      style={backgroundStyle}
      onPointerDown={handlePointerDown}
    >
      <ViewRoutesPanel routes={identifiedRoutes} checkedRoutes={checkedRoutes} onToggleRoute={handleToggleRoute} routeLabels={routeLabels} />
      <div
        className="absolute top-0 left-0"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: '0 0',
        }}
      >
        {/* Layer 0: Block Group Containers */}
        {blockGroups.map(group => (
            <BlockContainer 
                key={group.id} 
                id={group.id} 
                title={group.title} 
                rect={group.rect} 
                isDimmed={linkColors !== null} // Dim background containers if a route is selected
            />
        ))}

        <svg 
          className="absolute pointer-events-none"
          style={{ left: svgBounds.left, top: svgBounds.top, width: svgBounds.width, height: svgBounds.height, zIndex: 5 }}
        >
          <defs>
            {/* Markers: viewBox="0 0 10 10", triangle shape M0,0 L10,5 L0,10 z, bigger size 12x12 */}
            <marker id="arrowhead-4f46e5" viewBox="0 0 10 10" markerWidth="12" markerHeight="12" refX="10" refY="5" orient="auto" markerUnits="userSpaceOnUse">
              <path d="M0,0 L10,5 L0,10 z" fill="#4f46e5" />
            </marker>
             <marker id="arrowhead-94a3b8" viewBox="0 0 10 10" markerWidth="12" markerHeight="12" refX="10" refY="5" orient="auto" markerUnits="userSpaceOnUse">
              <path d="M0,0 L10,5 L0,10 z" fill="#94a3b8" />
            </marker>
            {identifiedRoutes.map(route => (
                <marker key={route.id} id={`arrowhead-${route.color.replace('#', '')}`} viewBox="0 0 10 10" markerWidth="12" markerHeight="12" refX="10" refY="5" orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M0,0 L10,5 L0,10 z" fill={route.color} />
                </marker>
            ))}
          </defs>
          <g transform={`translate(${-svgBounds.left}, ${-svgBounds.top})`}>
            {routeLinks.map((link) => {
              const sourceNode = nodeMap.get(link.sourceId);
              const targetNode = nodeMap.get(link.targetId);
              if (!sourceNode || !targetNode) return null;

              const [sourcePos, targetPos] = getOptimalPath(sourceNode, targetNode);
              
              let color = link.type === 'implicit' ? "#94a3b8" : "#4f46e5";
              let isDimmed = false;

              if (linkColors) {
                  if (linkColors.has(link.id)) {
                      color = linkColors.get(link.id)!;
                  } else {
                      isDimmed = true;
                      color = '#9ca3af'; // gray
                  }
              }

              return <Arrow key={link.id} sourcePos={sourcePos} targetPos={targetPos} type={link.type} color={color} isDimmed={isDimmed} />;
            })}
            {/* One pill per menu group — offset outward from the node boundary */}
            {Array.from(menuGroups.entries()).map(([key, group]) => {
              const { links, sourcePos } = group[0];
              const firstLink = links[0];
              const color = linkColors?.get(firstLink.id) ?? '#4f46e5';

              // Push the pill outward past the node edge so it isn't obscured
              const sourceNode = nodeMap.get(firstLink.sourceId);
              let cx = sourcePos.x;
              let cy = sourcePos.y;
              if (sourceNode) {
                const ncx = sourceNode.position.x + sourceNode.width / 2;
                const ncy = sourceNode.position.y + sourceNode.height / 2;
                const dx = sourcePos.x - ncx;
                const dy = sourcePos.y - ncy;
                const dist = Math.hypot(dx, dy) || 1;
                const offset = 11 + 10; // pill radius + gap
                cx = sourcePos.x + (dx / dist) * offset;
                cy = sourcePos.y + (dy / dist) * offset;
              }

              return (
                <MenuPill
                  key={key}
                  cx={cx}
                  cy={cy}
                  count={links.length}
                  color={color}
                  onClick={(e) => handleMenuPillClick(e, key)}
                />
              );
            })}
          </g>
        </svg>

        {rubberBandRect && <RubberBand rect={rubberBandRect} />}

        {labelNodes.map((node) => (
          <LabelBlock
            key={node.id}
            node={node}
            onOpenEditor={onOpenEditor}
            isSelected={selectedNodeIds.includes(node.id)}
            isDragging={isDraggingSelection && selectedNodeIds.includes(node.id)}
            isEntry={entryNodeIds.has(node.id)}
            isDeadEnd={deadEndNodeIds.has(node.id)}
          />
        ))}
      </div>
      {activePopover && (
        <>
          <div className="absolute inset-0 z-40" onClick={() => setActivePopover(null)} />
          <MenuPopover
            popover={activePopover}
            onClose={() => setActivePopover(null)}
            onOpenEditor={onOpenEditor}
          />
        </>
      )}
      {/* Bottom-left controls: Fit + Legend */}
      <div className="absolute bottom-4 left-4 z-20 flex flex-col items-start gap-2" onPointerDown={e => e.stopPropagation()}>
        <button
          onClick={fitToScreen}
          title="Fit all nodes to screen (F)"
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-xs font-medium text-gray-700 dark:text-gray-200 shadow hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H5.414l3.293 3.293a1 1 0 11-1.414 1.414L4 6.414V8a1 1 0 01-2 0V4zm13 0a1 1 0 01.707.293l-3.293 3.293a1 1 0 01-1.414-1.414L15.586 3H14a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V5.414l-3.293 3.293A1 1 0 0112.293 7.29zM3 16a1 1 0 010-2V12.414l3.293-3.293a1 1 0 011.414 1.414L4.414 14H6a1 1 0 010 2H4a1 1 0 01-1-1zm13 1a1 1 0 01-.707-.293l-3.293-3.293a1 1 0 011.414-1.414L16.586 15H15a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V16.586l-3.293 3.293A1 1 0 0113.293 19.29z" clipRule="evenodd" />
          </svg>
          Fit
        </button>

        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow overflow-hidden">
          <button
            onClick={() => setShowLegend(v => !v)}
            className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 transition-transform ${showLegend ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            Legend
          </button>
          {showLegend && (
            <div className="px-3 pb-3 pt-1 space-y-2 text-xs text-gray-600 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <svg width="28" height="10" className="shrink-0">
                  <path d="M0,5 L20,5" stroke="#4f46e5" strokeWidth="2.5" fill="none" />
                  <polygon points="18,2 26,5 18,8" fill="#4f46e5" />
                </svg>
                Jump / Call
              </div>
              <div className="flex items-center gap-2">
                <svg width="28" height="10" className="shrink-0">
                  <path d="M0,5 L20,5" stroke="#94a3b8" strokeWidth="2.5" fill="none" strokeDasharray="4,2" />
                  <polygon points="18,2 26,5 18,8" fill="#94a3b8" />
                </svg>
                Implicit flow
              </div>
              <div className="flex items-center gap-2">
                <svg width="16" height="16" className="shrink-0">
                  <circle cx="8" cy="8" r="7" fill="#4f46e5" opacity="0.9" />
                  <text x="8" y="8" textAnchor="middle" dominantBaseline="central" fontSize="7" fontWeight="bold" fill="white">2</text>
                </svg>
                Menu choices
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 shrink-0 rounded-full bg-green-500 border-2 border-white dark:border-gray-800 inline-block" />
                Entry point
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 shrink-0 rounded-full bg-amber-500 border-2 border-white dark:border-gray-800 inline-block" />
                Dead end
              </div>
            </div>
          )}
        </div>
      </div>

      <Minimap
        items={minimapItems}
        transform={transform}
        canvasDimensions={canvasDimensions}
        onTransformChange={onTransformChange}
      />
    </div>
  );
};

export default RouteCanvas;