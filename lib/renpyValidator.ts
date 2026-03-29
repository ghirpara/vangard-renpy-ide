/**
 * @file renpyValidator.ts
 * @description Static syntax validator for Ren'Py script files.
 * Produces diagnostics that are fed to Monaco as editor markers (gutter icons +
 * underlines with hover messages). Runs on every keystroke so must stay O(n).
 *
 * Rules implemented:
 *  1.  `show expression` without `as` clause
 *  2.  `play` / `queue` missing channel name (file path given directly)
 *  3.  `play` / `queue` / `stop` referencing an unknown channel (warning)
 *  4.  `play` / `queue` with both `loop` and `noloop`
 *  5.  `define` / `default` without `=`
 *  6.  `label` / `screen` / `menu` / `transform` / `init` missing colon
 *  7.  `image` name containing a reserved word (at, as, behind, onlayer, with, zorder)
 *  8.  Menu choice condition written without `if` keyword
 *  9.  Menu choice missing trailing colon
 *  10. Bare `jump` (no target)
 *  11. Bare `call` (no target)
 *  12. Bare `show` (no image or screen name)
 *  13. Bare `hide` (no image or screen name)
 *  14. Bare `with` (no transition)
 *  15. Bare `voice` (no file path or keyword)
 *  16. `call screen` / `show screen` / `hide screen` without a screen name
 *  17. `window` with missing or unknown keyword (valid: show, hide, auto)
 *  18. `nvl` with missing or unknown keyword (valid: clear, show, hide)
 *  19. Empty inline Python expression (`$` with nothing after it)
 *  20. `$ var == expr` — comparison used as a statement (likely missing `=`)
 *  21. `pause` given a string literal instead of a numeric duration
 */

export interface RenpyDiagnostic {
  startLineNumber: number; // 1-indexed
  startColumn: number;     // 1-indexed
  endLineNumber: number;
  endColumn: number;
  message: string;
  severity: 'error' | 'warning';
}

// ── Constants ──────────────────────────────────────────────────────────────

const BUILTIN_CHANNELS = new Set(['music', 'sound', 'voice', 'audio']);

const IMAGE_NAME_RESERVED = new Set([
  'at', 'as', 'behind', 'onlayer', 'with', 'zorder',
]);

// Python keywords that make `$ kw == expr` a valid (non-assignment) expression
const PYTHON_KEYWORDS = new Set([
  'assert', 'if', 'while', 'for', 'not', 'and', 'or', 'in', 'is',
  'True', 'False', 'None', 'return', 'print', 'del', 'pass', 'break',
  'continue', 'raise', 'try', 'except', 'finally', 'with', 'import',
  'from', 'class', 'def', 'lambda', 'yield', 'global', 'nonlocal',
]);

// Patterns for python blocks (skip all validation inside these)
const PYTHON_BLOCK_RE =
  /^\s*(?:init\s+(?:-?\d+\s+)?)?python(?:\s+(?:hide|in\s+\w+))?:/;

// Screen block start — `screen name(...):`
// Inside screen blocks, `label` and `transform` are displayables, not story statements,
// so colon-check and menu-choice rules must be suppressed.
const SCREEN_BLOCK_RE = /^\s*screen\s+\w+(?:\s*\([^)]*\))?\s*:/;

// ── Helpers ────────────────────────────────────────────────────────────────

function indentOf(line: string): number {
  return line.match(/^(\s*)/)?.[1].length ?? 0;
}

/** Return the 1-based column range of the first occurrence of `word` in `line`. */
function wordRange(line: string, word: string): [number, number] {
  const col = line.indexOf(word);
  if (col === -1) return [1, line.length + 1];
  return [col + 1, col + 1 + word.length];
}

/** Strip string literals from a line (replace with spaces) so we don't match
 *  keywords that appear inside quoted text. */
function stripStrings(line: string): string {
  return line
    .replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, m => ' '.repeat(m.length))
    .replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, m => ' '.repeat(m.length));
}

