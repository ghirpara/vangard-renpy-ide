/**
 * @file EditorView.tsx
 * @description Monaco-based code editor for Ren'Py files (761 lines).
 * Integrates VS Code editor with syntax highlighting, error markers, and AI content generation.
 * Handles editing, error display, definition navigation, and code completion for Ren'Py syntax.
 * Supports undo/redo, minimap, and integration with story canvas for navigation.
 */

import React, { useRef, useEffect, useState } from 'react';
import Editor, { OnMount, BeforeMount } from '@monaco-editor/react';
import type { Block, RenpyAnalysisResult, ToastMessage } from '../types';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

interface EditorViewProps {
  block: Block;
  blocks: Block[];
  analysisResult: RenpyAnalysisResult;
  initialScrollRequest?: { line: number; key: number };
  onSwitchFocusBlock: (blockId: string, line: number) => void;
  onSave: (blockId: string, newContent: string) => void;
  onTriggerSave?: (blockId: string) => void;
  onDirtyChange: (blockId: string, isDirty: boolean) => void;
  editorTheme: 'light' | 'dark';
  editorFontFamily: string;
  editorFontSize: number;
  enableAiFeatures: boolean;
  availableModels: string[];
  selectedModel: string;
  addToast: (message: string, type: ToastMessage['type']) => void;
  onEditorMount: (blockId: string, editor: monaco.editor.IStandaloneCodeEditor) => void;
  onEditorUnmount: (blockId: string) => void;
  onCursorPositionChange?: (pos: { line: number; column: number } | null) => void;
  draftingMode: boolean;
  existingImageTags: Set<string>;
  existingAudioPaths: Set<string>;
}

const LABEL_REGEX = /^\s*label\s+([a-zA-Z0-9_]+):/;
const JUMP_REGEX = /\b(jump|call)\s+([a-zA-Z0-9_]+)/g;
const AUDIO_USAGE_REGEX = /^\s*(?:play|queue)\s+\w+\s+(.+)/;
// Ren'Py keywords that follow `jump`/`call` but are not label targets.
const JUMP_KEYWORD_TARGETS = new Set(['expression', 'screen']);

const Breadcrumbs: React.FC<{ filePath?: string, context?: string }> = ({ filePath, context }) => {
    if (!filePath) return null;
    
    const parts = filePath.split(/[/\\]/);
    
    return (
        <div className="flex items-center space-x-1 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-1.5 select-none overflow-hidden">
            {parts.map((part, i) => (
                <React.Fragment key={i}>
                    {i > 0 && <span className="opacity-50">/</span>}
                    <span className={i === parts.length - 1 && !context ? "font-semibold text-gray-700 dark:text-gray-200" : ""}>{part}</span>
                </React.Fragment>
            ))}
            {context && (
                <>
                    <span className="opacity-50">&gt;</span>
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400 flex items-center">
                        {context}
                    </span>
                </>
            )}
        </div>
    );
};

