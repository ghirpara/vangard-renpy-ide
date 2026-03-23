/**
 * @file renpyCompletionProvider.ts
 * @description Context-aware completion provider for Ren'Py language in Monaco editor.
 * Analyzes cursor position to suggest labels, characters, variables, screens,
 * images, keywords, and user snippets.
 */

// Monaco CompletionItemKind values (avoid importing monaco in this pure module)
export const CompletionItemKind = {
  Function: 1,
  Variable: 4,
  Class: 5,
  Module: 8,
  File: 16,
  Keyword: 17,
  Snippet: 27,
} as const;

export const InsertTextRule = {
  InsertAsSnippet: 4,
} as const;

export type CompletionContext =
  | 'jump'
  | 'call'
  | 'call-screen'
  | 'show'
  | 'hide'
  | 'scene'
  | 'character'
  | 'variable'
  | 'general';

export interface CompletionRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export interface CompletionItem {
  label: string;
  kind: number;
  detail?: string;
  documentation?: string;
  insertText: string;
  insertTextRules?: number;
  range: CompletionRange;
  sortText?: string;
}

export interface RenpyCompletionData {
  labels: { [label: string]: { blockId: string; line: number; type?: string } };
  characters: Map<string, { name: string; tag: string; color?: string }>;
  variables: Map<string, { name: string; type?: string; initialValue?: string }>;
  screens: Map<string, { name: string; parameters?: string | string[] }>;
  definedImages: Set<string>;
  userSnippets?: { id: string; title: string; prefix: string; description: string; code: string; monacoBody?: string }[];
}

/**
 * Detects the completion context based on the current line content and cursor position.
 * Strips leading whitespace and checks for Ren'Py keyword prefixes.
 */
export function detectContext(lineContent: string, column: number): CompletionContext {
  const textBefore = lineContent.substring(0, column - 1).trimStart();

  // Check for specific keyword prefixes (order matters: call screen before call)
  if (/^call\s+screen\s+/i.test(textBefore)) return 'call-screen';
  if (/^call\s+/i.test(textBefore)) return 'call';
  if (/^jump\s+/i.test(textBefore)) return 'jump';
  if (/^show\s+/i.test(textBefore)) return 'show';
  if (/^hide\s+/i.test(textBefore)) return 'hide';
  if (/^scene\s+/i.test(textBefore)) return 'scene';

  // Variable context: after $ or python block
  if (textBefore.startsWith('$') || textBefore.startsWith('python')) return 'variable';

  // Character speaking: line starts with a word followed by space+quote (e.g., `e "Hello"`)
  // Only suggest characters if we're at the very start of an indented line (typical dialogue position)
  if (/^\s*$/.test(lineContent.substring(0, column - 1)) && column <= 5) return 'general';

  // If the line is indented and the cursor is at the start of a word (likely a character tag or statement)
  if (/^\w*$/.test(textBefore) && textBefore.length > 0 && textBefore.length < 20) {
    // Could be a character tag or a keyword — return 'general' to include both
    return 'general';
  }

  return 'general';
}

const KEYWORD_SNIPPETS: { label: string; insertText: string; detail: string }[] = [
  { label: 'label', insertText: 'label ${1:name}:\n    $0', detail: 'Define a label' },
  { label: 'jump', insertText: 'jump ${1:label_name}', detail: 'Jump to a label' },
  { label: 'call', insertText: 'call ${1:label_name}', detail: 'Call a label' },
  { label: 'menu', insertText: 'menu:\n    "${1:What do you do?}":\n        "${2:Choice 1}":\n            $0', detail: 'Create a choice menu' },
  { label: 'define', insertText: 'define ${1:name} = ${2:value}', detail: 'Define a constant variable' },
  { label: 'default', insertText: 'default ${1:name} = ${2:value}', detail: 'Define a saveable variable' },
  { label: 'if', insertText: 'if ${1:condition}:\n    $0', detail: 'Conditional branch' },
  { label: 'elif', insertText: 'elif ${1:condition}:\n    $0', detail: 'Else-if branch' },
  { label: 'else', insertText: 'else:\n    $0', detail: 'Else branch' },
  { label: 'while', insertText: 'while ${1:condition}:\n    $0', detail: 'While loop' },
  { label: 'for', insertText: 'for ${1:item} in ${2:iterable}:\n    $0', detail: 'For loop' },
  { label: 'screen', insertText: 'screen ${1:name}():\n    $0', detail: 'Define a screen' },
  { label: 'show', insertText: 'show ${1:image}', detail: 'Show an image' },
  { label: 'scene', insertText: 'scene ${1:background}', detail: 'Set background scene' },
  { label: 'hide', insertText: 'hide ${1:image}', detail: 'Hide an image' },
  { label: 'with', insertText: 'with ${1:transition}', detail: 'Apply a transition' },
  { label: 'play', insertText: 'play ${1:channel} "${2:filename}"', detail: 'Play audio' },
  { label: 'stop', insertText: 'stop ${1:channel}', detail: 'Stop audio' },
  { label: 'queue', insertText: 'queue ${1:channel} "${2:filename}"', detail: 'Queue audio' },
  { label: 'pause', insertText: 'pause ${1:duration}', detail: 'Pause execution' },
  { label: 'return', insertText: 'return', detail: 'Return from call/end game' },
  { label: 'pass', insertText: 'pass', detail: 'Do nothing (placeholder)' },
  { label: 'python', insertText: 'python:\n    $0', detail: 'Python block' },
  { label: 'init', insertText: 'init ${1:priority} python:\n    $0', detail: 'Init python block' },
  { label: 'image', insertText: 'image ${1:name} = "${2:filename}"', detail: 'Define an image' },
  { label: 'transform', insertText: 'transform ${1:name}:\n    $0', detail: 'Define a transform' },
  { label: 'nvl', insertText: 'nvl clear', detail: 'Clear NVL-mode text' },
  { label: 'window', insertText: 'window ${1|show,hide,auto|}', detail: 'Window command' },
];