function makeDiag(
  lineNumber: number,
  startCol: number,
  endCol: number,
  message: string,
  severity: 'error' | 'warning',
): RenpyDiagnostic {
  return { startLineNumber: lineNumber, startColumn: startCol, endLineNumber: lineNumber, endColumn: endCol, message, severity };
}

// ── Individual rules ───────────────────────────────────────────────────────

function checkShowExpression(line: string, lineNum: number): RenpyDiagnostic | null {
  if (!/^\s*show\s+expression\b/.test(line)) return null;
  const sanitized = stripStrings(line);
  if (/\bas\b/.test(sanitized)) return null;
  const [s, e] = wordRange(line, 'expression');
  return makeDiag(lineNum, s, e,
    "`show expression` requires an `as <tag>` clause so Ren'Py can track the image layer.",
    'error');
}

function checkPlayQueue(line: string, lineNum: number): RenpyDiagnostic[] {
  const diags: RenpyDiagnostic[] = [];
  const match = line.match(/^(\s*)(play|queue)\s+(.*)/);
  if (!match) return diags;

  const keyword = match[2];
  const rest = match[3].trim();

  // Missing channel: first token is a quoted string or starts with `<`
  if (rest.startsWith('"') || rest.startsWith("'") || rest.startsWith('<')) {
    const kwCol = line.indexOf(keyword) + 1;
    diags.push(makeDiag(lineNum, kwCol, kwCol + keyword.length,
      `\`${keyword}\` is missing a channel name. Usage: \`${keyword} music "file.ogg"\`. Built-in channels: music, sound, voice, audio.`,
      'error'));
    return diags;
  }

  // Unknown channel name
  const channelMatch = rest.match(/^([a-zA-Z_]\w*)/);
  if (channelMatch) {
    const channel = channelMatch[1];
    if (!BUILTIN_CHANNELS.has(channel)) {
      const [s, e] = wordRange(line, channel);
      diags.push(makeDiag(lineNum, s, e,
        `Unknown audio channel \`${channel}\`. Built-in channels are: music, sound, voice, audio. Custom channels are valid if registered via \`renpy.music.register_channel()\`.`,
        'warning'));
    }
  }

  // loop + noloop mutually exclusive
  const sanitized = stripStrings(line);
  if (/\bloop\b/.test(sanitized) && /\bnoloop\b/.test(sanitized)) {
    diags.push(makeDiag(lineNum, 1, line.length + 1,
      '`loop` and `noloop` are mutually exclusive — remove one.',
      'error'));
  }

  return diags;
}

function checkStop(line: string, lineNum: number): RenpyDiagnostic | null {
  // `stop` with no channel — line is just `stop` optionally followed by `fadeout`
  const match = line.match(/^(\s*)(stop)\s*(.*)/);
  if (!match) return null;
  const rest = match[3].trim();
  // If rest is empty or starts with a non-identifier (comment, linebreak), channel is missing
  if (rest === '' || rest.startsWith('#') || rest.startsWith('fadeout')) {
    const kwCol = line.indexOf('stop') + 1;
    return makeDiag(lineNum, kwCol, kwCol + 4,
      '`stop` requires a channel name. Usage: `stop music` or `stop music fadeout 1.0`.',
      'error');
  }
  return null;
}

function checkDefineDefault(line: string, lineNum: number): RenpyDiagnostic | null {
  const match = line.match(/^\s*(define|default)\s+([\w.]+)\s*$/);
  if (!match) return null;
  const keyword = match[1];
  const name = match[2];
  const [s, e] = wordRange(line, name);
  return makeDiag(lineNum, s, e,
    `\`${keyword} ${name}\` is missing an assignment. Usage: \`${keyword} ${name} = <value>\`.`,
    'error');
}

