import React, { useState, useMemo } from 'react';
import type {
  Block,
  StickyNote,
  DiagnosticsResult,
  DiagnosticIssue,
  DiagnosticSeverity,
  DiagnosticsTask,
} from '../types';

interface DiagnosticsPanelProps {
  diagnostics: DiagnosticsResult;
  blocks: Block[];
  stickyNotes: StickyNote[];
  tasks: DiagnosticsTask[];
  onUpdateTasks: (tasks: DiagnosticsTask[]) => void;
  onOpenBlock: (blockId: string, line: number) => void;
  onHighlightBlock: (blockId: string) => void;
}

type ActiveView = 'issues' | 'tasks';
type SeverityFilter = 'all' | DiagnosticSeverity;

// ---------------------------------------------------------------------------
// Severity icon
// ---------------------------------------------------------------------------
function SeverityIcon({ severity }: { severity: DiagnosticSeverity }) {
  if (severity === 'error') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-500 flex-none" viewBox="0 0 20 20" fill="currentColor" aria-label="Error">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
    );
  }
  if (severity === 'warning') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-yellow-500 flex-none" viewBox="0 0 20 20" fill="currentColor" aria-label="Warning">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-400 flex-none" viewBox="0 0 20 20" fill="currentColor" aria-label="Info">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
  );
}

// Category display labels
const CATEGORY_LABELS: Record<string, string> = {
  'invalid-jump': 'Invalid Jump',
  'syntax': 'Syntax',
  'missing-image': 'Missing Image',
  'missing-audio': 'Missing Audio',
  'undefined-character': 'Undefined Character',
  'undefined-screen': 'Undefined Screen',
  'unused-character': 'Unused Character',
  'unreachable-label': 'Unreachable Label',
};

const CATEGORY_COLORS: Record<string, string> = {
  'invalid-jump':        'bg-red-50    text-red-700    dark:bg-red-900/30  dark:text-red-300',
  'syntax':              'bg-red-50    text-red-700    dark:bg-red-900/30  dark:text-red-300',
  'missing-image':       'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  'missing-audio':       'bg-pink-50   text-pink-700   dark:bg-pink-900/30 dark:text-pink-300',
  'undefined-character': 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  'undefined-screen':    'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'unused-character':    'bg-blue-50   text-blue-700   dark:bg-blue-900/30 dark:text-blue-300',
  'unreachable-label':   'bg-gray-100  text-gray-600   dark:bg-gray-700    dark:text-gray-300',
};