const EditorView: React.FC<EditorViewProps> = (props) => {
  const { 
    block, 
    blocks,
    analysisResult,
    initialScrollRequest,
    onSwitchFocusBlock,
    onSave, 
    onTriggerSave,
    onDirtyChange,
    editorTheme,
    editorFontFamily,
    editorFontSize,
    enableAiFeatures,
    availableModels,
    selectedModel,
    addToast,
    onEditorMount,
    onEditorUnmount,
    onCursorPositionChange,
    draftingMode,
    existingImageTags,
    existingAudioPaths
  } = props;
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monaco | null>(null);
  const aiFeaturesEnabledContextKey = useRef<monaco.editor.IContextKey<boolean> | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const decorationIds = useRef<string[]>([]);
  const draftingDecorationIds = useRef<string[]>([]);
  const [currentContext, setCurrentContext] = useState<string>('');
  
  // Track dirty state internally to prevent redundant updates
  const isDirtyRef = useRef(false);

  // Refs to keep track of latest props for closures
  const onDirtyChangeRef = useRef(onDirtyChange);
  const onTriggerSaveRef = useRef(onTriggerSave);
  const blockRef = useRef(block);
  const onSwitchFocusBlockRef = useRef(onSwitchFocusBlock);
  const analysisResultRef = useRef(analysisResult);
  const onEditorUnmountRef = useRef(onEditorUnmount);
  const onCursorPositionChangeRef = useRef(onCursorPositionChange);

  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
    onTriggerSaveRef.current = onTriggerSave;
    blockRef.current = block;
    onSwitchFocusBlockRef.current = onSwitchFocusBlock;
    analysisResultRef.current = analysisResult;
    onEditorUnmountRef.current = onEditorUnmount;
    onCursorPositionChangeRef.current = onCursorPositionChange;
  }, [onDirtyChange, onTriggerSave, block, onSwitchFocusBlock, analysisResult, onEditorUnmount, onCursorPositionChange]);

  // This effect resets the internal dirty flag when the block content is updated
  // from an external source (like a save operation). This ensures the component can
  // correctly detect the next user edit and report it.
  useEffect(() => {
    if (editorRef.current) {
        const isNowDirty = editorRef.current.getValue() !== block.content;
        if (isDirtyRef.current && !isNowDirty) {
            isDirtyRef.current = false;
        }
    }
  }, [block.content]);


  useEffect(() => {
    return () => {
        // On unmount, just signal to the parent.
        // The parent's `onEditorUnmount` handler is responsible for syncing state
        // and managing the dirty state transition. This avoids race conditions.
        onEditorUnmountRef.current(blockRef.current.id);
        onCursorPositionChangeRef.current?.(null);
    };
  }, []); // <-- Empty array ensures this runs ONLY on unmount
  
  useEffect(() => {
    if (editorRef.current && initialScrollRequest) {
        const editor = editorRef.current;
        setTimeout(() => {
            editor.revealLineInCenter(initialScrollRequest.line, monaco.editor.ScrollType.Smooth);
            editor.setPosition({ lineNumber: initialScrollRequest.line, column: 1 });
        }, 100); 
    }
  }, [initialScrollRequest]);

  useEffect(() => {
    if (aiFeaturesEnabledContextKey.current) {
      aiFeaturesEnabledContextKey.current.set(enableAiFeatures);
    }
  }, [enableAiFeatures]);

  const handleEditorWillMount: BeforeMount = (monacoInstance) => {
    // Only register if not already registered
    if (!monacoInstance.languages.getLanguages().some(({ id }) => id === 'renpy')) {
      monacoInstance.languages.register({ id: 'renpy', extensions: ['.rpy'], aliases: ['RenPy', 'renpy'] });
      
      monacoInstance.languages.setLanguageConfiguration('renpy', {
        comments: { lineComment: '#' },
        brackets: [['(', ')'], ['{', '}'], ['[', ']']],
        autoClosingPairs: [
          { open: '(', close: ')' }, { open: '{', close: '}' }, { open: '[', close: ']' },
          { open: '"', close: '"' }, { open: "'", close: "'" },
        ],
        surroundingPairs: [
          { open: '(', close: ')' }, { open: '{', close: '}' }, { open: '[', close: ']' },
          { open: '"', close: '"' }, { open: "'", close: "'" },
        ],
      });

      monacoInstance.languages.setMonarchTokensProvider('renpy', {
        keywords: ['label', 'jump', 'call', 'menu', 'scene', 'show', 'hide', 'with', 'define', 'default', 'python', 'init', 'if', 'elif', 'else', 'return', 'expression', 'pass', 'while', 'for', 'in', 'image', 'transform', 'screen', 'text', 'vbox', 'hbox', 'frame', 'button', 'bar', 'vpgrid', 'viewport'],
        tokenizer: { 
            root: [
                [/#.*$/, 'comment'], 
                [/"/, 'string', '@string_double'], 
                [/'/, 'string', '@string_single'], 
                [/\b(label|jump|call|menu|scene|show|hide|with|define|default|python|init|if|elif|else|return|expression|pass|while|for|in|image|transform|screen)\b/, 'keyword'],
                [/\b[a-zA-Z_]\w*/, 'identifier'],
                [/\b\d+/, 'number'], 
                [/[:=+\-*/!<>]+/, 'operator'], 
                [/[(),.]/, 'punctuation']
            ], 
            string_double: [[/[^\\"]+/, 'string'], [/\\./, 'string.escape'], [/"/, 'string', '@pop']], 
            string_single: [[/[^\\']+/, 'string'], [/\\./, 'string.escape'], [/'/, 'string', '@pop']] 
        },
      });
      
      monacoInstance.editor.defineTheme('renpy-dark', { 
          base: 'vs-dark', 
          inherit: true, 
          rules: [
              { token: 'keyword', foreground: 'C678DD' }, // Purple
              { token: 'string', foreground: '98C379' }, // Green
              { token: 'comment', foreground: '5C6370', fontStyle: 'italic' }, // Grey
              { token: 'number', foreground: 'D19A66' }, // Orange
              { token: 'identifier', foreground: 'ABB2BF' }, // White/Grey
              { token: 'operator', foreground: '56B6C2' }, // Cyan
              { token: 'punctuation', foreground: 'ABB2BF' }
          ], 
          colors: { 'editor.background': '#282C34' } 
      });
      
      monacoInstance.editor.defineTheme('renpy-light', { 
          base: 'vs', 
          inherit: true, 
          rules: [
              { token: 'keyword', foreground: 'A626A4' }, 
              { token: 'string', foreground: '50A14F' }, 
              { token: 'comment', foreground: 'A0A1A7', fontStyle: 'italic' }, 
              { token: 'number', foreground: '986801' }, 
              { token: 'identifier', foreground: '383A42' }, 
              { token: 'operator', foreground: '0184BC' }, 
              { token: 'punctuation', foreground: '383A42' }
          ], 
          colors: { 'editor.background': '#FAFAFA' } 
      });
    }
  };

  const performValidation = (code: string, monacoInstance: typeof monaco): monaco.editor.IMarkerData[] => {
    const markers: monaco.editor.IMarkerData[] = [];

    // Skip jump validation until the analysis engine has run at least once.
    // Without analysis data every cross-file jump would appear invalid on first load.
    const analysisLabels = analysisResultRef.current.labels;
    if (Object.keys(analysisLabels).length === 0) return markers;

    const lines = code.split('\n');
    const localLabels = new Set<string>();
    lines.forEach(line => {
        const match = line.match(LABEL_REGEX);
        if (match) localLabels.add(match[1]);
    });

    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      const trimmedLine = line.trim();
      if (trimmedLine === '' || trimmedLine.startsWith('#')) return;

      // Strip string literals and inline comments before scanning for jumps so
      // we don't flag label names that appear inside quoted text or comments.
      let sanitizedLine = line
          .replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, m => ' '.repeat(m.length))
          .replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, m => ' '.repeat(m.length));
      const commentIndex = sanitizedLine.indexOf('#');
      if (commentIndex !== -1) sanitizedLine = sanitizedLine.substring(0, commentIndex);

      const lineJumpRegex = new RegExp(JUMP_REGEX);
      let match;
      while ((match = lineJumpRegex.exec(sanitizedLine)) !== null) {
          const target = match[2];
          if (JUMP_KEYWORD_TARGETS.has(target)) continue;

          const isLocal = localLabels.has(target);
          const globalLabelDef = analysisLabels[target];
          const isExternal = globalLabelDef && globalLabelDef.blockId !== blockRef.current.id;

          if (!isLocal && !isExternal) {
              const targetStart = match.index + match[0].indexOf(target);
              markers.push({
                  startLineNumber: lineNumber,
                  startColumn: targetStart + 1,
                  endLineNumber: lineNumber,
                  endColumn: targetStart + 1 + target.length,
                  message: `Invalid jump: Label '${target}' not found in project.`,
                  severity: monacoInstance.MarkerSeverity.Error,
              });
          }
      }
    });

    return markers;
  };

  const updateContext = () => {
      if (!editorRef.current) return;
      const position = editorRef.current.getPosition();
      if (!position) return;

      const lineNumber = position.lineNumber;
      const model = editorRef.current.getModel();
      if (!model) return;

      let bestContext = '';
      for (let i = lineNumber; i >= 1; i--) {
          const lineContent = model.getLineContent(i);
          const labelMatch = lineContent.match(/^\s*label\s+([a-zA-Z0-9_]+):/);
          const screenMatch = lineContent.match(/^\s*screen\s+([a-zA-Z0-9_]+)/);

          if (labelMatch) {
              bestContext = `label ${labelMatch[1]}`;
              break;
          }
          if (screenMatch) {
              bestContext = `screen ${screenMatch[1]}`;
              break;
          }
      }
      setCurrentContext(bestContext);
  };

  const handleEditorDidMount: OnMount = (editor, monacoInstance) => {
    editorRef.current = editor;
    monacoRef.current = monacoInstance as any; // Type casting to satisfy TS if needed

    // Ensure language is set correctly
    const model = editor.getModel();
    if (model) {
        monacoInstance.editor.setModelLanguage(model, 'renpy');
    }

    onEditorMount(block.id, editor);
    editor.focus();
    setIsMounted(true);
    updateContext();

    aiFeaturesEnabledContextKey.current = editor.createContextKey('aiFeaturesEnabled', enableAiFeatures);

    const editorNode = editor.getDomNode();
    if (editorNode) {
      editorNode.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      });

      editorNode.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const data = e.dataTransfer?.getData('application/renpy-dnd');
        if (data) {
          try {
            const payload = JSON.parse(data);
            const target = editor.getTargetAtClientPoint(e.clientX, e.clientY);
            if (target && target.position) {
              const position = target.position;
              editor.executeEdits('dnd', [{
                range: new monacoInstance.Range(position.lineNumber, position.column, position.lineNumber, position.column),
                text: payload.text,
                forceMoveMarkers: true
              }]);
              editor.setPosition(position);
              editor.focus();
            }
          } catch (err) {
            console.error("Failed to parse drop data", err);
          }
        }
      });
    }

    editor.onDidChangeModelContent(() => {
        const currentContent = editor.getValue();
        const savedContent = blockRef.current.content;
        const isDirty = currentContent !== savedContent;
        
        if (isDirty !== isDirtyRef.current) {
            isDirtyRef.current = isDirty;
            onDirtyChangeRef.current(blockRef.current.id, isDirty);
        }
        
        const markers = performValidation(currentContent, monacoInstance as any);
        monacoInstance.editor.setModelMarkers(editor.getModel()!, 'renpy', markers);
    });
    
    editor.onDidChangeCursorPosition(() => {
        updateContext();
        const pos = editor.getPosition();
        if (pos) onCursorPositionChangeRef.current?.({ line: pos.lineNumber, column: pos.column });
    });

    editor.addAction({
        id: 'save-block',
        label: 'Save',
        keybindings: [monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS],
        run: () => {
            if (onTriggerSaveRef.current) {
                onTriggerSaveRef.current(blockRef.current.id);
            }
        }
    });

    editor.onMouseDown((e) => {
      if (e.target.type !== monacoInstance.editor.MouseTargetType.CONTENT_TEXT || !e.target.position) return;
      if (!e.event.ctrlKey && !e.event.metaKey) return;
  
      const position = e.target.position;
      const model = editor.getModel();
      if (!model) return;

      const lineContent = model.getLineContent(position.lineNumber);
      
      const lineJumpRegex = new RegExp(JUMP_REGEX);
      let match;
      let foundTarget = null;
      let isJump = false;

      while ((match = lineJumpRegex.exec(lineContent)) !== null) {
          const target = match[2];
          if (target === 'expression' || target === 'screen') continue;
          const targetStartCol = match.index + match[0].indexOf(target) + 1;
          const targetEndCol = targetStartCol + target.length;

          if (position.column >= targetStartCol && position.column <= targetEndCol) {
              foundTarget = target;
              isJump = true;
              break;
          }
      }

      if (isJump && foundTarget) {
          e.event.preventDefault();
          const localLines = model.getValue().split('\n');
          let localLineNumber = -1;
          for(let i=0; i<localLines.length; i++) {
              if (localLines[i].match(new RegExp(`^\\s*label\\s+${foundTarget}:`))) {
                  localLineNumber = i + 1;
                  break;
              }
          }

          if (localLineNumber !== -1) {
              editor.pushUndoStop();
              editor.setPosition({ lineNumber: localLineNumber, column: 1 });
              editor.revealLineInCenter(localLineNumber);
              editor.focus();
          } else {
              const targetLabelLocation = analysisResultRef.current.labels[foundTarget];
              if (targetLabelLocation) {
                  onSwitchFocusBlockRef.current(targetLabelLocation.blockId, targetLabelLocation.line);
              }
          }
      }
    });

    const markers = performValidation(editor.getValue(), monacoInstance as any);
    monacoInstance.editor.setModelMarkers(editor.getModel()!, 'renpy', markers);
  };
  
  useEffect(() => {
      if (!isMounted || !editorRef.current || !monacoRef.current) return;

      const monacoInstance = monacoRef.current;
      const model = editorRef.current.getModel();
      if (!model) return;

      // When the file has unsaved edits, the analysis result reflects the saved
      // version and line numbers may be stale. In that case, the real-time markers
      // from performValidation (fired on every keystroke) are more accurate, so
      // don't overwrite them here.
      const currentContent = editorRef.current.getValue();
      if (currentContent !== blockRef.current.content) return;

      // Use the analysis engine's pre-computed jump locations. These come from the
      // same parser that drives the canvas links, so column positions are accurate
      // and all edge cases (expression jumps, `call screen`, string literals, etc.)
      // are already handled.
      const blockJumps = analysisResult.jumps[block.id] ?? [];
      const invalidTargets = new Set(analysisResult.invalidJumps[block.id] ?? []);

      const markers: monaco.editor.IMarkerData[] = blockJumps
          .filter(jump => !jump.isDynamic && invalidTargets.has(jump.target) && !JUMP_KEYWORD_TARGETS.has(jump.target))
          .map(jump => ({
              startLineNumber: jump.line,
              // columnStart/columnEnd in JumpLocation are 0-indexed; Monaco uses 1-indexed columns.
              startColumn: jump.columnStart + 1,
              endLineNumber: jump.line,
              endColumn: jump.columnEnd + 1,
              message: `Invalid jump: Label '${jump.target}' not found in project.`,
              severity: monacoInstance.MarkerSeverity.Error,
          }));

      monacoInstance.editor.setModelMarkers(model, 'renpy', markers);
  }, [analysisResult, isMounted]);
  
  useEffect(() => {
      if (!isMounted || !editorRef.current || !monacoRef.current) return;
  
      const editor = editorRef.current;
      const model = editor.getModel();
      if (!model) return;
      
      // Use monaco instance from ref
      const monacoInstance = monacoRef.current;
  
      const newDecorations: monaco.editor.IModelDeltaDecoration[] = [];
      const newDraftingDecorations: monaco.editor.IModelDeltaDecoration[] = [];
      
      const lines = model.getValue().split('\n');
      const localLabels = new Set<string>();
      lines.forEach(line => {
          const match = line.match(LABEL_REGEX);
          if (match) localLabels.add(match[1]);
      });

      lines.forEach((line, index) => {
          const lineNumber = index + 1;
          let sanitizedLine = line.replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, m => ' '.repeat(m.length)).replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, m => ' '.repeat(m.length));
          const commentIndex = sanitizedLine.indexOf('#');
          if (commentIndex !== -1) sanitizedLine = sanitizedLine.substring(0, commentIndex);

          const lineJumpRegex = new RegExp(JUMP_REGEX);
          let match;
          while ((match = lineJumpRegex.exec(sanitizedLine)) !== null) {
              const target = match[2];
              if (target === 'expression' || target === 'screen') continue;

              const startCol = match.index + match[0].indexOf(target) + 1;
              const endCol = startCol + target.length;

              const isLocal = localLabels.has(target);
              const globalLabelDef = analysisResultRef.current.labels[target];
              const isExternal = globalLabelDef && globalLabelDef.blockId !== block.id;

              if (isLocal || isExternal) {
                  newDecorations.push({
                      range: new monacoInstance.Range(lineNumber, startCol, lineNumber, endCol),
                      options: {
                          inlineClassName: 'renpy-jump-link',
                          hoverMessage: { value: `Cmd/Ctrl + click to jump to '${target}'`, isTrusted: true }
                      }
                  });
              } else {
                   newDecorations.push({
                      range: new monacoInstance.Range(lineNumber, startCol, lineNumber, endCol),
                      options: {
                          inlineClassName: 'renpy-jump-invalid',
                          hoverMessage: { value: `Label '${target}' not found.`, isTrusted: true }
                      }
                  });
              }
          }

          if (draftingMode) {
              // ... drafting mode checks logic ...
              // (Abbreviated to keep XML concise as logic remains same, just ensuring correct range usage if any)
              const showRegex = /^\s*(show|scene)\s+/;
              const showMatch = line.match(showRegex);
              if (showMatch) {
                  const prefixLen = showMatch[0].length;
                  const restOfLine = line.slice(prefixLen);
                  
                  const tokens = [];
                  let currentToken = '';
                  let startIndex = prefixLen;
                  let inToken = false;
                  
                  for (let i = 0; i < restOfLine.length; i++) {
                      const char = restOfLine[i];
                      if (/\s/.test(char)) {
                          if (inToken) {
                              tokens.push({ text: currentToken, start: startIndex, end: prefixLen + i });
                              currentToken = '';
                              inToken = false;
                          }
                      } else {
                          if (!inToken) {
                              startIndex = prefixLen + i;
                              inToken = true;
                          }
                          currentToken += char;
                      }
                  }
                  if (inToken) {
                      tokens.push({ text: currentToken, start: startIndex, end: prefixLen + restOfLine.length });
                  }

                  const tagParts = [];
                  let lastTokenEnd = -1;
                  let firstTokenStart = -1;

                  if (tokens.length > 0 && tokens[0].text === 'expression') {
                      // skip
                  } else {
                      for (const token of tokens) {
                          if (['with', 'at', 'as', 'behind', 'zorder', 'on', ':', 'fade', 'in', 'out', 'dissolve', 'zoom', 'alpha', 'rotate', 'align', 'pos', 'anchor', 'xpos', 'ypos', 'xanchor', 'yanchor'].includes(token.text)) break;
                          if (token.text.endsWith(':')) {
                              const realText = token.text.slice(0, -1);
                              tagParts.push(realText);
                              if (firstTokenStart === -1) firstTokenStart = token.start;
                              lastTokenEnd = token.start + realText.length;
                              break; 
                          }
                          tagParts.push(token.text);
                          if (firstTokenStart === -1) firstTokenStart = token.start;
                          lastTokenEnd = token.end;
                      }
                  }

                  if (tagParts.length > 0) {
                      const tag = tagParts.join(' ');
                      const firstWord = tagParts[0];
                      const isDefined = 
                          analysisResultRef.current.definedImages.has(firstWord) || 
                          existingImageTags.has(tag) || 
                          existingImageTags.has(firstWord);

                      if (!isDefined) {
                          newDraftingDecorations.push({
                              range: new monacoInstance.Range(lineNumber, firstTokenStart + 1, lineNumber, lastTokenEnd + 1),
                              options: {
                                  inlineClassName: 'renpy-missing-asset-draft',
                                  hoverMessage: { value: `Asset missing. A placeholder will be used in Drafting Mode.`, isTrusted: true }
                              }
                          });
                      }
                  }
              }

              const audMatch = line.match(AUDIO_USAGE_REGEX);
              if (audMatch) {
                  const content = audMatch[1].trim();
                  const quotedMatch = content.match(/^["']([^"']+)["']/);
                  
                  if (quotedMatch) {
                      const path = quotedMatch[1];
                      let found = false;
                      if (existingAudioPaths.has(path)) found = true;
                      else {
                          for (const existing of existingAudioPaths) {
                              if (existing.endsWith(path)) { found = true; break; }
                          }
                      }

                      if (!found) {
                          const startCol = line.indexOf(path) + 1;
                          const endCol = startCol + path.length;
                          newDraftingDecorations.push({
                              range: new monacoInstance.Range(lineNumber, startCol, lineNumber, endCol),
                              options: {
                                  inlineClassName: 'renpy-missing-asset-draft',
                                  hoverMessage: { value: `Audio file missing. A placeholder will be used.`, isTrusted: true }
                              }
                          });
                      }
                  } 
                  else {
                      const firstToken = content.split(/\s+/)[0];
                      if (firstToken !== 'expression') {
                          if (/^[a-zA-Z_]\w*$/.test(firstToken)) {
                              let isDefined = false;
                              if (analysisResultRef.current.variables.has(firstToken)) isDefined = true;
                              if (existingAudioPaths.has(firstToken)) isDefined = true;

                              if (!isDefined) {
                                  const startCol = line.indexOf(firstToken) + 1;
                                  const endCol = startCol + firstToken.length;
                                  newDraftingDecorations.push({
                                      range: new monacoInstance.Range(lineNumber, startCol, lineNumber, endCol),
                                      options: {
                                          inlineClassName: 'renpy-missing-asset-draft',
                                          hoverMessage: { value: `Audio variable missing. A default placeholder will be generated.`, isTrusted: true }
                                      }
                                  });
                              }
                          }
                      }
                  }
              }
          }
      });
      
      decorationIds.current = editor.deltaDecorations(decorationIds.current, newDecorations);
      draftingDecorationIds.current = editor.deltaDecorations(draftingDecorationIds.current, newDraftingDecorations);
  
  }, [analysisResult, block.id, isMounted, block.content, draftingMode, existingImageTags, existingAudioPaths]); 

  const getCurrentContext = () => {
      if (!editorRef.current) return '';
      const model = editorRef.current.getModel();
      const position = editorRef.current.getPosition();
      if (model && position) {
          return model.getValueInRange({
              startLineNumber: 1,
              startColumn: 1,
              endLineNumber: position.lineNumber,
              endColumn: position.column
          });
      }
      return '';
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
        <style>{`
            .renpy-missing-asset-draft {
                text-decoration: underline;
                text-decoration-style: dashed;
                text-decoration-color: #f97316;
                cursor: help;
            }
        `}</style>
      <Breadcrumbs filePath={block.filePath} context={currentContext} />
      <Editor
        height="100%"
        defaultLanguage="renpy"
        path={block.filePath || block.id}
        defaultValue={block.content}
        theme={editorTheme === 'dark' ? 'renpy-dark' : 'renpy-light'}
        onMount={handleEditorDidMount}
        beforeMount={handleEditorWillMount}
        options={{
          minimap: { enabled: true },
          fontSize: editorFontSize,
          fontFamily: editorFontFamily,
          wordWrap: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 4,
          insertSpaces: true,
          hover: {
              enabled: true,
              delay: 300,
          }
        }}
      />
    </div>
  );
};

export default EditorView;
