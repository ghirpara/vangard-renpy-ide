/**
 * @file textmateGrammar.ts
 * @description Bridge between vscode-textmate grammar engine and Monaco editor.
 * Loads Oniguruma WASM, creates a TextMate registry with the Ren'Py grammar,
 * and exposes an EncodedTokensProvider that Monaco can consume directly.
 */

import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import type { StateStack, IGrammar } from 'vscode-textmate';

// Lazily resolved module references (loaded asynchronously to handle WASM init)
let vsctm: typeof import('vscode-textmate') | null = null;
let grammar: IGrammar | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Load the Oniguruma WASM binary and initialise the TextMate registry
 * with the Ren'Py grammar.  Safe to call multiple times — subsequent
 * calls return the same promise.
 */
export async function initTextMate(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Dynamic imports — keeps the main bundle synchronous until we actually
    // need TextMate.
    const oniguruma = await import('vscode-oniguruma');
    vsctm = await import('vscode-textmate');

    // Fetch the Oniguruma WASM binary.
    // The file is copied to the public/ root by vite config so that it's
    // always served at a predictable URL in both dev and production.
    const wasmResponse = await fetch(new URL('/onig.wasm', import.meta.url));
    const wasmBinary = await wasmResponse.arrayBuffer();

    await oniguruma.loadWASM(wasmBinary);

    const registry = new vsctm.Registry({
      onigLib: Promise.resolve({
        createOnigScanner: (patterns: string[]) => oniguruma.createOnigScanner(patterns),
        createOnigString: (s: string) => oniguruma.createOnigString(s),
      }),
      async loadGrammar(scopeName: string) {
        if (scopeName === 'source.renpy') {
          // Import the grammar JSON — Vite resolves this at build time.
          const grammarJson = await import('./renpy.tmLanguage.json');
          return vsctm!.parseRawGrammar(JSON.stringify(grammarJson.default ?? grammarJson), 'renpy.tmLanguage.json');
        }
        return null;
      },
    });

    grammar = await registry.loadGrammar('source.renpy');
    if (!grammar) {
      throw new Error('Failed to load Ren\'Py TextMate grammar');
    }
  })();

  return initPromise;
}

// ---------------------------------------------------------------------------
// State wrapper — Monaco's IState interface requires `clone()` and `equals()`
// ---------------------------------------------------------------------------

class TMState implements monaco.languages.IState {
  constructor(public readonly ruleStack: StateStack) {}

  clone(): TMState {
    return new TMState(this.ruleStack.clone());
  }

  equals(other: monaco.languages.IState): boolean {
    if (!(other instanceof TMState)) return false;
    return this.ruleStack.equals(other.ruleStack);
  }
}

// ---------------------------------------------------------------------------
// Token provider factory
// ---------------------------------------------------------------------------

/**
 * Create a Monaco `TokensProvider` backed by the loaded TextMate grammar.
 *
 * Must be called *after* `initTextMate()` has resolved.
 */
export function createTextMateTokensProvider(): monaco.languages.TokensProvider {
  if (!grammar || !vsctm) {
    throw new Error('TextMate not initialised — call initTextMate() first');
  }

  const INITIAL = vsctm.INITIAL;

  return {
    getInitialState(): monaco.languages.IState {
      return new TMState(INITIAL);
    },

    tokenize(line: string, state: monaco.languages.IState): monaco.languages.ILineTokens {
      const tmState = state as TMState;
      const result = grammar!.tokenizeLine(line, tmState.ruleStack);

      // Convert TextMate tokens → Monaco tokens.
      // Each TextMate token has an array of scope names; we take the most
      // specific (last) scope and use it as the Monaco token type.  Monaco's
      // theme rules do prefix matching so `keyword.control.jump.renpy` will
      // match a rule for `keyword.control` or `keyword`.
      const tokens: monaco.languages.IToken[] = result.tokens.map((t) => {
        const scopes = t.scopes;
        // Use the most specific scope, falling back to the root scope.
        const monacoScope = scopes[scopes.length - 1] || 'source.renpy';
        return {
          startIndex: t.startIndex,
          scopes: monacoScope,
        };
      });

      return {
        tokens,
        endState: new TMState(result.ruleStack),
      };
    },
  };
}