/**
 * Generates completion items for the given context and analysis data.
 */
export function getRenpyCompletions(
  context: CompletionContext,
  data: RenpyCompletionData,
  range: CompletionRange
): CompletionItem[] {
  const items: CompletionItem[] = [];

  switch (context) {
    case 'jump':
    case 'call':
      // Suggest labels
      for (const [label, info] of Object.entries(data.labels)) {
        items.push({
          label,
          kind: CompletionItemKind.Function,
          detail: `Label (${info.type || 'label'})`,
          insertText: label,
          range,
          sortText: `0_${label}`,
        });
      }
      break;

    case 'call-screen':
      // Suggest screens
      for (const [name, info] of data.screens) {
        const paramStr = Array.isArray(info.parameters) ? info.parameters.join(', ') : (info.parameters || '');
        const params = paramStr ? `(${paramStr})` : '';
        items.push({
          label: name,
          kind: CompletionItemKind.Module,
          detail: `Screen${params}`,
          insertText: name,
          range,
          sortText: `0_${name}`,
        });
      }
      break;

    case 'show':
    case 'hide':
    case 'scene':
      // Suggest defined images
      for (const imageName of data.definedImages) {
        items.push({
          label: imageName,
          kind: CompletionItemKind.File,
          detail: 'Image',
          insertText: imageName,
          range,
          sortText: `0_${imageName}`,
        });
      }
      break;

    case 'variable':
      // Suggest variables
      for (const [name, info] of data.variables) {
        items.push({
          label: name,
          kind: CompletionItemKind.Variable,
          detail: `${info.type || 'variable'}: ${info.initialValue || ''}`,
          insertText: name,
          range,
          sortText: `0_${name}`,
        });
      }
      break;

    case 'character':
    case 'general':
      // Keyword snippets
      for (const kw of KEYWORD_SNIPPETS) {
        items.push({
          label: kw.label,
          kind: CompletionItemKind.Keyword,
          detail: kw.detail,
          insertText: kw.insertText,
          insertTextRules: InsertTextRule.InsertAsSnippet,
          range,
          sortText: `2_${kw.label}`,
        });
      }

      // Character tags
      for (const [tag, char] of data.characters) {
        items.push({
          label: tag,
          kind: CompletionItemKind.Class,
          detail: `Character: ${char.name}`,
          insertText: tag,
          range,
          sortText: `1_${tag}`,
        });
      }

      // Labels
      for (const [label, info] of Object.entries(data.labels)) {
        items.push({
          label,
          kind: CompletionItemKind.Function,
          detail: `Label (${info.type || 'label'})`,
          insertText: label,
          range,
          sortText: `3_${label}`,
        });
      }

      // Variables
      for (const [name, info] of data.variables) {
        items.push({
          label: name,
          kind: CompletionItemKind.Variable,
          detail: `${info.type || 'variable'}: ${info.initialValue || ''}`,
          insertText: name,
          range,
          sortText: `3_${name}`,
        });
      }

      // Screens
      for (const [name] of data.screens) {
        items.push({
          label: name,
          kind: CompletionItemKind.Module,
          detail: 'Screen',
          insertText: name,
          range,
          sortText: `3_${name}`,
        });
      }

      // User snippets
      if (data.userSnippets) {
        for (const snippet of data.userSnippets) {
          items.push({
            label: snippet.title,
            kind: CompletionItemKind.Snippet,
            detail: 'User Snippet',
            documentation: snippet.description,
            insertText: snippet.monacoBody || snippet.code,
            insertTextRules: snippet.monacoBody ? InsertTextRule.InsertAsSnippet : undefined,
            range,
            sortText: `1_${snippet.prefix}`,
          });
        }
      }
      break;
  }

  return items;
}
