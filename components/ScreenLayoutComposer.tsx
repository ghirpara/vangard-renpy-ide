import React, { useState, useCallback } from 'react';
import type { ScreenLayoutComposition, ScreenWidget, ScreenWidgetType } from '../types';
import { generateScreenCode } from '../lib/screenCodeGenerator';
import CopyButton from './CopyButton';

interface ScreenLayoutComposerProps {
    composition: ScreenLayoutComposition;
    onCompositionChange: (value: React.SetStateAction<ScreenLayoutComposition>) => void;
    screenName: string;
    onRenameScreen: (newName: string) => void;
    labels: string[];
    isLocked?: boolean;
    onDuplicate?: () => void;
    onGoToCode?: () => void;
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
const Icon: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = 'w-5 h-5' }) => (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        {children}
    </svg>
);

const WIDGET_ICONS: Record<ScreenWidgetType, React.ReactNode> = {
    vbox: <Icon>
        <rect x="3" y="2"  width="14" height="4" rx="1" fill="currentColor" opacity="0.9"/>
        <rect x="3" y="8"  width="14" height="4" rx="1" fill="currentColor" opacity="0.6"/>
        <rect x="3" y="14" width="14" height="4" rx="1" fill="currentColor" opacity="0.35"/>
    </Icon>,
    hbox: <Icon>
        <rect x="2"  y="3" width="4" height="14" rx="1" fill="currentColor" opacity="0.9"/>
        <rect x="8"  y="3" width="4" height="14" rx="1" fill="currentColor" opacity="0.6"/>
        <rect x="14" y="3" width="4" height="14" rx="1" fill="currentColor" opacity="0.35"/>
    </Icon>,
    frame: <Icon>
        <rect x="2" y="2" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="2"/>
        <rect x="5" y="5" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1.5" opacity="0.5"/>
    </Icon>,
    text: <Icon>
        <path d="M4 4h12M10 4v12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M7 16h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
    </Icon>,
    image: <Icon>
        <rect x="2" y="4" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="7" cy="8.5" r="1.5" fill="currentColor" opacity="0.7"/>
        <path d="M2 13.5l4.5-4 3 3 2.5-2.5 6 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8"/>
    </Icon>,
    textbutton: <Icon>
        <rect x="2" y="6" width="16" height="8" rx="3" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M6 10h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </Icon>,
    button: <Icon>
        <rect x="2" y="6" width="16" height="8" rx="3" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="10" cy="10" r="2.5" fill="currentColor" opacity="0.4"/>
        <circle cx="10" cy="10" r="1" fill="currentColor" opacity="0.8"/>
    </Icon>,
    imagebutton: <Icon>
        <rect x="2" y="3" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="6.5" cy="7" r="1.2" fill="currentColor" opacity="0.6"/>
        <path d="M2 11l3.5-3 2.5 2 2-2 6 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
        <rect x="6" y="14.5" width="8" height="3" rx="1.5" fill="currentColor" opacity="0.5"/>
    </Icon>,
    bar: <Icon>
        <rect x="2" y="8"  width="16" height="4" rx="2" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="2" y="8"  width="10" height="4" rx="2" fill="currentColor" opacity="0.45"/>
        <path d="M2 14h4M7 14h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
    </Icon>,
    input: <Icon>
        <rect x="2" y="6" width="16" height="8" rx="2" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M5 10h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <path d="M11 7.5v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
    </Icon>,
    null: <Icon>
        <path d="M3 10h2.5M8.5 10h3M14.5 10H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5"/>
        <path d="M3 6h14M3 14h14" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeDasharray="2 2" opacity="0.25"/>
    </Icon>,
};

// Icon colours for tree nodes — solid accent per type
const WIDGET_ICON_COLORS: Record<ScreenWidgetType, string> = {
    vbox:        'text-blue-500   dark:text-blue-400',
    hbox:        'text-indigo-500 dark:text-indigo-400',
    frame:       'text-purple-500 dark:text-purple-400',
    text:        'text-gray-500   dark:text-gray-300',
    image:       'text-green-500  dark:text-green-400',
    textbutton:  'text-yellow-600 dark:text-yellow-400',
    button:      'text-orange-500 dark:text-orange-400',
    imagebutton: 'text-lime-600   dark:text-lime-400',
    bar:         'text-teal-500   dark:text-teal-400',
    input:       'text-pink-500   dark:text-pink-400',
    null:        'text-gray-400   dark:text-gray-500',
};

// Background pill colours used in palette tiles
const WIDGET_TILE_COLORS: Record<ScreenWidgetType, string> = {
    vbox:        'bg-blue-50   dark:bg-blue-950  border-blue-200   dark:border-blue-800  hover:border-blue-400   dark:hover:border-blue-500',
    hbox:        'bg-indigo-50 dark:bg-indigo-950 border-indigo-200 dark:border-indigo-800 hover:border-indigo-400 dark:hover:border-indigo-500',
    frame:       'bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800 hover:border-purple-400 dark:hover:border-purple-500',
    text:        'bg-gray-50   dark:bg-gray-800  border-gray-200   dark:border-gray-600  hover:border-gray-400   dark:hover:border-gray-400',
    image:       'bg-green-50  dark:bg-green-950 border-green-200  dark:border-green-800 hover:border-green-400  dark:hover:border-green-500',
    textbutton:  'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800 hover:border-yellow-400 dark:hover:border-yellow-500',
    button:      'bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800 hover:border-orange-400 dark:hover:border-orange-500',
    imagebutton: 'bg-lime-50   dark:bg-lime-950  border-lime-200   dark:border-lime-800  hover:border-lime-400   dark:hover:border-lime-500',
    bar:         'bg-teal-50   dark:bg-teal-950  border-teal-200   dark:border-teal-800  hover:border-teal-400   dark:hover:border-teal-500',
    input:       'bg-pink-50   dark:bg-pink-950  border-pink-200   dark:border-pink-800  hover:border-pink-400   dark:hover:border-pink-500',
    null:        'bg-gray-50   dark:bg-gray-900  border-gray-200   dark:border-gray-700  hover:border-gray-300   dark:hover:border-gray-500',
};

