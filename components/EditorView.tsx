/**
 * @file EditorView.tsx
 * @description Monaco-based code editor for Ren'Py files (761 lines).
 * Integrates VS Code editor with syntax highlighting, error markers, and AI content generation.
 * Handles editing, error display, definition navigation, and code completion for Ren'Py syntax.
 * Supports undo/redo, minimap, and integration with story canvas for navigation.
 */

import React, { useRef, useEffect, useState } from 'react';
import Editor, { OnMount, BeforeMount } from '@monaco-editor/react';
import type { Block, RenpyAnalysisResult, ToastMessage, UserSnippet } from '../types';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { detectContext, getRenpyCompletions } from '../lib/renpyCompletionProvider';
import type { RenpyCompletionData } from '../lib/renpyCompletionProvider';
import { validateRenpyCode } from '../lib/renpyValidator';
import { initTextMate, createTextMateTokensProvider } from '../lib/textmateGrammar';
import {
  getSemanticTokensLegend,
  computeSemanticTokens,
  SEMANTIC_DARK_RULES,
  SEMANTIC_LIGHT_RULES,
} from '../lib/renpySemanticTokens';
import DialoguePreview from './DialoguePreview';
import type { DialoguePreviewData, MenuChoice } from './DialoguePreview';

interface EditorViewProps {
  block: Block;
  blocks: Block[];
  analysisResult: RenpyAnalysisResult;
  initialScrollRequest?: { line: number; key: number };
  onSwitchFocusBlock: (blockId: string, line: number) => void;
  onSave: (blockId: string, newContent: string) => void;
  onTriggerSave?: (blockId: string) => void;
  onDirtyChange: (blockId: string, isDirty: boolean) => void;
  onContentChange?: (blockId: string, content: string) => void;
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
  userSnippets?: UserSnippet[];
}

const LABEL_REGEX = /^\s*label\s+([a-zA-Z0-9_]+):/;
const JUMP_REGEX = /\b(jump|call)\s+([a-zA-Z0-9_]+)/g;
const AUDIO_USAGE_REGEX = /^\s*(?:play|queue)\s+\w+\s+(.+)/;
// Ren'Py keywords that follow `jump`/`call` but are not label targets.
const JUMP_KEYWORD_TARGETS = new Set(['expression', 'screen']);

// Ren'Py statement keywords — a line starting with one of these is NOT dialogue.
const RENPY_STATEMENT_KEYWORDS = new Set([
  'show', 'hide', 'scene', 'play', 'queue', 'stop', 'pause', 'with', 'window',
  'define', 'default', 'init', 'label', 'jump', 'call', 'return', 'if', 'elif',
  'else', 'for', 'while', 'pass', 'menu', 'image', 'transform', 'style', 'screen',
  'python', 'translate', 'nvl', 'voice', 'renpy', 'config', 'gui', 'at', 'as',
  'behind', 'onlayer', 'zorder', 'expression', 'extend', 'camera',
]);

function getIndent(line: string): number {
  return line.match(/^(\s*)/)?.[1].length ?? 0;
}

function parseDialogueLine(
  line: string,
  characters: RenpyAnalysisResult['characters']
): DialoguePreviewData | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('$')) return null;

  // Character dialogue: tag "text"
  const charMatch = trimmed.match(/^([a-zA-Z_]\w*)\s+"((?:[^"\\]|\\.)*)"/);
  if (charMatch) {
    const tag = charMatch[1];
    if (RENPY_STATEMENT_KEYWORDS.has(tag)) return null;
    const text = charMatch[2];
    const char = characters.get(tag);
    return {
      kind: 'dialogue',
      charName: char?.name ?? tag,
      charColor: char?.color ?? null,
      text,
      whoPrefix: char?.who_prefix,
      whoSuffix: char?.who_suffix,
      whatPrefix: char?.what_prefix,
      whatSuffix: char?.what_suffix,
    };
  }

  // Narrator dialogue: "text"
  const narrMatch = trimmed.match(/^"((?:[^"\\]|\\.)*)"/);
  if (narrMatch) {
    return { kind: 'dialogue', charName: null, charColor: null, text: narrMatch[1] };
  }

  return null;
}