// ---------------------------------------------------------------------------
// Issue row
// ---------------------------------------------------------------------------
function IssueRow({ issue, blocks, onOpenBlock }: {
  issue: DiagnosticIssue;
  blocks: Block[];
  onOpenBlock: (blockId: string, line: number) => void;
}) {
  const block = blocks.find(b => b.id === issue.blockId);
  const fileName = block?.filePath
    ? block.filePath.split(/[\\/]/).pop()
    : issue.blockId ?? '—';

  const canNavigate = !!issue.blockId;
  const locationText = issue.line ? `${fileName}:${issue.line}` : fileName;
  const categoryLabel = CATEGORY_LABELS[issue.category] ?? issue.category;
  const categoryColor = CATEGORY_COLORS[issue.category] ?? 'bg-gray-100 text-gray-600';

  return (
    <div
      className={`flex items-start gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0 ${canNavigate ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer' : ''}`}
      onClick={() => canNavigate && onOpenBlock(issue.blockId!, issue.line ?? 1)}
      title={canNavigate ? `Go to ${locationText}` : undefined}
    >
      <div className="mt-0.5">
        <SeverityIcon severity={issue.severity} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug">{issue.message}</p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${categoryColor}`}>
            {categoryLabel}
          </span>
          {locationText && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500 font-mono">
              {locationText}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = ({
  diagnostics,
  blocks,
  stickyNotes,
  tasks,
  onUpdateTasks,
  onOpenBlock,
  onHighlightBlock,
}) => {
  const [activeView, setActiveView] = useState<ActiveView>('issues');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [filterText, setFilterText] = useState('');
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const [newTaskTitle, setNewTaskTitle] = useState('');

  // ---- Issues filtering + grouping ----------------------------------------

  const filteredIssues = useMemo(() => {
    let list = diagnostics.issues;
    if (severityFilter !== 'all') list = list.filter(i => i.severity === severityFilter);
    if (filterText) {
      const lower = filterText.toLowerCase();
      list = list.filter(i => i.message.toLowerCase().includes(lower) || (i.filePath ?? '').toLowerCase().includes(lower));
    }
    return list;
  }, [diagnostics.issues, severityFilter, filterText]);

  // Group issues by file
  const groupedIssues = useMemo(() => {
    const map = new Map<string, DiagnosticIssue[]>();
    for (const issue of filteredIssues) {
      const key = issue.filePath ?? issue.blockId ?? '(unknown file)';
      const existing = map.get(key) ?? [];
      existing.push(issue);
      map.set(key, existing);
    }
    // Sort: errors first within each file
    map.forEach(list => list.sort((a, b) => {
      const order = { error: 0, warning: 1, info: 2 };
      return (order[a.severity] - order[b.severity]) || ((a.line ?? 0) - (b.line ?? 0));
    }));
    return map;
  }, [filteredIssues]);

  function toggleFile(key: string) {
    setCollapsedFiles(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  // ---- Tasks (user-defined + sticky notes) ---------------------------------

  // Sticky notes auto-appear as non-persisted task previews
  const stickyNoteTasks: DiagnosticsTask[] = useMemo(() =>
    stickyNotes.map(note => ({
      id: `sticky:${note.id}`,
      title: note.content?.split('\n')[0]?.trim() || '(Empty note)',
      status: 'open' as const,
      stickyNoteId: note.id,
      createdAt: 0,
    })),
    [stickyNotes]
  );

  const allTasks = useMemo(() => {
    // Merge persisted tasks + sticky note previews, avoiding duplicates
    const stickyIds = new Set(stickyNotes.map(n => n.id));
    const nonStickyPersisted = tasks.filter(t => !t.stickyNoteId || !stickyIds.has(t.stickyNoteId));
    return [...stickyNoteTasks, ...nonStickyPersisted];
  }, [tasks, stickyNoteTasks, stickyNotes]);

  const filteredTasks = useMemo(() => {
    if (!filterText) return allTasks;
    const lower = filterText.toLowerCase();
    return allTasks.filter(t => t.title.toLowerCase().includes(lower) || (t.description ?? '').toLowerCase().includes(lower));
  }, [allTasks, filterText]);

  function addTask() {
    const title = newTaskTitle.trim();
    if (!title) return;
    const newTask: DiagnosticsTask = {
      id: crypto.randomUUID(),
      title,
      status: 'open',
      createdAt: Date.now(),
    };
    onUpdateTasks([...tasks, newTask]);
    setNewTaskTitle('');
  }

  function toggleTask(id: string) {
    onUpdateTasks(tasks.map(t =>
      t.id === id ? { ...t, status: t.status === 'open' ? 'completed' : 'open' } : t
    ));
  }

  function deleteTask(id: string) {
    onUpdateTasks(tasks.filter(t => t.id !== id));
  }

  // ---- Tab counts ----------------------------------------------------------

  const openTaskCount = allTasks.filter(t => t.status === 'open').length;

  // ---- Render --------------------------------------------------------------

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Header: view toggle + search */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b border-gray-200 dark:border-gray-700 flex-none">
        {/* Segmented control */}
        <div className="flex rounded-md border border-gray-200 dark:border-gray-600 overflow-hidden text-sm flex-none">
          <button
            className={`px-3 py-1 ${activeView === 'issues' ? 'bg-indigo-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            onClick={() => setActiveView('issues')}
          >
            Issues
            {diagnostics.errorCount + diagnostics.warningCount + diagnostics.infoCount > 0 && (
              <span className={`ml-1.5 px-1.5 rounded-full text-[11px] font-semibold ${activeView === 'issues' ? 'bg-white/30 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                {diagnostics.errorCount + diagnostics.warningCount + diagnostics.infoCount}
              </span>
            )}
          </button>
          <button
            className={`px-3 py-1 border-l border-gray-200 dark:border-gray-600 ${activeView === 'tasks' ? 'bg-indigo-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            onClick={() => setActiveView('tasks')}
          >
            Tasks
            {openTaskCount > 0 && (
              <span className={`ml-1.5 px-1.5 rounded-full text-[11px] font-semibold ${activeView === 'tasks' ? 'bg-white/30 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                {openTaskCount}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="flex-1 relative">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Filter…"
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            className="w-full pl-7 pr-2 py-1 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </div>
      </div>

      {/* Issues view */}
      {activeView === 'issues' && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Severity filter pills */}
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-100 dark:border-gray-700 flex-none flex-wrap">
            {(['all', 'error', 'warning', 'info'] as const).map(s => {
              const count = s === 'all' ? diagnostics.issues.length
                : s === 'error' ? diagnostics.errorCount
                : s === 'warning' ? diagnostics.warningCount
                : diagnostics.infoCount;
              const active = severityFilter === s;
              const colors = s === 'error' ? 'bg-red-500 text-white' :
                s === 'warning' ? 'bg-yellow-500 text-white' :
                s === 'info' ? 'bg-blue-400 text-white' :
                'bg-indigo-500 text-white';
              return (
                <button
                  key={s}
                  onClick={() => setSeverityFilter(s)}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${active ? colors : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500'}`}
                >
                  {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)} ({count})
                </button>
              );
            })}
          </div>

          {/* Issue list */}
          <div className="flex-1 overflow-y-auto">
            {groupedIssues.size === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400 dark:text-gray-500 p-8 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-medium">No issues found</p>
                <p className="text-xs">Your project looks clean!</p>
              </div>
            )}
            {Array.from(groupedIssues.entries()).map(([fileKey, fileIssues]) => {
              const fileName = fileKey.split(/[\\/]/).pop() ?? fileKey;
              const isCollapsed = collapsedFiles.has(fileKey);
              const errorCount = fileIssues.filter(i => i.severity === 'error').length;
              const warnCount = fileIssues.filter(i => i.severity === 'warning').length;

              return (
                <div key={fileKey} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                  {/* File header */}
                  <button
                    className="w-full flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 text-left"
                    onClick={() => toggleFile(fileKey)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate flex-1">{fileName}</span>
                    <span className="flex items-center gap-1 flex-none">
                      {errorCount > 0 && <span className="text-[10px] font-bold text-red-500">{errorCount}E</span>}
                      {warnCount > 0 && <span className="text-[10px] font-bold text-yellow-500">{warnCount}W</span>}
                      {fileIssues.length - errorCount - warnCount > 0 && (
                        <span className="text-[10px] font-bold text-blue-400">{fileIssues.length - errorCount - warnCount}I</span>
                      )}
                    </span>
                  </button>
                  {/* Issue rows */}
                  {!isCollapsed && fileIssues.map(issue => (
                    <IssueRow
                      key={issue.id}
                      issue={issue}
                      blocks={blocks}
                      onOpenBlock={onOpenBlock}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tasks view */}
      {activeView === 'tasks' && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Add task input */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-700 flex-none">
            <input
              type="text"
              placeholder="New task… (Enter to add)"
              value={newTaskTitle}
              onChange={e => setNewTaskTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTask(); }}
              className="flex-1 px-2.5 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <button
              onClick={addTask}
              disabled={!newTaskTitle.trim()}
              className="px-3 py-1.5 text-sm bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed flex-none"
            >
              Add
            </button>
          </div>

          {/* Task list */}
          <div className="flex-1 overflow-y-auto">
            {filteredTasks.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400 dark:text-gray-500 p-8 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-sm font-medium">No tasks yet</p>
                <p className="text-xs">Add tasks above, or they'll appear from canvas sticky notes.</p>
              </div>
            )}
            {filteredTasks.map(task => {
              const isSticky = !!task.stickyNoteId;
              const stickyNote = isSticky ? stickyNotes.find(n => n.id === task.stickyNoteId) : undefined;
              const isPersisted = tasks.some(t => t.id === task.id);

              return (
                <div
                  key={task.id}
                  className={`flex items-start gap-2 px-3 py-2.5 border-b border-gray-100 dark:border-gray-700 last:border-0 ${task.status === 'completed' ? 'opacity-60' : ''}`}
                >
                  {/* Status toggle (only for persisted tasks) */}
                  {isPersisted ? (
                    <button
                      onClick={() => toggleTask(task.id)}
                      className="mt-0.5 flex-none text-gray-400 hover:text-indigo-500"
                      aria-label={task.status === 'completed' ? 'Mark open' : 'Mark complete'}
                    >
                      {task.status === 'completed' ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </button>
                  ) : (
                    /* Sticky note indicator */
                    <div className="mt-0.5 flex-none">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-yellow-400" viewBox="0 0 20 20" fill="currentColor" aria-label="Canvas sticky note">
                        <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
                      </svg>
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-snug ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-800 dark:text-gray-200'}`}>
                      {task.title}
                    </p>
                    {task.description && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{task.description}</p>
                    )}
                    {/* Sticky note: navigate to it on canvas */}
                    {isSticky && stickyNote && (
                      <button
                        onClick={() => onHighlightBlock(stickyNote.id)}
                        className="text-[11px] text-indigo-500 hover:text-indigo-400 mt-0.5"
                      >
                        Show on canvas
                      </button>
                    )}
                    {/* File link */}
                    {task.blockId && (
                      <button
                        onClick={() => onOpenBlock(task.blockId!, task.line ?? 1)}
                        className="text-[11px] text-indigo-500 hover:text-indigo-400 mt-0.5 block"
                      >
                        {blocks.find(b => b.id === task.blockId)?.filePath?.split(/[\\/]/).pop() ?? task.blockId}
                        {task.line ? `:${task.line}` : ''}
                      </button>
                    )}
                  </div>

                  {/* Delete (only persisted tasks) */}
                  {isPersisted && (
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="mt-0.5 flex-none text-gray-300 hover:text-red-400 dark:text-gray-600 dark:hover:text-red-400"
                      aria-label="Delete task"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default DiagnosticsPanel;