function checkMissingColon(line: string, lineNum: number): RenpyDiagnostic | null {
  // label name [args] — no colon at end
  const labelMatch = line.match(/^\s*label\s+(\w+)(?:\s*\([^)]*\))?\s*$/);
  if (labelMatch) {
    const [s, e] = wordRange(line, labelMatch[1]);
    return makeDiag(lineNum, s, e,
      `Label \`${labelMatch[1]}\` is missing its colon. Did you mean \`label ${labelMatch[1]}:\`?`,
      'error');
  }

  // screen name [args] — no colon
  const screenMatch = line.match(/^\s*screen\s+(\w+)(?:\s*\([^)]*\))?\s*$/);
  if (screenMatch) {
    const [s, e] = wordRange(line, screenMatch[1]);
    return makeDiag(lineNum, s, e,
      `Screen \`${screenMatch[1]}\` is missing its colon. Did you mean \`screen ${screenMatch[1]}:\`?`,
      'error');
  }

  // menu — just the bare keyword with nothing after
  if (/^\s*menu\s*$/.test(line)) {
    const [s, e] = wordRange(line, 'menu');
    return makeDiag(lineNum, s, e,
      '`menu` is missing its colon. Did you mean `menu:`?',
      'error');
  }

  // transform name [args] — no colon
  const transformMatch = line.match(/^\s*transform\s+(\w+)(?:\s*\([^)]*\))?\s*$/);
  if (transformMatch) {
    const [s, e] = wordRange(line, transformMatch[1]);
    return makeDiag(lineNum, s, e,
      `Transform \`${transformMatch[1]}\` is missing its colon. Did you mean \`transform ${transformMatch[1]}:\`?`,
      'error');
  }

  // init [offset] [python [...]] — no colon at end
  // Matches: init, init 5, init python, init 5 python, init python hide, etc.
  // Excludes: `init offset = N` which is a valid assignment, not a block opener.
  if (/^\s*init\b/.test(line) && !line.trimEnd().endsWith(':') && !/^\s*init\s+offset\b/.test(line)) {
    const [s, e] = wordRange(line, 'init');
    return makeDiag(lineNum, s, e,
      '`init` block is missing its colon.',
      'error');
  }

  return null;
}

function checkImageName(line: string, lineNum: number): RenpyDiagnostic | null {
  // `image name = ...` or `image name:`
  const match = line.match(/^\s*image\s+(.+?)(?:\s*=|\s*:)/);
  if (!match) return null;
  const namePart = match[1].trim();
  const parts = namePart.split(/\s+/);
  for (const part of parts) {
    if (IMAGE_NAME_RESERVED.has(part)) {
      const [s, e] = wordRange(line, part);
      return makeDiag(lineNum, s, e,
        `\`${part}\` is a reserved Ren'Py keyword and cannot be used as a component of an image name.`,
        'error');
    }
  }
  return null;
}