function parseMenuBlock(
  lines: string[],
  cursorLineIdx: number // 0-indexed
): DialoguePreviewData | null {
  // Scan upward from cursor to find the enclosing menu: line
  let menuLineIdx = -1;
  let menuIndent = -1;

  for (let i = cursorLineIdx; i >= 0; i--) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (/^\s*menu\s*:/.test(line)) {
      menuLineIdx = i;
      menuIndent = getIndent(line);
      break;
    }

    // Stop if we reach a block-level statement that closes any menu scope
    const indent = getIndent(line);
    if (indent <= (menuIndent === -1 ? 0 : menuIndent) && trimmed && !trimmed.startsWith('#')) {
      if (menuLineIdx === -1) break; // Haven't found menu yet, stop early
    }
  }

  if (menuLineIdx === -1) return null;

  // Detect choice indent — first non-empty line inside the menu block
  let choiceIndent = -1;
  for (let i = menuLineIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const indent = getIndent(line);
    if (indent <= menuIndent) return null; // Empty menu
    choiceIndent = indent;
    break;
  }

  if (choiceIndent === -1) return null;

  // Parse choices and prompt
  const choices: MenuChoice[] = [];
  let prompt: string | undefined;
  let menuEndIdx = lines.length;

  for (let i = menuLineIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = getIndent(line);
    if (indent <= menuIndent) {
      menuEndIdx = i;
      break;
    }

    if (indent === choiceIndent) {
      // Choice line: "text" [optional condition]:
      // Be permissive — capture anything between the closing quote and the colon.
      const choiceMatch = trimmed.match(/^"((?:[^"\\]|\\.)*)"(.*)?:/);
      if (choiceMatch) {
        const rawCond = choiceMatch[2]?.trim();
        let condition: string | undefined;
        if (rawCond) {
          const ifMatch = rawCond.match(/^if\s+(.+)$/);
          condition = ifMatch ? ifMatch[1].trim() : rawCond;
        }
        choices.push({ text: choiceMatch[1], condition });
      } else if (choices.length === 0 && !prompt) {
        // Prompt string: "text" with no colon
        const promptMatch = trimmed.match(/^"((?:[^"\\]|\\.)*)"$/);
        if (promptMatch) prompt = promptMatch[1];
      }
    } else if (indent > choiceIndent && choices.length > 0) {
      // Inside a choice body — capture first jump or call as destination
      const last = choices[choices.length - 1];
      if (!last.destination) {
        const jumpMatch = trimmed.match(/^jump\s+([a-zA-Z_]\w*)/);
        const callMatch = trimmed.match(/^call\s+([a-zA-Z_]\w*)/);
        if (jumpMatch) last.destination = jumpMatch[1];
        else if (callMatch) last.destination = callMatch[1];
      }
    }
  }

  // Confirm cursor falls within the parsed menu block
  if (cursorLineIdx < menuLineIdx || cursorLineIdx >= menuEndIdx) return null;
  if (choices.length === 0) return null;

  return { kind: 'menu', prompt, choices };
}

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
    onContentChange,
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
  const [dialoguePreview, setDialoguePreview] = useState<DialoguePreviewData | null>(null);
  const [isDialoguePreviewExpanded, setIsDialoguePreviewExpanded] = useState(true);
  const setDialoguePreviewRef = useRef(setDialoguePreview);

  // Track dirty state internally to prevent redundant updates
  const isDirtyRef = useRef(false);

  // Refs to keep track of latest props for closures
  const onDirtyChangeRef = useRef(onDirtyChange);
  const onTriggerSaveRef = useRef(onTriggerSave);
  const blockRef = useRef(block);
  const onSwitchFocusBlockRef = useRef(onSwitchFocusBlock);
  const analysisResultRef = useRef(analysisResult);
  // Emitter used to signal Monaco that semantic tokens should be refreshed.
  // Created lazily when monaco is available (inside handleEditorWillMount).
  const semanticTokensChangeEmitter = useRef<monaco.Emitter<void>>(null!);
  if (semanticTokensChangeEmitter.current === null) {
    semanticTokensChangeEmitter.current = new monaco.Emitter<void>();
  }
  const onEditorUnmountRef = useRef(onEditorUnmount);
  const onCursorPositionChangeRef = useRef(onCursorPositionChange);
  const onContentChangeRef = useRef(onContentChange);
  const contentChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userSnippetsRef = useRef(props.userSnippets);

  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
    onTriggerSaveRef.current = onTriggerSave;
    blockRef.current = block;
    onSwitchFocusBlockRef.current = onSwitchFocusBlock;
    analysisResultRef.current = analysisResult;
    // Notify Monaco that semantic tokens may have changed
    semanticTokensChangeEmitter.current.fire();
    onEditorUnmountRef.current = onEditorUnmount;
    onCursorPositionChangeRef.current = onCursorPositionChange;
    onContentChangeRef.current = onContentChange;
    userSnippetsRef.current = props.userSnippets;
  }, [onDirtyChange, onTriggerSave, block, onSwitchFocusBlock, analysisResult, onEditorUnmount, onCursorPositionChange, onContentChange, props.userSnippets]);

  // This effect syncs the Monaco model when block.content is updated externally
  // (e.g. the character editor rewrites a define statement, or a file is reloaded).
  // If the editor has no pending user edits, we push the new content into the model.
  // If the user has edits in progress, we leave Monaco alone and only clear the
  // dirty flag once the content comes back into sync (i.e. after a save).
  useEffect(() => {
    if (!editorRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;

    const editorValue = model.getValue();
    if (editorValue !== block.content && !isDirtyRef.current) {
        // External update with no pending user edits — sync Monaco.
        model.setValue(block.content);
    } else {
        // Either already in sync, or user has pending edits; just update dirty tracking.
        const isNowDirty = editorValue !== block.content;
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
        // Clear any pending debounced content sync
        if (contentChangeTimerRef.current) clearTimeout(contentChangeTimerRef.current);
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

      // TextMate tokenizer — loaded asynchronously (WASM init).
      // Register a lightweight Monarch fallback first so the editor isn't
      // un-highlighted while the WASM loads, then replace it with TextMate.
      monacoInstance.languages.setMonarchTokensProvider('renpy', {
        tokenizer: {
          root: [
            [/#.*$/, 'comment'],
            [/"/, 'string', '@string_double'],
            [/'/, 'string', '@string_single'],
            [/\b(label|jump|call|menu|scene|show|hide|with|define|default|python|init|if|elif|else|return|expression|pass|while|for|in|image|transform|screen)\b/, 'keyword'],
            [/\b[a-zA-Z_]\w*/, 'identifier'],
            [/\b\d+/, 'number'],
            [/[:=+\-*/!<>]+/, 'operator'],
          ],
          string_double: [[/[^\\"]+/, 'string'], [/\\./, 'string.escape'], [/"/, 'string', '@pop']],
          string_single: [[/[^\\']+/, 'string'], [/\\./, 'string.escape'], [/'/, 'string', '@pop']],
        },
      });

      // Kick off async TextMate init — when ready, replace the Monarch tokenizer
      initTextMate().then(() => {
        const provider = createTextMateTokensProvider();
        monacoInstance.languages.setTokensProvider('renpy', provider);
        // Re-tokenize any open models so TextMate colours take effect immediately
        for (const model of monacoInstance.editor.getModels()) {
          if (model.getLanguageId() === 'renpy') {
            // Force Monaco to re-tokenize by touching the language
            monacoInstance.editor.setModelLanguage(model, 'renpy');
          }
        }
      }).catch((err) => {
        console.error('TextMate init failed, keeping Monarch fallback:', err);
      });

      // ------------------------------------------------------------------
      // Themes — rules use TextMate scope names (dotted, most-specific).
      // Monaco does prefix matching so `keyword` matches any
      // `keyword.declaration.*`, `keyword.control.*`, etc.
      // ------------------------------------------------------------------
      monacoInstance.editor.defineTheme('renpy-dark', {
          base: 'vs-dark',
          inherit: true,
          rules: [
              // ---- Keywords ----
              { token: 'keyword.declaration', foreground: 'C678DD', fontStyle: 'bold' }, // define, default, label, screen, transform, image, init, python, style, translate
              { token: 'keyword.control', foreground: 'C678DD' },       // jump, call, return, menu, if, elif, else, while, for, pass, in, not, and, or
              { token: 'keyword.statement', foreground: 'C678DD' },     // show, hide, scene, with, play, stop, queue, voice, pause, window, nvl
              { token: 'keyword.operator', foreground: '56B6C2' },      // =, +=, etc.
              { token: 'keyword.other', foreground: 'C678DD' },         // expression, screen (after call), early, hide modifier, show/hide/auto
              { token: 'keyword', foreground: 'C678DD' },               // fallback

              // ---- Entity names ----
              { token: 'entity.name.function.label', foreground: '61AFEF', fontStyle: 'bold' },      // label names
              { token: 'entity.name.function.screen', foreground: '61AFEF' },     // screen names
              { token: 'entity.name.function.transform', foreground: '61AFEF' },  // transform names
              { token: 'entity.name.function.label.reference', foreground: '61AFEF', fontStyle: 'underline' }, // jump/call targets
              { token: 'entity.name.function.screen.reference', foreground: '61AFEF', fontStyle: 'underline' }, // call screen targets
              { token: 'entity.name.variable', foreground: 'E06C75' },  // defined variable names
              { token: 'entity.name.tag.character', foreground: 'E5C07B', fontStyle: 'bold' }, // character names in dialogue
              { token: 'entity.name.tag.image', foreground: '98C379' }, // image names after show/scene/hide
              { token: 'entity.name.tag', foreground: 'E5C07B' },      // other tags (language, style)

              // ---- Strings ----
              { token: 'string.quoted.double', foreground: '98C379' },
              { token: 'string.quoted.single', foreground: '98C379' },
              { token: 'string', foreground: '98C379' },
              { token: 'constant.character.escape', foreground: 'D19A66' },
              { token: 'meta.interpolation', foreground: 'E5C07B' },          // [variable] inside strings
              { token: 'source.python.embedded', foreground: 'E5C07B' },      // inside interpolation
              { token: 'constant.other.placeholder.tag', foreground: '56B6C2' }, // {b}, {i}, {color=...} etc.

              // ---- Literals ----
              { token: 'constant.numeric', foreground: 'D19A66' },
              { token: 'constant.language.boolean', foreground: 'D19A66' },
              { token: 'constant.language.none', foreground: 'D19A66' },

              // ---- Support (builtins) ----
              { token: 'support.class.builtin', foreground: 'E5C07B' },         // Character, Dissolve, renpy, config, etc.
              { token: 'support.function.screen', foreground: '56B6C2' },        // text, vbox, hbox, button, etc.
              { token: 'support.function.atl', foreground: '56B6C2' },           // ease, linear, xpos, alpha, etc.
              { token: 'support.constant.transition', foreground: 'D19A66' },    // dissolve, fade, etc. after with
              { token: 'support.constant.channel', foreground: 'D19A66' },       // music, sound, audio channels

              // ---- Python ----
              { token: 'meta.embedded.inline.python', foreground: 'ABB2BF' },
              { token: 'punctuation.definition.variable.python', foreground: 'E06C75', fontStyle: 'bold' }, // $ prefix
              { token: 'keyword.other.python', foreground: 'C678DD' },

              // ---- Comments ----
              { token: 'comment', foreground: '5C6370', fontStyle: 'italic' },

              // ---- Misc ----
              { token: 'variable.parameter', foreground: 'E06C75' },
              { token: 'variable.other', foreground: 'ABB2BF' },
              { token: 'punctuation.section.block.begin', foreground: 'ABB2BF' },
              { token: 'source.renpy', foreground: 'ABB2BF' },

              // ---- Semantic token overrides ----
              ...SEMANTIC_DARK_RULES,
          ],
          colors: { 'editor.background': '#282C34' }
      });

      monacoInstance.editor.defineTheme('renpy-light', {
          base: 'vs',
          inherit: true,
          rules: [
              // ---- Keywords ----
              { token: 'keyword.declaration', foreground: 'A626A4', fontStyle: 'bold' },
              { token: 'keyword.control', foreground: 'A626A4' },
              { token: 'keyword.statement', foreground: 'A626A4' },
              { token: 'keyword.operator', foreground: '0184BC' },
              { token: 'keyword.other', foreground: 'A626A4' },
              { token: 'keyword', foreground: 'A626A4' },

              // ---- Entity names ----
              { token: 'entity.name.function.label', foreground: '4078F2', fontStyle: 'bold' },
              { token: 'entity.name.function.screen', foreground: '4078F2' },
              { token: 'entity.name.function.transform', foreground: '4078F2' },
              { token: 'entity.name.function.label.reference', foreground: '4078F2', fontStyle: 'underline' },
              { token: 'entity.name.function.screen.reference', foreground: '4078F2', fontStyle: 'underline' },
              { token: 'entity.name.variable', foreground: 'E45649' },
              { token: 'entity.name.tag.character', foreground: 'C18401', fontStyle: 'bold' },
              { token: 'entity.name.tag.image', foreground: '50A14F' },
              { token: 'entity.name.tag', foreground: 'C18401' },

              // ---- Strings ----
              { token: 'string.quoted.double', foreground: '50A14F' },
              { token: 'string.quoted.single', foreground: '50A14F' },
              { token: 'string', foreground: '50A14F' },
              { token: 'constant.character.escape', foreground: '986801' },
              { token: 'meta.interpolation', foreground: 'C18401' },
              { token: 'source.python.embedded', foreground: 'C18401' },
              { token: 'constant.other.placeholder.tag', foreground: '0184BC' },

              // ---- Literals ----
              { token: 'constant.numeric', foreground: '986801' },
              { token: 'constant.language.boolean', foreground: '986801' },
              { token: 'constant.language.none', foreground: '986801' },

              // ---- Support (builtins) ----
              { token: 'support.class.builtin', foreground: 'C18401' },
              { token: 'support.function.screen', foreground: '0184BC' },
              { token: 'support.function.atl', foreground: '0184BC' },
              { token: 'support.constant.transition', foreground: '986801' },
              { token: 'support.constant.channel', foreground: '986801' },

              // ---- Python ----
              { token: 'meta.embedded.inline.python', foreground: '383A42' },
              { token: 'punctuation.definition.variable.python', foreground: 'E45649', fontStyle: 'bold' },
              { token: 'keyword.other.python', foreground: 'A626A4' },

              // ---- Comments ----
              { token: 'comment', foreground: 'A0A1A7', fontStyle: 'italic' },

              // ---- Misc ----
              { token: 'variable.parameter', foreground: 'E45649' },
              { token: 'variable.other', foreground: '383A42' },
              { token: 'punctuation.section.block.begin', foreground: '383A42' },
              { token: 'source.renpy', foreground: '383A42' },

              // ---- Semantic token overrides ----
              ...SEMANTIC_LIGHT_RULES,
          ],
          colors: { 'editor.background': '#FAFAFA' }
      });

      // Register semantic tokens provider — enriches highlighting with
      // live analysis data (known vs. unknown labels, characters, etc.)
      monacoInstance.languages.registerDocumentSemanticTokensProvider('renpy', {
        onDidChange: semanticTokensChangeEmitter.current.event,
        getLegend: getSemanticTokensLegend,
        provideDocumentSemanticTokens(model) {
          const analysis = analysisResultRef.current;
          // Skip until analysis has run at least once
          if (Object.keys(analysis.labels).length === 0 && analysis.characters.size === 0) {
            return { data: new Uint32Array(0) };
          }
          const data = computeSemanticTokens(model.getValue(), analysis);
          return { data };
        },
        releaseDocumentSemanticTokens() { /* nothing to dispose */ },
      });

      // Register context-aware completion provider
      monacoInstance.languages.registerCompletionItemProvider('renpy', {
        triggerCharacters: [' ', '$'],
        provideCompletionItems: (model, position) => {
          const lineContent = model.getLineContent(position.lineNumber);
          const wordInfo = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            startColumn: wordInfo.startColumn,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          };
          const context = detectContext(lineContent, position.column);
          const analysis = analysisResultRef.current;
          const data: RenpyCompletionData = {
            labels: analysis.labels,
            characters: analysis.characters,
            variables: analysis.variables,
            screens: analysis.screens,
            definedImages: analysis.definedImages,
            userSnippets: userSnippetsRef.current,
          };
          return { suggestions: getRenpyCompletions(context, data, range) };
        },
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

    // Syntax validation rules (show expression, play/queue channels, define/default, etc.)
    const syntaxDiags = validateRenpyCode(code);
    for (const d of syntaxDiags) {
      markers.push({
        startLineNumber: d.startLineNumber,
        startColumn: d.startColumn,
        endLineNumber: d.endLineNumber,
        endColumn: d.endColumn,
        message: d.message,
        severity: d.severity === 'error'
          ? monacoInstance.MarkerSeverity.Error
          : monacoInstance.MarkerSeverity.Warning,
      });
    }

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
    monacoRef.current = monacoInstance;

    // Ensure language is set correctly
    const model = editor.getModel();
    if (model) {
        monacoInstance.editor.setModelLanguage(model, 'renpy');
    }

    onEditorMount(block.id, editor);
    editor.focus();
    setIsMounted(true);
    updateContext();

    // Scroll to the requested line on initial mount (the useEffect approach fires
    // before editorRef is set, so new-tab scroll requests need handling here too)
    if (initialScrollRequest) {
      setTimeout(() => {
        editor.revealLineInCenter(initialScrollRequest.line, monacoInstance.editor.ScrollType.Smooth);
        editor.setPosition({ lineNumber: initialScrollRequest.line, column: 1 });
      }, 50);
    }

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

        const markers = performValidation(currentContent, monacoInstance);
        monacoInstance.editor.setModelMarkers(editor.getModel()!, 'renpy-syntax', markers);

        // Debounced sync of editor content to React state so that
        // the analysis engine (links, labels, routes) stays up-to-date
        // during active editing, not just on save.
        if (onContentChangeRef.current) {
            if (contentChangeTimerRef.current) clearTimeout(contentChangeTimerRef.current);
            contentChangeTimerRef.current = setTimeout(() => {
                onContentChangeRef.current?.(blockRef.current.id, editor.getValue());
            }, 800);
        }
    });
    
    editor.onDidChangeCursorPosition(() => {
        updateContext();
        const pos = editor.getPosition();
        if (pos) {
            onCursorPositionChangeRef.current?.({ line: pos.lineNumber, column: pos.column });
            const model = editor.getModel();
            if (model) {
                const lineText = model.getLineContent(pos.lineNumber);
                const dialogue = parseDialogueLine(lineText, analysisResultRef.current.characters);
                if (dialogue) {
                    setDialoguePreviewRef.current(dialogue);
                } else {
                    const allLines = model.getValue().split('\n');
                    setDialoguePreviewRef.current(parseMenuBlock(allLines, pos.lineNumber - 1));
                }
            }
        }
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

    const markers = performValidation(editor.getValue(), monacoInstance);
    monacoInstance.editor.setModelMarkers(editor.getModel()!, 'renpy-syntax', markers);
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

      monacoInstance.editor.setModelMarkers(model, 'renpy-jumps', markers);
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
      <div className="flex-1 min-h-0">
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
            },
            'semanticHighlighting.enabled': true,
          }}
        />
      </div>
      <DialoguePreview
        data={dialoguePreview}
        isExpanded={isDialoguePreviewExpanded}
        onToggleExpand={() => setIsDialoguePreviewExpanded(prev => !prev)}
      />
    </div>
  );
};

export default EditorView;