// Preview canvas widget background (lighter fills)
const WIDGET_PREVIEW_COLORS: Record<ScreenWidgetType, string> = {
    vbox:        'bg-blue-100/70   dark:bg-blue-900/40   border-blue-300   dark:border-blue-700',
    hbox:        'bg-indigo-100/70 dark:bg-indigo-900/40 border-indigo-300 dark:border-indigo-700',
    frame:       'bg-purple-100/70 dark:bg-purple-900/40 border-purple-300 dark:border-purple-700',
    text:        'bg-gray-100/70   dark:bg-gray-700/40   border-gray-300   dark:border-gray-600',
    image:       'bg-green-100/70  dark:bg-green-900/40  border-green-300  dark:border-green-700',
    textbutton:  'bg-yellow-100/70 dark:bg-yellow-900/40 border-yellow-300 dark:border-yellow-700',
    button:      'bg-orange-100/70 dark:bg-orange-900/40 border-orange-300 dark:border-orange-700',
    imagebutton: 'bg-lime-100/70   dark:bg-lime-900/40   border-lime-300   dark:border-lime-700',
    bar:         'bg-teal-100/70   dark:bg-teal-900/40   border-teal-300   dark:border-teal-700',
    input:       'bg-pink-100/70   dark:bg-pink-900/40   border-pink-300   dark:border-pink-700',
    null:        'bg-gray-50/70    dark:bg-gray-800/40   border-gray-200   dark:border-gray-700',
};

const WIDGET_LABELS: Record<ScreenWidgetType, string> = {
    vbox:        'Vertical Box',
    hbox:        'Horizontal Box',
    frame:       'Frame',
    text:        'Text',
    image:       'Image',
    textbutton:  'Text Button',
    button:      'Button',
    imagebutton: 'Image Button',
    bar:         'Bar',
    input:       'Input',
    null:        'Spacer',
};