function checkMenuChoiceCondition(line: string, lineNum: number): RenpyDiagnostic | null {
  // Choice lines: indented quoted string with something before the colon
  // Valid:   "text":               — no condition
  //          "text" if expr:       — standard condition
  //          "text" (args):        — menu arguments (valid, but warn if looks like bool expr)
  // Invalid: "text" expr:          — missing `if`
  //          "text" (bool_expr):   — likely missing `if` (warn)
  //          "text" (bool_expr)    — missing colon entirely (error)

  // Must be indented (choice lines are never at column 0)
  if (!/^\s+/.test(line)) return null;

  const trimmed = line.trim();
  // Must start with a quoted string
  if (!trimmed.startsWith('"')) return null;
  // Triple-quoted string delimiters (`"""`) are multi-line dialogue, not menu choices.
  // The closing `"""` line would otherwise be parsed as an empty string "" + dangling ".
  if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) return null;
  const baseMatch = trimmed.match(/^"((?:[^"\\]|\\.)*)"(.*)/);
  if (!baseMatch) return null;

  const afterQuote = baseMatch[2].trim();

  // Python dict key-value syntax: `"key" : value` — afterQuote starts with `:`.
  // This is not a menu choice; skip to avoid false positives in multi-line define dicts.
  if (afterQuote.startsWith(':')) return null;

  // If the line doesn't end with ':', check whether it has content after the quote.
  // "text" with no content after is narration — fine. "text" (something) with no colon is an error.
  if (!trimmed.endsWith(':')) {
    if (afterQuote) {
      const [s, e] = wordRange(line, afterQuote);
      return makeDiag(lineNum, s, e,
        `Menu choice is missing its trailing colon. Did you mean \`"${baseMatch[1]}" ${afterQuote}:\`?`,
        'error');
    }
    return null; // bare narration line — no colon required
  }

  // Line ends with ':' — strip it and check for missing `if` keyword in condition
  const colonMatch = trimmed.match(/^"((?:[^"\\]|\\.)*)"(.*):$/);
  if (!colonMatch) return null;

  const condition = colonMatch[2].trim();
  if (!condition) return null;        // bare "text": is fine
  if (condition.startsWith('if ')) return null;  // "text" if expr: is fine

  // "text" (something): — check if the parenthesized content looks like a boolean expression
  const parenMatch = condition.match(/^\((.+)\)$/);
  if (parenMatch) {
    const inner = parenMatch[1];
    // If it contains comparison/logical operators, it's likely a missing `if`.
    // Only flag == != < > <= >= (not bare = which is valid keyword arg syntax).
    if (/==|!=|<=|>=|(?<!=)<(?!=)|(?<!>)>(?!=)|(?:^|\s)(?:and|or|not)(?:\s|$)|\$/.test(inner)) {
      const [s, e] = wordRange(line, condition);
      return makeDiag(lineNum, s, e,
        `Menu choice condition is missing the \`if\` keyword. Did you mean \`"${colonMatch[1]}" if ${inner}:\`?`,
        'warning');
    }
    // Otherwise it may be valid menu arguments — leave it
    return null;
  }

  // Bare condition without `if` or parens (e.g. "text" $flag:)
  const [s, e] = wordRange(line, condition.replace(/:$/, ''));
  return makeDiag(lineNum, s, e,
    `Menu choice condition is missing the \`if\` keyword. Did you mean \`"${colonMatch[1]}" if ${condition}:\`?`,
    'warning');
}

/** Bare statements that require at least one argument. */
function checkBareStatements(line: string, lineNum: number): RenpyDiagnostic | null {
  // jump with no target
  if (/^\s*jump\s*$/.test(line)) {
    const [s, e] = wordRange(line, 'jump');
    return makeDiag(lineNum, s, e,
      '`jump` requires a label name. Usage: `jump label_name`.',
      'error');
  }

  // call with no target (bare 'call' — 'call screen' handled by checkScreenCommands)
  if (/^\s*call\s*$/.test(line)) {
    const [s, e] = wordRange(line, 'call');
    return makeDiag(lineNum, s, e,
      '`call` requires a label or screen name. Usage: `call label_name` or `call screen screen_name`.',
      'error');
  }

  // show with nothing (bare 'show' — 'show expression' and 'show screen' handled elsewhere)
  if (/^\s*show\s*$/.test(line)) {
    const [s, e] = wordRange(line, 'show');
    return makeDiag(lineNum, s, e,
      '`show` requires an image or screen name. Usage: `show image_name` or `show screen screen_name`.',
      'error');
  }

  // hide with nothing (bare 'hide' — 'hide screen' handled by checkScreenCommands)
  if (/^\s*hide\s*$/.test(line)) {
    const [s, e] = wordRange(line, 'hide');
    return makeDiag(lineNum, s, e,
      '`hide` requires an image or screen name. Usage: `hide image_name` or `hide screen screen_name`.',
      'error');
  }

  // with with no transition (standalone `with` statement only)
  if (/^\s*with\s*$/.test(line)) {
    const [s, e] = wordRange(line, 'with');
    return makeDiag(lineNum, s, e,
      '`with` requires a transition. Usage: `with dissolve`. Use `with None` for an explicit no-transition.',
      'error');
  }

  // voice with no file or keyword
  if (/^\s*voice\s*$/.test(line)) {
    const [s, e] = wordRange(line, 'voice');
    return makeDiag(lineNum, s, e,
      '`voice` requires a file path string or keyword. Usage: `voice "file.ogg"`. Valid keywords: sustain, silence, replay, stop.',
      'error');
  }

  return null;
}

