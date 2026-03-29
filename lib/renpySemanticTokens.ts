/**
 * @file renpySemanticTokens.ts
 * @description Semantic tokens provider for Ren'Py in Monaco.
 * Uses live analysis data to provide context-aware token overlays:
 * - Known vs. undefined jump/call label targets
 * - Known vs. unknown character names in dialogue
 * - Known vs. undefined image names after show/scene/hide
 * - Known vs. undefined screen names
 * - Known variable names in $ expressions
 */

import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import type { RenpyAnalysisResult } from '../types';

// ---------------------------------------------------------------------------
// Legend — defines the token type & modifier indices
// ---------------------------------------------------------------------------

/** Semantic token type names. Order matters — index is used in the data array. */
export const SEMANTIC_TOKEN_TYPES = [
  'renpyLabel',            // 0 — known label reference
  'renpyLabelUndefined',   // 1 — undefined label reference
  'renpyCharacter',        // 2 — known character in dialogue
  'renpyCharacterUnknown', // 3 — unknown character in dialogue
  'renpyImage',            // 4 — known image name
  'renpyImageUnknown',     // 5 — unknown image name
  'renpyScreen',           // 6 — known screen name
  'renpyScreenUnknown',    // 7 — unknown screen name
  'renpyVariable',         // 8 — known variable
] as const;

export const SEMANTIC_TOKEN_MODIFIERS: string[] = [];

export function getSemanticTokensLegend(): monaco.languages.SemanticTokensLegend {
  return {
    tokenTypes: [...SEMANTIC_TOKEN_TYPES],
    tokenModifiers: SEMANTIC_TOKEN_MODIFIERS,
  };
}

// ---------------------------------------------------------------------------
// Token type index constants
// ---------------------------------------------------------------------------

const T_LABEL           = 0;
const T_LABEL_UNDEF     = 1;
const T_CHARACTER       = 2;
const T_CHARACTER_UNK   = 3;
const T_IMAGE           = 4;
const T_IMAGE_UNK       = 5;
const T_SCREEN          = 6;
const T_SCREEN_UNK      = 7;
const T_VARIABLE        = 8;

// ---------------------------------------------------------------------------
// Regex patterns for line scanning
// ---------------------------------------------------------------------------

/** jump <label> or call <label> (but not `call screen`) */
const RE_JUMP_CALL = /\b(jump|call)\s+(?!screen\b|expression\b)([a-zA-Z_][a-zA-Z0-9_.]*)/g;

/** call screen <name> / show screen <name> / hide screen <name> */
const RE_SCREEN_REF = /\b(?:call|show|hide)\s+screen\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;

/** show <image> / scene <image> / hide <image> (but not `hide screen`) */
const RE_IMAGE_STMT = /\b(show|scene|hide)\s+(?!screen\b)([a-zA-Z_][a-zA-Z0-9_ ]*?)(?=\s+(?:at|with|as|behind|onlayer|zorder)|$)/g;

/** Character dialogue: <tag> "text" (indented, first token is an identifier) */
const RE_CHAR_DIALOGUE = /^(\s+)([a-zA-Z_]\w*)\s+"/;

/** Inline Python: $ <expression> — capture variable-like tokens after $ */
const RE_INLINE_PYTHON = /^\s*\$\s+(.+)$/;

/** Identifiers within a Python expression */
const RE_IDENTIFIER = /\b([a-zA-Z_]\w*)\b/g;

/** Ren'Py keywords that should not be treated as character names in dialogue. */
const STATEMENT_KEYWORDS = new Set([
  'show', 'hide', 'scene', 'play', 'queue', 'stop', 'pause', 'with', 'window',
  'define', 'default', 'init', 'label', 'jump', 'call', 'return', 'if', 'elif',
  'else', 'for', 'while', 'pass', 'menu', 'image', 'transform', 'style', 'screen',
  'python', 'translate', 'nvl', 'voice', 'renpy', 'config', 'gui', 'at', 'as',
  'behind', 'onlayer', 'zorder', 'expression', 'extend', 'camera',
]);