// ---------------------------------------------------------------------------
// Palette definition
// ---------------------------------------------------------------------------
const PALETTE_GROUPS: { label: string; icon: React.ReactNode; types: ScreenWidgetType[] }[] = [
    { label: 'Layout', icon: <Icon className="w-3.5 h-3.5"><path d="M2 5h16M2 10h16M2 15h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></Icon>, types: ['vbox', 'hbox', 'frame'] },
    { label: 'Display', icon: <Icon className="w-3.5 h-3.5"><rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/></Icon>, types: ['text', 'image'] },
    { label: 'Interactive', icon: <Icon className="w-3.5 h-3.5"><path d="M8 8l6 4-6 4V8z" fill="currentColor" opacity="0.8"/></Icon>, types: ['textbutton', 'button', 'imagebutton'] },
    { label: 'Other', icon: <Icon className="w-3.5 h-3.5"><circle cx="5" cy="10" r="1.5" fill="currentColor" opacity="0.6"/><circle cx="10" cy="10" r="1.5" fill="currentColor" opacity="0.6"/><circle cx="15" cy="10" r="1.5" fill="currentColor" opacity="0.6"/></Icon>, types: ['bar', 'input', 'null'] },
];

// ---------------------------------------------------------------------------
// Tree drag-and-drop types
// ---------------------------------------------------------------------------
type DropPosition = 'before' | 'after' | 'inside';
interface DropTarget { id: string; position: DropPosition; }
interface TreeDragState { draggingId: string | null; dropTarget: DropTarget | null; }
interface TreeDragCallbacks {
    onDragStart: (id: string) => void;
    onDragOver: (id: string, position: DropPosition) => void;
    onDrop: () => void;
    onDragEnd: () => void;
}

// ---------------------------------------------------------------------------
// Widget helpers
// ---------------------------------------------------------------------------
function makeWidget(type: ScreenWidgetType): ScreenWidget {
    const id = `widget-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const base: ScreenWidget = { id, type };
    if (type === 'text')        return { ...base, text: 'Text' };
    if (type === 'textbutton')  return { ...base, text: 'Button', action: 'Return()' };
    if (type === 'button')      return { ...base, action: 'Return()', children: [] };
    if (type === 'imagebutton') return { ...base, imagePath: '', action: 'Return()' };
    if (type === 'vbox' || type === 'hbox' || type === 'frame') return { ...base, children: [] };
    return base;
}

const CONTAINER_TYPES: ScreenWidgetType[] = ['vbox', 'hbox', 'frame', 'button'];
function isContainer(w: ScreenWidget) { return CONTAINER_TYPES.includes(w.type); }

function findWidget(widgets: ScreenWidget[], id: string): ScreenWidget | null {
    for (const w of widgets) {
        if (w.id === id) return w;
        if (w.children) { const f = findWidget(w.children, id); if (f) return f; }
    }
    return null;
}

function addToContainer(widgets: ScreenWidget[], containerId: string, nw: ScreenWidget): ScreenWidget[] {
    return widgets.map(w => {
        if (w.id === containerId && w.children !== undefined) return { ...w, children: [...w.children, nw] };
        if (w.children) return { ...w, children: addToContainer(w.children, containerId, nw) };
        return w;
    });
}

function updateWidgetById(widgets: ScreenWidget[], id: string, fn: (w: ScreenWidget) => ScreenWidget): ScreenWidget[] {
    return widgets.map(w => {
        if (w.id === id) return fn(w);
        if (w.children) return { ...w, children: updateWidgetById(w.children, id, fn) };
        return w;
    });
}

function deleteWidgetById(widgets: ScreenWidget[], id: string): ScreenWidget[] {
    return widgets.filter(w => w.id !== id).map(w => w.children ? { ...w, children: deleteWidgetById(w.children, id) } : w);
}

function moveInList(list: ScreenWidget[], id: string, dir: 'up' | 'down'): ScreenWidget[] {
    const idx = list.findIndex(w => w.id === id);
    if (idx !== -1) {
        const next = dir === 'up' ? idx - 1 : idx + 1;
        if (next < 0 || next >= list.length) return list;
        const r = [...list]; [r[idx], r[next]] = [r[next], r[idx]]; return r;
    }
    return list.map(w => w.children ? { ...w, children: moveInList(w.children, id, dir) } : w);
}

function findAndRemove(widgets: ScreenWidget[], id: string): [ScreenWidget[], ScreenWidget | null] {
    let removed: ScreenWidget | null = null;
    const filtered = widgets.filter(w => { if (w.id === id) { removed = w; return false; } return true; });
    const result = filtered.map(w => {
        if (w.children) { const [nc, r] = findAndRemove(w.children, id); if (r) removed = r; return { ...w, children: nc }; }
        return w;
    });
    return [result, removed];
}

function insertAt(widgets: ScreenWidget[], widget: ScreenWidget, targetId: string, position: DropPosition): ScreenWidget[] {
    if (position === 'inside') {
        return widgets.map(w => {
            if (w.id === targetId && w.children !== undefined) return { ...w, children: [...w.children, widget] };
            if (w.children) return { ...w, children: insertAt(w.children, widget, targetId, position) };
            return w;
        });
    }
    const idx = widgets.findIndex(w => w.id === targetId);
    if (idx !== -1) {
        const at = position === 'before' ? idx : idx + 1;
        const r = [...widgets]; r.splice(at, 0, widget); return r;
    }
    return widgets.map(w => { if (w.children) return { ...w, children: insertAt(w.children, widget, targetId, position) }; return w; });
}

function isDescendant(widgets: ScreenWidget[], ancestorId: string, potentialDescId: string): boolean {
    const a = findWidget(widgets, ancestorId);
    if (!a?.children) return false;
    return findWidget(a.children, potentialDescId) !== null;
}

function moveWidget(widgets: ScreenWidget[], dragId: string, target: DropTarget): ScreenWidget[] {
    const [without, dragged] = findAndRemove(widgets, dragId);
    if (!dragged) return widgets;
    if (target.id === '__root__') return [...without, dragged];
    return insertAt(without, dragged, target.id, target.position);
}

// ---------------------------------------------------------------------------
// Widget Tree node
// ---------------------------------------------------------------------------
const TreeNode: React.FC<{
    widget: ScreenWidget;
    depth: number;
    selectedId: string | null;
    onSelect: (id: string) => void;
    onMoveUp: (id: string) => void;
    onMoveDown: (id: string) => void;
    onDelete: (id: string) => void;
    isFirst: boolean;
    isLast: boolean;
    drag: TreeDragState;
    dragCbs: TreeDragCallbacks;
    collapseGen: number;
    expandGen: number;
}> = ({ widget, depth, selectedId, onSelect, onMoveUp, onMoveDown, onDelete, isFirst, isLast, drag, dragCbs, collapseGen, expandGen }) => {
    const [open, setOpen] = useState(true);
    React.useEffect(() => { setOpen(false); }, [collapseGen]);
    React.useEffect(() => { setOpen(true); }, [expandGen]);
    const container = isContainer(widget);
    const label = widget.text || widget.imagePath;
    const isSelected = selectedId === widget.id;
    const isDragging = drag.draggingId === widget.id;
    const dt = drag.dropTarget;
    const isDropBefore = dt?.id === widget.id && dt.position === 'before';
    const isDropAfter  = dt?.id === widget.id && dt.position === 'after';
    const isDropInside = dt?.id === widget.id && dt.position === 'inside';

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientY - rect.top) / rect.height;
        const position: DropPosition = container
            ? (ratio < 0.3 ? 'before' : ratio > 0.7 ? 'after' : 'inside')
            : (ratio < 0.5 ? 'before' : 'after');
        dragCbs.onDragOver(widget.id, position);
    };

    return (
        <div>
            {isDropBefore && <div className="h-0.5 bg-accent mx-2 rounded-full" />}

            <div
                draggable
                onDragStart={e => { e.dataTransfer.setData('text/plain', widget.id); e.dataTransfer.effectAllowed = 'move'; dragCbs.onDragStart(widget.id); }}
                onDragOver={handleDragOver}
                onDrop={e => { e.preventDefault(); e.stopPropagation(); dragCbs.onDrop(); }}
                onDragEnd={dragCbs.onDragEnd}
                onClick={() => onSelect(widget.id)}
                style={{ paddingLeft: `${depth * 16 + 6}px` }}
                className={`
                    group flex items-center gap-2 py-1.5 pr-1 rounded-md cursor-pointer select-none transition-all
                    ${isDragging ? 'opacity-30' : ''}
                    ${isDropInside ? 'ring-2 ring-accent ring-inset bg-accent/5' : ''}
                    ${isSelected
                        ? 'bg-accent/15 dark:bg-accent/20 text-accent'
                        : 'text-primary hover:bg-tertiary-hover'}
                `}
            >
                {/* Expand/collapse or spacer */}
                {container ? (
                    <button
                        className="w-4 h-4 flex-shrink-0 flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
                        aria-label={open ? 'Collapse' : 'Expand'}
                    >
                        <svg viewBox="0 0 12 12" className={`w-2.5 h-2.5 transition-transform duration-150 ${open ? 'rotate-90' : ''}`} fill="currentColor">
                            <path d="M4 2l4 4-4 4V2z"/>
                        </svg>
                    </button>
                ) : (
                    <span className="w-4 flex-shrink-0" />
                )}

                {/* Type icon */}
                <span className={`flex-shrink-0 ${WIDGET_ICON_COLORS[widget.type]}`}>
                    {WIDGET_ICONS[widget.type]}
                </span>

                {/* Label */}
                <span className="flex-grow min-w-0 flex items-center gap-1.5 overflow-hidden">
                    <span className={`text-xs font-semibold flex-shrink-0 ${isSelected ? 'text-accent' : 'text-primary'}`}>
                        {WIDGET_LABELS[widget.type]}
                    </span>
                    {label && (
                        <span className="text-[10px] text-secondary truncate">
                            "{label}"
                        </span>
                    )}
                    {container && widget.children !== undefined && (
                        <span className="flex-shrink-0 text-[9px] bg-tertiary text-secondary rounded-full px-1.5 leading-4 font-mono">
                            {widget.children.length}
                        </span>
                    )}
                </span>

                {/* Drag grip */}
                <span className="flex-shrink-0 text-secondary opacity-30 cursor-grab text-xs px-0.5">⠿</span>

                {/* Quick-add / Up / down / delete */}
                <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100"
                    onClick={e => e.stopPropagation()}>
                    {container && (
                        <button aria-label="Add inside" title="Select to add inside"
                            onClick={() => onSelect(widget.id)}
                            className="p-0.5 rounded hover:bg-accent/10 dark:hover:bg-accent/20 text-secondary hover:text-accent transition-colors">
                            <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 2v8M2 6h8"/></svg>
                        </button>
                    )}
                    <button aria-label="Move up" disabled={isFirst}
                        onClick={() => onMoveUp(widget.id)}
                        className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-20 text-secondary hover:text-primary">
                        <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 8l4-4 4 4"/></svg>
                    </button>
                    <button aria-label="Move down" disabled={isLast}
                        onClick={() => onMoveDown(widget.id)}
                        className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-20 text-secondary hover:text-primary">
                        <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 4l4 4 4-4"/></svg>
                    </button>
                    <button aria-label="Delete widget"
                        onClick={() => onDelete(widget.id)}
                        className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-secondary hover:text-red-500">
                        <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8"/></svg>
                    </button>
                </div>
            </div>

            {isDropAfter && <div className="h-0.5 bg-accent mx-2 rounded-full" />}

            {container && open && widget.children && (
                <div className="relative">
                    {/* Indent guide line */}
                    <div
                        className="absolute top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700"
                        style={{ left: `${depth * 16 + 14}px` }}
                    />
                    {widget.children.map((child, idx) => (
                        <TreeNode
                            key={child.id}
                            widget={child}
                            depth={depth + 1}
                            selectedId={selectedId}
                            onSelect={onSelect}
                            onMoveUp={onMoveUp}
                            onMoveDown={onMoveDown}
                            onDelete={onDelete}
                            isFirst={idx === 0}
                            isLast={idx === widget.children!.length - 1}
                            drag={drag}
                            dragCbs={dragCbs}
                            collapseGen={collapseGen}
                            expandGen={expandGen}
                        />
                    ))}
                    {widget.children.length === 0 && (
                        <div className="text-[10px] text-secondary italic py-1"
                            style={{ paddingLeft: `${(depth + 1) * 16 + 22}px` }}>
                            empty
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Properties panel
// ---------------------------------------------------------------------------
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div>
        <label className="block text-[10px] font-semibold text-secondary uppercase tracking-wide mb-1">{label}</label>
        {children}
    </div>
);

const PropertiesPanel: React.FC<{
    widget: ScreenWidget | null;
    composition: ScreenLayoutComposition;
    onUpdateWidget: (id: string, fn: (w: ScreenWidget) => ScreenWidget) => void;
    onUpdateComposition: (fn: (c: ScreenLayoutComposition) => ScreenLayoutComposition) => void;
    screenName: string;
    onRenameScreen: (name: string) => void;
}> = ({ widget, composition, onUpdateWidget, onUpdateComposition, screenName, onRenameScreen }) => {
    const [localName, setLocalName] = useState(screenName);
    React.useEffect(() => { setLocalName(screenName); }, [screenName]);

    const str = (v: string | undefined) => v ?? '';
    const num = (v: number | undefined) => v !== undefined ? String(v) : '';

    const set = (field: keyof ScreenWidget, value: string | number | undefined) => {
        if (!widget) return;
        onUpdateWidget(widget.id, w => ({ ...w, [field]: value }));
    };
    const setNum = (field: keyof ScreenWidget, raw: string) => {
        const n = parseFloat(raw);
        set(field, isNaN(n) ? undefined : n);
    };

    const inputCls = "w-full px-2 py-1.5 rounded-md bg-primary border border-primary text-sm focus:outline-none focus:ring-1 focus:ring-accent transition-colors";

    if (!widget) {
        return (
            <div className="p-3 space-y-4">
                <div className="flex items-center gap-2 pb-1 border-b border-primary">
                    <svg viewBox="0 0 20 20" className="w-4 h-4 text-secondary" fill="none"><rect x="3" y="3" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.5"/><path d="M7 10h6M10 7v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    <span className="text-xs font-bold text-primary">Screen Properties</span>
                </div>
                <Field label="Screen Name">
                    <input className={inputCls} value={localName}
                        onChange={e => setLocalName(e.target.value)}
                        onBlur={() => { if (localName !== screenName) onRenameScreen(localName); }} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                    <Field label="Width">
                        <input type="number" className={inputCls} value={composition.gameWidth}
                            onChange={e => onUpdateComposition(c => ({ ...c, gameWidth: parseInt(e.target.value) || 1920 }))} />
                    </Field>
                    <Field label="Height">
                        <input type="number" className={inputCls} value={composition.gameHeight}
                            onChange={e => onUpdateComposition(c => ({ ...c, gameHeight: parseInt(e.target.value) || 1080 }))} />
                    </Field>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <Field label="Z-Order">
                        <input type="number" className={inputCls} value={composition.zorder}
                            onChange={e => onUpdateComposition(c => ({ ...c, zorder: parseInt(e.target.value) || 0 }))} />
                    </Field>
                    <div className="flex items-center gap-2 pt-5">
                        <input type="checkbox" id="modal-check" checked={composition.modal}
                            className="w-4 h-4 rounded accent-accent cursor-pointer"
                            onChange={e => onUpdateComposition(c => ({ ...c, modal: e.target.checked }))} />
                        <label htmlFor="modal-check" className="text-xs font-semibold text-secondary cursor-pointer">Modal</label>
                    </div>
                </div>
            </div>
        );
    }

    const container = isContainer(widget);
    const hasText   = ['text', 'textbutton', 'button'].includes(widget.type);
    const hasAction = ['textbutton', 'button', 'imagebutton'].includes(widget.type);
    const hasImage  = ['image', 'imagebutton'].includes(widget.type);

    return (
        <div className="p-3 space-y-4">
            {/* Widget type header */}
            <div className={`flex items-center gap-2 pb-1 border-b border-primary`}>
                <span className={WIDGET_ICON_COLORS[widget.type]}>{WIDGET_ICONS[widget.type]}</span>
                <span className="text-xs font-bold text-primary">{WIDGET_LABELS[widget.type]}</span>
            </div>

            {hasText && (
                <Field label="Text">
                    <input className={inputCls} value={str(widget.text)} onChange={e => set('text', e.target.value)} />
                </Field>
            )}
            {hasAction && (
                <Field label="Action">
                    <input className={`${inputCls} font-mono text-xs`} value={str(widget.action)}
                        onChange={e => set('action', e.target.value)} placeholder="Return()" />
                </Field>
            )}
            {hasImage && (
                <Field label="Image Path — or drag from Assets">
                    <input
                        className={`${inputCls} font-mono text-xs`}
                        value={str(widget.imagePath)}
                        onChange={e => set('imagePath', e.target.value)}
                        placeholder="gui/button.png"
                        onDrop={e => {
                            e.preventDefault();
                            const path = e.dataTransfer.getData('application/renpy-image-path');
                            if (!path) return;
                            const dataUrl = e.dataTransfer.getData('application/renpy-image-dataurl');
                            onUpdateWidget(widget.id, w => ({ ...w, imagePath: path, ...(dataUrl ? { imageDataUrl: dataUrl } : {}) }));
                        }}
                        onDragOver={e => e.preventDefault()}
                    />
                </Field>
            )}
            <Field label="Style">
                <input className={`${inputCls} font-mono text-xs`} value={str(widget.style)}
                    onChange={e => set('style', e.target.value || undefined)} placeholder="default" />
            </Field>

            {/* Position / Alignment */}
            <div>
                <div className="flex items-center gap-1.5 mb-2">
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-secondary" fill="none"><path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.2"/></svg>
                    <span className="text-[10px] font-semibold text-secondary uppercase tracking-wide">
                        {container ? 'Alignment' : 'Position'}
                    </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <Field label="xalign (0–1)">
                        <input type="number" step="0.1" min="0" max="1" className={inputCls}
                            value={num(widget.xalign)} onChange={e => setNum('xalign', e.target.value)} placeholder="0.5" />
                    </Field>
                    <Field label="yalign (0–1)">
                        <input type="number" step="0.1" min="0" max="1" className={inputCls}
                            value={num(widget.yalign)} onChange={e => setNum('yalign', e.target.value)} placeholder="0.5" />
                    </Field>
                    {!container && (<>
                        <Field label="xpos (px)">
                            <input type="number" className={inputCls} value={num(widget.xpos)}
                                onChange={e => setNum('xpos', e.target.value)} placeholder="—" />
                        </Field>
                        <Field label="ypos (px)">
                            <input type="number" className={inputCls} value={num(widget.ypos)}
                                onChange={e => setNum('ypos', e.target.value)} placeholder="—" />
                        </Field>
                    </>)}
                </div>
                {!container && (
                    <p className="text-[10px] text-secondary mt-1.5 leading-snug opacity-70">
                        Prefer xalign/yalign — xpos/ypos for pixel-exact overrides only
                    </p>
                )}
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Canvas preview widget renderer
// ---------------------------------------------------------------------------
const PreviewWidget: React.FC<{
    widget: ScreenWidget;
    selectedId: string | null;
    onSelect: (id: string) => void;
    onUpdateWidget: (id: string, fn: (w: ScreenWidget) => ScreenWidget) => void;
    insideContainer: boolean;
}> = ({ widget, selectedId, onSelect, onUpdateWidget, insideContainer }) => {
    const isSelected = selectedId === widget.id;

    const posStyle: React.CSSProperties = {};
    if (!insideContainer) {
        if (widget.xalign !== undefined || widget.yalign !== undefined) {
            posStyle.position = 'absolute';
            const xa = widget.xalign ?? 0;
            const ya = widget.yalign ?? 0;
            posStyle.left = `${xa * 100}%`;
            posStyle.top  = `${ya * 100}%`;
            posStyle.transform = `translate(-${xa * 100}%, -${ya * 100}%)`;
        } else if (widget.xpos !== undefined || widget.ypos !== undefined) {
            posStyle.position = 'absolute';
            posStyle.left = widget.xpos !== undefined ? `${widget.xpos}px` : 'auto';
            posStyle.top  = widget.ypos  !== undefined ? `${widget.ypos}px` : 'auto';
        }
    }

    const selRing = isSelected ? 'ring-2 ring-accent shadow-md ring-offset-1' : 'hover:shadow-sm';
    // Top-level widgets without explicit position flow as full-width blocks (Ren'Py default).
    // Only absolutely-positioned widgets shrink to content width.
    const hasExplicitPos = !insideContainer && (
        widget.xalign !== undefined || widget.yalign !== undefined ||
        widget.xpos !== undefined || widget.ypos !== undefined
    );
    const outerSizeCls = insideContainer ? 'w-full' : hasExplicitPos ? 'inline-block min-w-[48px]' : 'block w-full';

    const renderInner = () => {
        switch (widget.type) {
            case 'null':
                return (
                    <div style={{ minHeight: 18 }}
                        className="w-full border border-dashed border-gray-400 dark:border-gray-500 rounded flex items-center justify-center">
                        <span className="text-[9px] text-gray-400 dark:text-gray-500 italic px-2">spacer</span>
                    </div>
                );

            case 'text':
                return (
                    <div className="w-full px-2 py-1.5 rounded bg-gray-100 dark:bg-gray-700/60">
                        <span className="text-xs font-medium text-gray-800 dark:text-gray-200">
                            {widget.text || 'Text'}
                        </span>
                    </div>
                );

            case 'textbutton':
                return (
                    <div className="w-full px-3 py-1.5 rounded-full border-2 border-yellow-400 dark:border-yellow-500 bg-yellow-50 dark:bg-yellow-900/30 text-center">
                        <span className="text-xs font-semibold text-yellow-800 dark:text-yellow-200">
                            {widget.text || 'Button'}
                        </span>
                    </div>
                );

            case 'button': {
                const hasKids = widget.children && widget.children.length > 0;
                return (
                    <div className="w-full p-1.5 rounded border-2 border-orange-400 dark:border-orange-600 bg-orange-50 dark:bg-orange-900/30" style={{ minHeight: 28 }}>
                        {hasKids
                            ? <div className="flex flex-col gap-1">
                                {widget.children!.map(child => (
                                    <PreviewWidget key={child.id} widget={child} selectedId={selectedId} onSelect={onSelect} onUpdateWidget={onUpdateWidget} insideContainer />
                                ))}
                              </div>
                            : widget.text
                                ? <span className="text-xs font-semibold text-orange-800 dark:text-orange-200 block text-center px-1">{widget.text}</span>
                                : <span className="text-[9px] text-orange-500 italic block text-center">button</span>
                        }
                    </div>
                );
            }

            case 'image': {
                const imgDropProps = {
                    onDrop: (e: React.DragEvent) => {
                        e.preventDefault(); e.stopPropagation();
                        const path = e.dataTransfer.getData('application/renpy-image-path');
                        if (!path) return;
                        const dataUrl = e.dataTransfer.getData('application/renpy-image-dataurl');
                        onUpdateWidget(widget.id, w => ({ ...w, imagePath: path, ...(dataUrl ? { imageDataUrl: dataUrl } : {}) }));
                    },
                    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); },
                };
                return (
                    <div className="relative w-full rounded border border-green-300 dark:border-green-700 bg-green-100 dark:bg-green-900/30 flex items-center justify-center overflow-hidden" style={{ minHeight: 40 }} {...imgDropProps}>
                        {widget.imageDataUrl
                            ? <img src={widget.imageDataUrl} alt={widget.imagePath} className="w-full h-full object-contain" />
                            : <>
                                <svg viewBox="0 0 20 20" className="w-6 h-6 text-green-400 dark:text-green-500" fill="none">
                                    <rect x="2" y="4" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                                    <circle cx="7" cy="8.5" r="1.5" fill="currentColor" opacity="0.7"/>
                                    <path d="M2 13.5l4.5-4 3 3 2.5-2.5 6 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8"/>
                                </svg>
                                {widget.imagePath
                                    ? <span className="absolute bottom-0.5 left-0 right-0 text-[8px] text-green-700 dark:text-green-300 truncate text-center px-1 bg-green-100/80 dark:bg-green-900/60">{widget.imagePath.split('/').pop()}</span>
                                    : <span className="absolute bottom-0.5 left-0 right-0 text-[8px] text-green-500 italic text-center">drag image here</span>
                                }
                            </>
                        }
                    </div>
                );
            }

            case 'imagebutton': {
                const ibDropProps = {
                    onDrop: (e: React.DragEvent) => {
                        e.preventDefault(); e.stopPropagation();
                        const path = e.dataTransfer.getData('application/renpy-image-path');
                        if (!path) return;
                        const dataUrl = e.dataTransfer.getData('application/renpy-image-dataurl');
                        onUpdateWidget(widget.id, w => ({ ...w, imagePath: path, ...(dataUrl ? { imageDataUrl: dataUrl } : {}) }));
                    },
                    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); },
                };
                return (
                    <div className="relative w-full rounded border-2 border-lime-400 dark:border-lime-600 bg-lime-100 dark:bg-lime-900/30 flex flex-col items-center justify-center overflow-hidden" style={{ minHeight: 36 }} {...ibDropProps}>
                        {widget.imageDataUrl
                            ? <>
                                <img src={widget.imageDataUrl} alt={widget.imagePath} className="w-full h-full object-contain" />
                                <div className="absolute bottom-0 left-0 right-0 bg-lime-900/50 text-[8px] text-lime-100 text-center px-1 py-0.5">img btn</div>
                              </>
                            : <>
                                <svg viewBox="0 0 20 20" className="w-5 h-5 text-lime-500 dark:text-lime-400" fill="none">
                                    <rect x="2" y="3" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                                    <circle cx="6.5" cy="7" r="1.2" fill="currentColor" opacity="0.6"/>
                                    <path d="M2 11l3.5-3 2.5 2 2-2 6 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
                                </svg>
                                {widget.imagePath
                                    ? <span className="text-[9px] text-lime-700 dark:text-lime-300 font-semibold truncate max-w-full px-1">{widget.imagePath.split('/').pop()}</span>
                                    : <span className="text-[8px] text-lime-500 italic">drag image here</span>
                                }
                            </>
                        }
                    </div>
                );
            }

            case 'bar':
                return (
                    <div className="w-full py-1 px-1">
                        <div className="w-full h-3 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden border border-teal-300 dark:border-teal-700">
                            <div className="h-full w-3/5 rounded-full bg-teal-400 dark:bg-teal-500" />
                        </div>
                        <span className="text-[9px] text-teal-600 dark:text-teal-400 block text-center mt-0.5">bar</span>
                    </div>
                );

            case 'input':
                return (
                    <div className="w-full px-2 py-1.5 rounded border-2 border-pink-400 dark:border-pink-600 bg-white dark:bg-gray-800 flex items-center gap-1">
                        <span className="flex-grow text-xs text-gray-400 dark:text-gray-500 italic truncate">input…</span>
                        <span className="w-px h-3.5 bg-pink-500 opacity-70" />
                    </div>
                );

            case 'vbox':
            case 'hbox':
            case 'frame': {
                const isHbox = widget.type === 'hbox';
                const empty = !widget.children || widget.children.length === 0;
                return (
                    <div className={`w-full ${WIDGET_PREVIEW_COLORS[widget.type]} rounded border ${empty ? 'border-dashed' : ''} p-1.5`}
                        style={empty ? { minHeight: 32 } : undefined}>
                        {empty
                            ? <span className="text-[9px] text-secondary italic block text-center py-0.5">{widget.type} — empty</span>
                            : <div className={`flex gap-1 ${isHbox ? 'flex-row flex-wrap' : 'flex-col'}`}>
                                {widget.children!.map(child => (
                                    <PreviewWidget key={child.id} widget={child} selectedId={selectedId} onSelect={onSelect} onUpdateWidget={onUpdateWidget} insideContainer />
                                ))}
                              </div>
                        }
                    </div>
                );
            }

            default:
                return null;
        }
    };

    return (
        <div style={posStyle}
            className={`relative select-none cursor-pointer ${outerSizeCls}`}
            onClick={e => { e.stopPropagation(); onSelect(widget.id); }}>
            <div className={`rounded-md transition-shadow ${selRing}`}>
                {renderInner()}
            </div>
            {isSelected && (
                <div className="absolute top-0 left-0 z-10 flex items-center gap-1 bg-accent text-white text-[9px] font-bold px-1.5 py-0.5 rounded-br rounded-tl shadow-sm whitespace-nowrap pointer-events-none">
                    {React.cloneElement(WIDGET_ICONS[widget.type] as React.ReactElement, { className: 'w-2.5 h-2.5' })}
                    {widget.type}
                </div>
            )}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const ScreenLayoutComposer: React.FC<ScreenLayoutComposerProps> = ({
    composition,
    onCompositionChange,
    screenName,
    onRenameScreen,
    isLocked = false,
    onDuplicate,
    onGoToCode,
}) => {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [codeOpen, setCodeOpen] = useState(false);

    const [dragState, setDragState] = useState<TreeDragState>({ draggingId: null, dropTarget: null });
    const [collapseGen, setCollapseGen] = useState(0);
    const [expandGen, setExpandGen] = useState(0);

    const selectedWidget = selectedId ? findWidget(composition.widgets, selectedId) ?? null : null;

    const handleAddWidget = useCallback((type: ScreenWidgetType) => {
        const widget = makeWidget(type);
        if (selectedId) {
            const sel = findWidget(composition.widgets, selectedId);
            if (sel && isContainer(sel)) {
                onCompositionChange(c => ({ ...c, widgets: addToContainer(c.widgets, selectedId, widget) }));
                setSelectedId(widget.id);
                return;
            }
        }
        onCompositionChange(c => ({ ...c, widgets: [...c.widgets, widget] }));
        setSelectedId(widget.id);
    }, [selectedId, composition.widgets, onCompositionChange]);

    const handleUpdateWidget = useCallback((id: string, fn: (w: ScreenWidget) => ScreenWidget) => {
        onCompositionChange(c => ({ ...c, widgets: updateWidgetById(c.widgets, id, fn) }));
    }, [onCompositionChange]);

    const handleDeleteWidget = useCallback((id: string) => {
        if (selectedId === id) setSelectedId(null);
        onCompositionChange(c => ({ ...c, widgets: deleteWidgetById(c.widgets, id) }));
    }, [onCompositionChange, selectedId]);

    const handleMoveWidget = useCallback((id: string, dir: 'up' | 'down') => {
        onCompositionChange(c => ({ ...c, widgets: moveInList(c.widgets, id, dir) }));
    }, [onCompositionChange]);

    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Delete' && e.key !== 'Backspace') return;
            if (!selectedId) return;
            const tag = (e.target as HTMLElement).tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            e.preventDefault();
            handleDeleteWidget(selectedId);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedId, handleDeleteWidget]);

    const dragCbs: TreeDragCallbacks = {
        onDragStart: id => setDragState({ draggingId: id, dropTarget: null }),
        onDragOver: (id, position) => {
            setDragState(prev => {
                if (prev.dropTarget?.id === id && prev.dropTarget.position === position) return prev;
                return { ...prev, dropTarget: { id, position } };
            });
        },
        onDrop: () => {
            const { draggingId, dropTarget } = dragState;
            if (!draggingId || !dropTarget) { setDragState({ draggingId: null, dropTarget: null }); return; }
            if (draggingId === dropTarget.id) { setDragState({ draggingId: null, dropTarget: null }); return; }
            if (dropTarget.position === 'inside' && isDescendant(composition.widgets, draggingId, dropTarget.id)) {
                setDragState({ draggingId: null, dropTarget: null }); return;
            }
            onCompositionChange(c => ({ ...c, widgets: moveWidget(c.widgets, draggingId, dropTarget) }));
            setDragState({ draggingId: null, dropTarget: null });
        },
        onDragEnd: () => setDragState({ draggingId: null, dropTarget: null }),
    };

    const rootDropActive = dragState.dropTarget?.id === '__root__';
    const aspectRatio = `${composition.gameWidth} / ${composition.gameHeight}`;
    const generatedCode = generateScreenCode(composition);


    return (
        <div className="h-full flex flex-col bg-primary text-primary overflow-hidden">

            {/* ── Header ── */}
            <div className="flex-none flex items-center gap-3 px-4 py-2.5 border-b border-primary bg-secondary">
                <svg viewBox="0 0 20 20" className="w-5 h-5 text-accent flex-shrink-0" fill="none">
                    <rect x="2" y="2" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.5"/>
                    <rect x="5" y="5" width="4" height="10" rx="1" fill="currentColor" opacity="0.4"/>
                    <rect x="11" y="5" width="4" height="4"  rx="1" fill="currentColor" opacity="0.4"/>
                    <rect x="11" y="11" width="4" height="4" rx="1" fill="currentColor" opacity="0.4"/>
                </svg>
                <div>
                    <span className="text-xs text-secondary">Screen Layout Composer</span>
                    <span className="ml-2 font-mono text-sm font-bold text-primary">{screenName}</span>
                </div>
                <div className="flex-grow" />
                <button onClick={() => setCodeOpen(o => !o)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors
                        ${codeOpen
                            ? 'bg-accent text-white hover:bg-accent-hover'
                            : 'bg-tertiary text-secondary hover:bg-tertiary-hover hover:text-primary border border-primary'}`}>
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 4L1 8l4 4M11 4l4 4-4 4M9 2l-2 12"/>
                    </svg>
                    {codeOpen ? 'Hide Code' : 'Show Code'}
                </button>
            </div>

            {/* ── Locked banner ── */}
            {isLocked && (
                <div className="flex-none flex items-center gap-3 px-4 py-2.5 bg-amber-50 dark:bg-amber-900/25 border-b border-amber-300 dark:border-amber-700">
                    <svg viewBox="0 0 20 20" className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" fill="none">
                        <path d="M10 2a4 4 0 00-4 4v2H5a2 2 0 00-2 2v7a2 2 0 002 2h10a2 2 0 002-2v-7a2 2 0 00-2-2h-1V6a4 4 0 00-4-4zm0 2a2 2 0 012 2v2H8V6a2 2 0 012-2zm0 8a1.5 1.5 0 110 3 1.5 1.5 0 010-3z" fill="currentColor" opacity="0.8"/>
                    </svg>
                    <p className="flex-grow text-xs text-amber-800 dark:text-amber-300 font-medium">
                        This screen is defined in code — the composer shows the original layout. Edit the code directly, or duplicate to create an editable copy.
                    </p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {onGoToCode && (
                            <button onClick={onGoToCode}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800/50 border border-amber-300 dark:border-amber-600 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                Go to Code
                            </button>
                        )}
                        {onDuplicate && (
                            <button onClick={onDuplicate}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-amber-600 hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-500 text-white transition-colors">
                                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="5" y="1" width="9" height="11" rx="1.5"/><rect x="1" y="4" width="9" height="11" rx="1.5" fill="currentColor" opacity="0.2"/>
                                </svg>
                                Duplicate to Edit
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ── Three-panel body ── */}
            <div className={`flex-grow flex min-h-0 overflow-hidden ${isLocked ? 'opacity-60 pointer-events-none select-none' : ''}`}>

                {/* Left: Widget Palette */}
                <div className="flex-none w-44 border-r border-primary bg-secondary overflow-y-auto">
                    <div className="p-3 space-y-4">
                        {/* Context hint */}
                        <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[10px] font-semibold border
                            ${selectedId && selectedWidget && isContainer(selectedWidget)
                                ? 'bg-accent/10 border-accent/30 text-accent'
                                : 'bg-tertiary border-primary text-secondary'}`}>
                            <svg viewBox="0 0 12 12" className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                <path d="M6 2v8M2 6h8"/>
                            </svg>
                            {selectedId && selectedWidget && isContainer(selectedWidget)
                                ? <>Into <span className="font-mono ml-0.5">{selectedWidget.type}</span></>
                                : 'Add to top level'
                            }
                        </div>

                        {PALETTE_GROUPS.map(group => (
                            <div key={group.label}>
                                <div className="flex items-center gap-1.5 mb-2">
                                    <span className="text-secondary">{group.icon}</span>
                                    <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">{group.label}</span>
                                </div>
                                <div className="space-y-1.5">
                                    {group.types.map(type => (
                                        <button key={type} onClick={() => handleAddWidget(type)}
                                            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md border text-left
                                                transition-all duration-100 active:scale-95 ${WIDGET_TILE_COLORS[type]}`}>
                                            <span className={`flex-shrink-0 ${WIDGET_ICON_COLORS[type]}`}>
                                                {WIDGET_ICONS[type]}
                                            </span>
                                            <span className="text-xs font-semibold text-primary leading-none">
                                                {WIDGET_LABELS[type]}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Center: Preview canvas */}
                <div className="flex-grow flex flex-col items-center overflow-auto p-4 bg-tertiary gap-3 min-w-0">
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-secondary" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="2" width="14" height="12" rx="2"/><path d="M1 6h14" opacity="0.5"/></svg>
                        <span className="text-[10px] text-secondary uppercase tracking-wide font-semibold">
                            Preview — click to select
                        </span>
                        {selectedWidget && (
                            <span className="ml-1 text-[10px] text-secondary bg-tertiary border border-primary px-1.5 py-0.5 rounded-md">
                                <kbd className="font-mono text-[9px]">Del</kbd> to remove
                            </span>
                        )}
                    </div>
                    <div style={{ aspectRatio, width: '100%', position: 'relative', flexShrink: 0 }}
                        className="rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 overflow-hidden shadow-inner"
                        onClick={() => setSelectedId(null)}>
                        {composition.widgets.length === 0 && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
                                <svg viewBox="0 0 40 40" className="w-10 h-10 text-gray-300 dark:text-gray-600" fill="none">
                                    <rect x="4" y="4" width="32" height="32" rx="4" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3"/>
                                    <path d="M20 13v14M13 20h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                                </svg>
                                <span className="text-xs text-gray-400 dark:text-gray-500">Add widgets from the palette</span>
                            </div>
                        )}
                        {composition.widgets.map(widget => (
                            <PreviewWidget key={widget.id} widget={widget}
                                selectedId={selectedId} onSelect={setSelectedId}
                                onUpdateWidget={handleUpdateWidget} insideContainer={false} />
                        ))}
                    </div>
                </div>

                {/* Right: Widget Tree + Properties */}
                <div className="flex-none w-64 border-l border-primary flex flex-col min-h-0">

                    {/* Widget Tree */}
                    <div className="flex-none border-b border-primary bg-secondary flex flex-col overflow-hidden" style={{ maxHeight: '55%' }}>
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-primary flex-shrink-0 bg-header">
                            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-secondary" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                <path d="M2 4h12M2 8h8M2 12h10"/>
                            </svg>
                            <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Widget Tree</span>
                            <span className="ml-1 text-[10px] text-secondary bg-tertiary px-1.5 py-0.5 rounded-full">
                                {composition.widgets.length}
                            </span>
                            <div className="ml-auto flex items-center gap-0.5">
                                <button onClick={() => setExpandGen(n => n + 1)} title="Expand all"
                                    className="p-0.5 rounded text-secondary hover:text-primary hover:bg-tertiary-hover transition-colors">
                                    <svg viewBox="0 0 12 12" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                                        <path d="M2 4l4 4 4-4"/><path d="M2 8h8" opacity="0.4"/>
                                    </svg>
                                </button>
                                <button onClick={() => setCollapseGen(n => n + 1)} title="Collapse all"
                                    className="p-0.5 rounded text-secondary hover:text-primary hover:bg-tertiary-hover transition-colors">
                                    <svg viewBox="0 0 12 12" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                                        <path d="M2 8l4-4 4 4"/><path d="M2 4h8" opacity="0.4"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div className="overflow-y-auto p-1.5 flex-grow space-y-0.5">
                            {composition.widgets.length === 0 && (
                                <p className="text-[10px] text-secondary italic text-center py-4">No widgets yet</p>
                            )}
                            {composition.widgets.map((w, idx) => (
                                <TreeNode key={w.id} widget={w} depth={0}
                                    selectedId={selectedId} onSelect={setSelectedId}
                                    onMoveUp={id => handleMoveWidget(id, 'up')}
                                    onMoveDown={id => handleMoveWidget(id, 'down')}
                                    onDelete={handleDeleteWidget}
                                    isFirst={idx === 0} isLast={idx === composition.widgets.length - 1}
                                    drag={dragState} dragCbs={dragCbs}
                                    collapseGen={collapseGen} expandGen={expandGen} />
                            ))}
                            {dragState.draggingId && (
                                <div
                                    onDragOver={e => { e.preventDefault(); setDragState(prev => ({ ...prev, dropTarget: { id: '__root__', position: 'inside' } })); }}
                                    onDrop={e => { e.preventDefault(); dragCbs.onDrop(); }}
                                    className={`mt-2 mx-1 rounded-md border border-dashed text-[10px] text-center py-2 transition-all
                                        ${rootDropActive
                                            ? 'border-accent text-accent bg-accent/10'
                                            : 'border-gray-300 dark:border-gray-600 text-secondary'}`}>
                                    Drop here → top level
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Properties Inspector */}
                    <div className="flex-grow overflow-hidden bg-primary flex flex-col min-h-0">
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-primary bg-header flex-shrink-0">
                            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-secondary" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                <circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 2"/>
                            </svg>
                            <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Properties</span>
                            {selectedWidget && (
                                <span className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${WIDGET_ICON_COLORS[selectedWidget.type]} bg-current/10`}
                                    style={{ backgroundColor: 'currentColor', color: 'inherit' }}>
                                    <span className={WIDGET_ICON_COLORS[selectedWidget.type]}>{selectedWidget.type}</span>
                                </span>
                            )}
                        </div>
                        <div className="flex-grow overflow-y-auto">
                            <PropertiesPanel
                                widget={selectedWidget}
                                composition={composition}
                                onUpdateWidget={handleUpdateWidget}
                                onUpdateComposition={onCompositionChange}
                                screenName={screenName}
                                onRenameScreen={onRenameScreen}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Generated Code ── */}
            {codeOpen && (
                <div className="flex-none border-t border-primary bg-secondary flex flex-col" style={{ height: 210 }}>
                    <div className="flex items-center gap-2 justify-between px-3 py-2 border-b border-primary flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-secondary" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M5 4L1 8l4 4M11 4l4 4-4 4M9 2l-2 12"/>
                            </svg>
                            <span className="text-xs font-bold text-secondary">Generated Code</span>
                        </div>
                        <CopyButton text={generatedCode} size="sm" label="Copy" />
                    </div>
                    <pre className="flex-grow overflow-auto p-3 text-xs font-mono text-primary bg-primary leading-relaxed">
                        {generatedCode}
                    </pre>
                </div>
            )}
        </div>
    );
};

export default ScreenLayoutComposer;