/** `call screen`, `show screen`, `hide screen` with no screen name following. */
function checkScreenCommands(line: string, lineNum: number): RenpyDiagnostic | null {
  if (/^\s*call\s+screen\s*$/.test(line)) {
    const [s, e] = wordRange(line, 'screen');
    return makeDiag(lineNum, s, e,
      '`call screen` requires a screen name. Usage: `call screen screen_name`.',
      'error');
  }
  if (/^\s*show\s+screen\s*$/.test(line)) {
    const [s, e] = wordRange(line, 'screen');
    return makeDiag(lineNum, s, e,
      '`show screen` requires a screen name. Usage: `show screen screen_name`.',
      'error');
  }
  if (/^\s*hide\s+screen\s*$/.test(line)) {
    const [s, e] = wordRange(line, 'screen');
    return makeDiag(lineNum, s, e,
      '`hide screen` requires a screen name. Usage: `hide screen screen_name`.',
      'error');
  }
  return null;
}

/** `window` requires show, hide, or auto. */
function checkWindow(line: string, lineNum: number): RenpyDiagnostic | null {
  // Only match `window` as a standalone statement (not `window:` which is a screen displayable)
  const match = line.match(/^\s*window(?:\s+(\S+))?\s*$/);
  if (!match) return null;

  const keyword = match[1];
  if (!keyword) {
    const [s, e] = wordRange(line, 'window');
    return makeDiag(lineNum, s, e,
      '`window` requires show, hide, or auto. Usage: `window show`, `window hide`, or `window auto`.',
      'error');
  }
  if (!['show', 'hide', 'auto'].includes(keyword)) {
    const [s, e] = wordRange(line, keyword);
    return makeDiag(lineNum, s, e,
      `Unknown \`window\` argument \`${keyword}\`. Valid arguments are: show, hide, auto.`,
      'error');
  }
  return null;
}

/** `nvl` requires clear, show, or hide. */
function checkNvl(line: string, lineNum: number): RenpyDiagnostic | null {
  const match = line.match(/^\s*nvl(?:\s+(\S+))?\s*$/);
  if (!match) return null;

  const keyword = match[1];
  if (!keyword) {
    const [s, e] = wordRange(line, 'nvl');
    return makeDiag(lineNum, s, e,
      '`nvl` requires clear, show, or hide. Usage: `nvl clear`, `nvl show`, or `nvl hide`.',
      'error');
  }
  if (!['clear', 'show', 'hide'].includes(keyword)) {
    const [s, e] = wordRange(line, keyword);
    return makeDiag(lineNum, s, e,
      `Unknown \`nvl\` argument \`${keyword}\`. Valid arguments are: clear, show, hide.`,
      'error');
  }
  return null;
}

/** Inline Python expression checks (runs on `$` lines). */
function checkInlinePython(line: string, lineNum: number): RenpyDiagnostic | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('$')) return null;

  const expr = trimmed.slice(1).trim();

  // Empty $ expression
  if (expr === '') {
    const kwCol = line.indexOf('$') + 1;
    return makeDiag(lineNum, kwCol, kwCol + 1,
      'Empty inline Python expression — `$` must be followed by a statement.',
      'error');
  }

  // `$ varname == value` — comparison used as a statement, likely meant assignment.
  // Only flag when the left-hand side is a plain variable name, not a Python keyword.
  const compMatch = expr.match(/^([a-zA-Z_]\w*)\s*==\s*(.+)/);
  if (compMatch && !PYTHON_KEYWORDS.has(compMatch[1])) {
    const rhs = compMatch[2].trim();
    const [s, e] = wordRange(line, '==');
    return makeDiag(lineNum, s, e,
      `\`${compMatch[1]} == ${rhs}\` is a comparison expression, not an assignment. Did you mean \`${compMatch[1]} = ${rhs}\`?`,
      'warning');
  }

  return null;
}

