import React, { useMemo, useState, useRef, useEffect } from 'react';
import type { Theme } from '../types';
import logo from '../vangard-renide-512x512.png';

type SaveStatus = 'saving' | 'saved' | 'error';

interface ToolbarProps {
  directoryHandle: FileSystemDirectoryHandle | null;
  projectRootPath: string | null;
  dirtyBlockIds: Set<string>;
  dirtyEditors: Set<string>;
  hasUnsavedSettings: boolean;
  saveStatus: SaveStatus;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  addBlock: () => void;
  handleTidyUp: () => void;
  onRequestNewProject: () => void;
  requestOpenFolder: () => void;
  handleSave: () => void;
  onOpenSettings: () => void;
  onOpenStaticTab: (type: 'canvas' | 'route-canvas' | 'stats' | 'diagnostics') => void;
  diagnosticsErrorCount: number;
  onAddStickyNote: () => void;
  isGameRunning: boolean;
  onRunGame: () => void;
  onStopGame: () => void;
  renpyPath: string;
  isRenpyPathValid: boolean;
  draftingMode: boolean;
  onToggleDraftingMode: (enabled: boolean) => void;
}

const ToolbarButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode; }> = ({ children, ...props }) => {
  const childrenArray = React.Children.toArray(children);
  const hasText = childrenArray.some(child => typeof child === 'string' || (React.isValidElement(child) && child.type === 'span'));
  
  const layoutClass = hasText ? 'px-3 py-1.5 space-x-2' : 'p-2';

  return (
    <button
      {...props}
      className={`flex items-center justify-center rounded-md text-sm font-medium bg-tertiary hover:bg-tertiary-hover text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${layoutClass} ${props.className || ''}`}
    >
      {children}
    </button>
  );
};

const Toolbar: React.FC<ToolbarProps> = ({
  directoryHandle,
  projectRootPath,
  dirtyBlockIds,
  dirtyEditors,
  hasUnsavedSettings,
  saveStatus,
  canUndo,
  canRedo,
  undo,
  redo,
  addBlock,
  handleTidyUp,
  onRequestNewProject,
  requestOpenFolder,
  handleSave,
  onOpenSettings,
  onOpenStaticTab,
  diagnosticsErrorCount,
  onAddStickyNote,
  isGameRunning,
  onRunGame,
  onStopGame,
  renpyPath,
  isRenpyPathValid,
  draftingMode,
  onToggleDraftingMode,
}) => {

  const totalUnsavedCount = useMemo(() => {
    return new Set([...dirtyBlockIds, ...dirtyEditors]).size;
  }, [dirtyBlockIds, dirtyEditors]);

  const hasUnsavedChanges = totalUnsavedCount > 0 || hasUnsavedSettings;
  const unsavedItemsCount = totalUnsavedCount + (hasUnsavedSettings ? 1 : 0);

  const SaveStatusIndicator: React.FC = () => {
    switch (saveStatus) {
      case 'saving':
        return (
          <div className="flex items-center space-x-2 text-sm text-secondary">
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Saving...</span>
          </div>
        );
      case 'saved':
        return null;
      case 'error':
        return (
           <div className="flex items-center space-x-2 text-sm text-red-600 dark:text-red-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
            <span>Save Error</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <header className="flex-shrink-0 h-16 bg-header border-b border-primary flex items-center justify-between px-4 z-30">
      <div className="flex items-center space-x-4">
        <img src={logo} alt="Ren'IDE Logo" className="h-12 w-auto" />
      </div>

      <div className="flex items-center space-x-2">
        <ToolbarButton onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" /></svg>
        </ToolbarButton>
        <ToolbarButton onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)" aria-label="Redo">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
        </ToolbarButton>
        <div className="h-6 w-px bg-primary"></div>
        <ToolbarButton onClick={addBlock} title="Add New Block (N)">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
            <span>Add Block</span>
        </ToolbarButton>
        <ToolbarButton onClick={onAddStickyNote} title="Add Sticky Note">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v11a3 3 0 106 0V4a2 2 0 00-2-2H4zm1 14a1 1 0 100-2 1 1 0 000 2zm5-1.757l4.9-4.9a2 2 0 000-2.828L13.485 5.1a2 2 0 00-2.828 0L10 5.757v8.486zM16 18H9.071l6-6H16a2 2 0 012 2v2a2 2 0 01-2 2z" clipRule="evenodd" /></svg>
            <span>Add Note</span>
        </ToolbarButton>
        <ToolbarButton onClick={handleTidyUp} title="Tidy Up Layout">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            <span>Tidy Up</span>
        </ToolbarButton>
        <div className="h-6 w-px bg-primary"></div>
        <ToolbarButton onClick={() => onOpenStaticTab('diagnostics')} title="Diagnostics" aria-label="Diagnostics">
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {diagnosticsErrorCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 px-1 py-px text-[9px] font-bold bg-red-500 text-white rounded-full min-w-[14px] text-center leading-tight">
                {diagnosticsErrorCount}
              </span>
            )}
          </div>
          <span>Diagnostics</span>
        </ToolbarButton>
        <ToolbarButton onClick={() => onOpenStaticTab('stats')} title="Script Statistics" aria-label="Script Statistics">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
            </svg>
            <span>Stats</span>
        </ToolbarButton>
      </div>

      <div className="flex items-center space-x-2">
        {/* Drafting Mode Toggle */}
        <div className="flex items-center space-x-2 mr-2">
            <span className={`text-xs font-bold ${draftingMode ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>Drafting Mode</span>
            <button 
                onClick={() => onToggleDraftingMode(!draftingMode)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${draftingMode ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                title={draftingMode ? "Disable Drafting Mode (auto-generated placeholders will be removed)" : "Enable Drafting Mode (missing assets will be auto-generated)"}
                aria-label={draftingMode ? "Disable Drafting Mode" : "Enable Drafting Mode"}
            >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${draftingMode ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
        </div>

        {isGameRunning ? (
            <button onClick={onStopGame} title="Stop Game" className="flex items-center justify-center rounded-md text-sm font-medium px-3 py-1.5 space-x-2 bg-red-600 hover:bg-red-700 text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1zm4 0a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                <span>Stop</span>
            </button>
        ) : (
            <button onClick={onRunGame} disabled={!projectRootPath || !isRenpyPathValid} title="Run Project (F5)" className="flex items-center justify-center rounded-md text-sm font-medium px-3 py-1.5 space-x-2 bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                <span>Run</span>
            </button>
        )}
        <div className="h-6 w-px bg-primary"></div>

        <ToolbarButton
            onClick={handleSave}
            disabled={!hasUnsavedChanges}
            className={hasUnsavedChanges ? 'bg-red-600 hover:bg-red-700 !text-white' : ''}
            title={
                !hasUnsavedChanges
                ? 'No changes to save'
                : `Save All (${unsavedItemsCount} unsaved change${unsavedItemsCount === 1 ? '' : 's'}) (Ctrl+S)`
            }
        >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H9.5a1 1 0 0 0-1 1v4.5h2a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5-.5H7a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 1 .5-.5h2V2H2z"/>
                <path d="M4.5 12a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5-.5h-3z"/>
            </svg>
        </ToolbarButton>

        <SaveStatusIndicator />

        <ToolbarButton onClick={onOpenSettings} title="Settings" aria-label="Settings">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.532 1.532 0 012.287-.947c1.372.836 2.942-.734-2.106-2.106a1.532 1.532 0 01-.947-2.287c1.561-.379-1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
        </ToolbarButton>
      </div>
    </header>
  );
};

export default Toolbar;