/** Python builtins & keywords we should not flag as "unknown variables" */
const PYTHON_NOISE = new Set([
  'True', 'False', 'None', 'and', 'or', 'not', 'in', 'is', 'if', 'else',
  'for', 'while', 'return', 'import', 'from', 'class', 'def', 'lambda',
  'try', 'except', 'finally', 'raise', 'with', 'as', 'del', 'print', 'len',
  'range', 'int', 'str', 'float', 'list', 'dict', 'tuple', 'set', 'type',
  'isinstance', 'super', 'self', 'renpy', 'config', 'gui', 'persistent',
  'store', 'im', 'ui',
]);

// ---------------------------------------------------------------------------
// Token collector
// ---------------------------------------------------------------------------

interface RawToken {
  line: number;   // 0-based
  char: number;   // 0-based
  length: number;
  type: number;   // index into SEMANTIC_TOKEN_TYPES
}

/**
 * Scan a document and return semantic tokens based on analysis data.
 *
 * @param text    Full document text.
 * @param analysis  Current Ren'Py analysis result (labels, characters, images, etc.)
 * @returns Uint32Array in the LSP semantic token delta-encoded format.
 */
export function computeSemanticTokens(
  text: string,
  analysis: RenpyAnalysisResult,
): Uint32Array {
  const tokens: RawToken[] = [];
  const lines = text.split('\n');

  const knownLabels = analysis.labels;          // { [label]: LabelLocation }
  const knownChars  = analysis.characters;      // Map<string, Character>
  const knownImages = analysis.definedImages;   // Set<string>
  const knownScreens = analysis.screens;        // Map<string, RenpyScreen>
  const knownVars   = analysis.variables;       // Map<string, Variable>

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    // --- jump / call label targets ---
    RE_JUMP_CALL.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RE_JUMP_CALL.exec(line)) !== null) {
      const label = m[2];
      const col = m.index + m[0].indexOf(label);
      const isKnown = label in knownLabels;
      tokens.push({
        line: lineIdx,
        char: col,
        length: label.length,
        type: isKnown ? T_LABEL : T_LABEL_UNDEF,
      });
    }

    // --- screen references ---
    RE_SCREEN_REF.lastIndex = 0;
    while ((m = RE_SCREEN_REF.exec(line)) !== null) {
      const name = m[1];
      const col = m.index + m[0].indexOf(name);
      const isKnown = knownScreens.has(name);
      tokens.push({
        line: lineIdx,
        char: col,
        length: name.length,
        type: isKnown ? T_SCREEN : T_SCREEN_UNK,
      });
    }

    // --- image references (show/scene/hide) ---
    RE_IMAGE_STMT.lastIndex = 0;
    while ((m = RE_IMAGE_STMT.exec(line)) !== null) {
      const imageName = m[2].trim();
      if (!imageName) continue;
      const col = m.index + m[0].indexOf(m[2]);
      // Ren'Py image names can be multi-word; check full name and first-word tag
      const firstTag = imageName.split(/\s+/)[0];
      const isKnown = knownImages.has(imageName) || knownImages.has(firstTag);
      tokens.push({
        line: lineIdx,
        char: col,
        length: imageName.length,
        type: isKnown ? T_IMAGE : T_IMAGE_UNK,
      });
    }

    // --- character dialogue ---
    const charMatch = RE_CHAR_DIALOGUE.exec(line);
    if (charMatch) {
      const tag = charMatch[2];
      if (!STATEMENT_KEYWORDS.has(tag)) {
        const col = charMatch[1].length; // skip leading whitespace
        const isKnown = knownChars.has(tag);
        tokens.push({
          line: lineIdx,
          char: col,
          length: tag.length,
          type: isKnown ? T_CHARACTER : T_CHARACTER_UNK,
        });
      }
    }

    // --- inline Python variable references ---
    const pyMatch = RE_INLINE_PYTHON.exec(line);
    if (pyMatch) {
      const expr = pyMatch[1];
      const exprStart = line.indexOf(expr, line.indexOf('$') + 1);
      RE_IDENTIFIER.lastIndex = 0;
      let idM: RegExpExecArray | null;
      while ((idM = RE_IDENTIFIER.exec(expr)) !== null) {
        const ident = idM[1];
        if (PYTHON_NOISE.has(ident)) continue;
        if (knownVars.has(ident) || knownChars.has(ident)) {
          tokens.push({
            line: lineIdx,
            char: exprStart + idM.index,
            length: ident.length,
            type: T_VARIABLE,
          });
        }
      }
    }
  }

  // Sort tokens by (line, char) for delta encoding
  tokens.sort((a, b) => a.line - b.line || a.char - b.char);

  // Delta-encode into a Uint32Array (5 values per token)
  const data = new Uint32Array(tokens.length * 5);
  let prevLine = 0;
  let prevChar = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const deltaLine = t.line - prevLine;
    const deltaChar = deltaLine === 0 ? t.char - prevChar : t.char;
    const offset = i * 5;
    data[offset]     = deltaLine;
    data[offset + 1] = deltaChar;
    data[offset + 2] = t.length;
    data[offset + 3] = t.type;
    data[offset + 4] = 0; // no modifiers
    prevLine = t.line;
    prevChar = t.char;
  }

  return data;
}