/** `pause` given a string literal instead of a numeric duration. */
function checkPause(line: string, lineNum: number): RenpyDiagnostic | null {
  // pause is valid with no argument (waits for click) or a numeric/expression argument.
  // Flag only the obviously wrong case: a quoted string as the duration.
  const match = line.match(/^\s*pause\s+(["'])/);
  if (!match) return null;
  const [s, e] = wordRange(line, 'pause');
  return makeDiag(lineNum, s, e,
    '`pause` takes a numeric duration, not a string. Usage: `pause 1.0` or bare `pause` to wait for a click.',
    'warning');
}

// ── Main export ────────────────────────────────────────────────────────────

export function validateRenpyCode(code: string): RenpyDiagnostic[] {
  const diagnostics: RenpyDiagnostic[] = [];
  const lines = code.split('\n');

  let inPythonBlock = false;
  let pythonBlockIndent = -1;

  let inScreenBlock = false;
  let screenBlockIndent = -1;

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const trimmed = line.trim();

    // Skip blank lines and comments
    if (!trimmed || trimmed.startsWith('#')) return;

    const indent = indentOf(line);

    // Exit python block when indentation returns to the opening level
    if (inPythonBlock) {
      if (indent <= pythonBlockIndent) {
        inPythonBlock = false;
        pythonBlockIndent = -1;
        // Fall through — this line is Ren'Py code, validate it normally
      } else {
        return; // Inside python block — skip
      }
    }

    // Exit screen block when indentation returns to the opening level
    if (inScreenBlock && indent <= screenBlockIndent) {
      inScreenBlock = false;
      screenBlockIndent = -1;
      // Fall through — validate this line normally
    }

    // Detect start of python block
    if (PYTHON_BLOCK_RE.test(line)) {
      inPythonBlock = true;
      pythonBlockIndent = indent;
      return;
    }

    // Detect start of screen block
    if (SCREEN_BLOCK_RE.test(line)) {
      inScreenBlock = true;
      screenBlockIndent = indent;
      // Still validate the `screen name:` line itself, then skip inner lines
    }

    // Inline Python expressions — run $ checks then skip all other rules
    if (trimmed.startsWith('$')) {
      const pyDiag = checkInlinePython(line, lineNum);
      if (pyDiag) diagnostics.push(pyDiag);
      return;
    }

    // Run rules
    const show = checkShowExpression(line, lineNum);
    if (show) diagnostics.push(show);

    const playDiags = checkPlayQueue(line, lineNum);
    diagnostics.push(...playDiags);

    const stop = checkStop(line, lineNum);
    if (stop) diagnostics.push(stop);

    const def = checkDefineDefault(line, lineNum);
    if (def) diagnostics.push(def);

    // Inside screen blocks, `label`/`transform` are displayables and quoted strings
    // are not menu choices — suppress these two rules to avoid false positives.
    if (!inScreenBlock) {
      const colon = checkMissingColon(line, lineNum);
      if (colon) diagnostics.push(colon);

      const choice = checkMenuChoiceCondition(line, lineNum);
      if (choice) diagnostics.push(choice);
    }

    const img = checkImageName(line, lineNum);
    if (img) diagnostics.push(img);

    const bare = checkBareStatements(line, lineNum);
    if (bare) diagnostics.push(bare);

    const screen = checkScreenCommands(line, lineNum);
    if (screen) diagnostics.push(screen);

    const win = checkWindow(line, lineNum);
    if (win) diagnostics.push(win);

    const nvl = checkNvl(line, lineNum);
    if (nvl) diagnostics.push(nvl);

    const pause = checkPause(line, lineNum);
    if (pause) diagnostics.push(pause);
  });

  return diagnostics;
}