// ---------------------------------------------------------------------------
// Theme rules for semantic tokens
// ---------------------------------------------------------------------------

/** Dark theme rules for semantic token types. */
export const SEMANTIC_DARK_RULES: monaco.editor.ITokenThemeRule[] = [
  // Known entities — distinct, confident colours
  { token: 'renpyLabel',            foreground: '61AFEF', fontStyle: 'underline' },     // blue underline
  { token: 'renpyCharacter',        foreground: 'E5C07B', fontStyle: 'bold' },          // gold bold
  { token: 'renpyImage',            foreground: '98C379' },                             // green
  { token: 'renpyScreen',           foreground: '61AFEF' },                             // blue
  { token: 'renpyVariable',         foreground: 'E06C75' },                             // red (variable)

  // Undefined / unknown entities — dimmed or warning colours
  { token: 'renpyLabelUndefined',   foreground: 'E06C75', fontStyle: 'underline' },     // red underline
  { token: 'renpyCharacterUnknown', foreground: 'ABB2BF', fontStyle: 'italic' },        // grey italic
  { token: 'renpyImageUnknown',     foreground: 'ABB2BF', fontStyle: 'italic' },        // grey italic
  { token: 'renpyScreenUnknown',    foreground: 'ABB2BF', fontStyle: 'italic' },        // grey italic
];

/** Light theme rules for semantic token types. */
export const SEMANTIC_LIGHT_RULES: monaco.editor.ITokenThemeRule[] = [
  { token: 'renpyLabel',            foreground: '4078F2', fontStyle: 'underline' },
  { token: 'renpyCharacter',        foreground: 'C18401', fontStyle: 'bold' },
  { token: 'renpyImage',            foreground: '50A14F' },
  { token: 'renpyScreen',           foreground: '4078F2' },
  { token: 'renpyVariable',         foreground: 'E45649' },

  { token: 'renpyLabelUndefined',   foreground: 'E45649', fontStyle: 'underline' },
  { token: 'renpyCharacterUnknown', foreground: 'A0A1A7', fontStyle: 'italic' },
  { token: 'renpyImageUnknown',     foreground: 'A0A1A7', fontStyle: 'italic' },
  { token: 'renpyScreenUnknown',    foreground: 'A0A1A7', fontStyle: 'italic' },
];
