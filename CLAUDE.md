# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vangard Ren'Py IDE is a desktop application (Electron + React/TypeScript) for visual novel development with Ren'Py. It represents `.rpy` files as draggable blocks on a canvas, auto-draws `jump`/`call` connection arrows, and provides an integrated Monaco code editor alongside asset and story management tools.

## Build & Run Commands

```bash
npm run dev              # Vite dev server at http://localhost:5173
npm run build            # Production build to dist/
npm run build:debug      # Development build with sourcemaps
npm run electron:start   # Build + launch Electron app
npm run dist             # Create distributable installer (electron-builder)
```

Version management:
```bash
npm run version:patch    # Increment patch version
npm run release:patch    # Increment version + build
```

**Testing** (Vitest):
```bash
npm test                        # Run all tests once
npm run test:watch               # Run in watch mode
npm run test:coverage            # With coverage report
npx vitest run path/to/file.test.ts  # Run a single test file
```
Coverage is configured for `components/`, `hooks/`, `contexts/`, and `App.tsx` using jsdom environment.

Test infrastructure:
- **Setup**: `test/setup.ts` — imports `@testing-library/jest-dom` matchers
- **Electron mock**: `test/mocks/electronAPI.ts` — mock `window.electronAPI` for renderer tests
- **Sample data**: `test/mocks/sampleData.ts` — reusable test fixtures (blocks, characters, etc.)
- Component tests use `@testing-library/react` with `@testing-library/user-event`

**Linting** (ESLint):
```bash
npm run lint             # Check for lint errors
npm run lint:fix         # Auto-fix lint errors
```
Key rules: `react-hooks/rules-of-hooks` (error), `react-hooks/exhaustive-deps` (warn), `@typescript-eslint/no-explicit-any` (warn). Unused vars prefixed with `_` are allowed.

## Architecture

### Dual-Process Electron App

- **Main process** (`electron.js`, ~25K lines): Window management, IPC handlers, file system operations, API key encryption (safeStorage), Ren'Py game execution as child process, custom `media://` protocol for assets.
- **Renderer process** (React app): All UI, state management, and Ren'Py analysis.
- **Preload bridge** (`preload.js`): Exposes `electronAPI` via contextBridge for secure IPC between processes.

### Core Application State (App.tsx)

`App.tsx` (~3.5K lines) is the central state hub. It manages all top-level state (blocks, groups, links, characters, variables, images, audio, screens, scenes, settings) using `useImmer` for immutable draft-based updates. State flows down via props; update callbacks are passed through the component hierarchy. Some state has been extracted into context providers (see Context Providers below).

### Key Data Model (types.ts)

`types.ts` (~930 lines) is the single source of truth for TypeScript types. Key types:

- **Block**: Represents a `.rpy` file with position, size, content, and filePath
- **BlockGroup**: Groups blocks visually on the canvas
- **Link**: Connection between blocks (from `jump`/`call` statements)
- **EditorTab**: Open tab in the editor pane; `type` union includes `canvas`, `route-canvas`, `punchlist`, `editor`, `image`, `audio`, `character`, `scene-composer`, `ai-generator`, `stats`, `markdown`
- **ProjectSettings**: Persisted per-project IDE state including split pane layout, open tabs, canvas transforms
- **AppSettings**: Global app preferences (theme, Ren'Py path, etc.)
- **Character, Variable, ImageAsset, AudioAsset, Screen, Scene**: Story element types
- **UserSnippet**: User-defined code snippet (id, title, prefix, description, code, optional monacoBody for placeholder support)
- **ProjectLoadResult, ScanDirectoryResult**: Typed IPC return shapes (replacing prior `any` usage)
- **SerializedSprite, SerializedSceneComposition**: JSON-safe versions of scene composer types

### Ren'Py Analysis Engine (hooks/useRenpyAnalysis.ts)

The largest source file (~25K lines). Regex-based parser that extracts labels, jumps, calls, characters, variables, screens, images, and audio references from `.rpy` files. Generates flow visualization data. Called via `performRenpyAnalysis()` when files change.

### Visual Canvas System

- **StoryCanvas**: Main view — blocks as draggable rectangles with auto-drawn flow arrows
- **RouteCanvas**: On-demand label-by-label control flow graph with route highlighting
- Canvas coordinates use a transform system (pan via Shift+drag, zoom via scroll)

### Split Pane / Tab System

The editor supports side-by-side or top/bottom split panes (`splitLayout: 'none' | 'right' | 'bottom'`). State is managed in `App.tsx`:
- `primaryOpenTabs` / `secondaryOpenTabs`: tabs per pane
- `activePaneId`: which pane is focused
- `splitPrimarySize`: pixel size of the primary pane
- Tabs can be dragged between panes; removing the last tab from secondary collapses the split
- `Sash.tsx` handles the resizable divider; `TabContextMenu.tsx` handles tab right-click menus
- Split state persists in `ProjectSettings` (written to `project.ide.json`)

### File System Integration

Two modes:
1. **Electron mode** (primary): File System Access API via IPC for direct local folder read/write
2. **Browser mode** (fallback): localStorage with ZIP export

Managed by `hooks/useFileSystemManager.ts` and `contexts/FileSystemContext.ts`.

### Context Providers

- **AssetContext** (`contexts/AssetContext.ts` + `hooks/useAssetManager.ts`): Image/audio scanning, copy-to-project pipeline, metadata; persists scan directory paths in IDE settings
- **FileSystemContext** (`contexts/FileSystemContext.ts` + `hooks/useFileSystemManager.ts`, ~13K lines): Directory/file handle state, clipboard (cut/copy/paste), tree node CRUD and drag-drop
- **SearchContext** (`contexts/SearchContext.tsx`): Project-wide search/replace state and execution. SearchPanel consumes this context directly (no prop drilling). Extracted from App.tsx.
- **ToastContext** (`contexts/ToastContext.tsx`): User notification system

### IPC Channel Conventions

All `preload.js` channels follow a `namespace:action` naming pattern:

| Prefix | Domain |
|--------|--------|
| `fs:` | File I/O (`readFile`, `writeFile`, `createDirectory`, `removeEntry`, `moveFile`, `copyEntry`, `scanDirectory`) |
| `project:` | Project operations (`load`, `refresh-tree`, `search`) |
| `dialog:` | OS dialogs (`openDirectory`, `createProject`, `selectRenpy`, `showSaveDialog`) |
| `game:` / `renpy:` | Game process (`run`, `stop`, `check-path`) |
| `app:` | Settings & encrypted API keys |

Exit flow uses a multi-step handshake: `check-unsaved-changes-before-exit` → `show-exit-modal` → `save-ide-state-before-quit` → `ide-state-saved-for-quit` → `force-quit`.

API keys are stored encrypted via Electron's `safeStorage` at `userData/api-keys.enc`. App settings live at `userData/app-settings.json`.

## Key Conventions

- **State updates**: Always use `useImmer` draft functions, never mutate state directly
- **UI rendering**: Functional components with hooks only, no class components
- **Modals/overlays**: Rendered via `createPortal()`; all modals use `useModalAccessibility` hook for focus trap, Escape key close, and focus restore
- **Styling**: Tailwind CSS utility classes; dark mode via `class` strategy
- **Path alias**: `@/*` maps to project root in imports (tsconfig)
- **Block = file**: Each `.rpy` file maps 1:1 to a Block on the canvas; the first label becomes the block title
- **Accessibility**: Icon-only buttons must have `aria-label`; modals must have `role="dialog"`, `aria-modal`, and `aria-labelledby`

## Key Hooks

- **useHistory<T>**: Generic undo/redo — maintains `past[]`, `present`, `future[]`; exposes `undo()`, `redo()`, `setState()`, `canUndo`, `canRedo`. Guards against undoing past the initial loaded state.
- **useRenpyAnalysis**: Returns `RenpyAnalysisResult` with links, characters, variables, screens, dialogue, and route graphs. Call `performRenpyAnalysis()` after any file change.
- **useFileSystemManager**: File system abstraction with clipboard state (`Set<string>` of paths for cut/copy).
- **useAssetManager**: Manages `ProjectImage` and `RenpyAudio` Maps with metadata; handles scanning external directories and copying assets into the project.
- **useModalAccessibility**: Reusable hook for dialog accessibility — focus trap (Tab/Shift+Tab cycling), Escape key close, auto-focus first element, focus restore on unmount. Used by all modals.

## Keyboard Shortcuts

- `N` — New block
- `G` — Group selected blocks
- `Ctrl+S` — Save
- `Shift+drag` — Pan canvas
- `Scroll` — Zoom canvas

## IntelliSense / Autocomplete

`lib/renpyCompletionProvider.ts` provides context-aware autocomplete for the Monaco editor:
- **`detectContext(lineContent, column)`**: Determines completion context from cursor position (jump, call, call-screen, show, hide, scene, variable, character, general)
- **`getRenpyCompletions(context, data, range)`**: Returns Monaco `CompletionItem[]` with appropriate kinds, sort ordering, and snippet placeholders (`$1/$2/$0`)
- Registered once in `EditorView.tsx` via `monacoInstance.languages.registerCompletionItemProvider('renpy', ...)`
- Uses `analysisResultRef` (a React ref) so the closure always reads the latest analysis data without re-registration
- Includes 28 built-in keyword snippets plus user-defined snippets from `AppSettings.userSnippets`

## User Code Snippets

Users can create custom code snippets (persisted in `AppSettings.userSnippets`):
- **`components/UserSnippetModal.tsx`**: Create/edit modal with title, prefix, description, code, and optional Monaco placeholder support
- **`components/SnippetManager.tsx`**: Displays "My Snippets" section (create/edit/delete/copy) above built-in Ren'Py snippet categories
- User snippets are integrated with IntelliSense — typing the prefix triggers the snippet in the editor
- CRUD operations wired through `App.tsx` → `updateAppSettings`

## Markdown Preview

`components/MarkdownPreviewView.tsx` provides dual-mode `.md` file viewing:
- **Preview mode** (default): Renders GitHub-flavored Markdown via `marked` library with custom `.markdown-body` CSS styles in `index.css`
- **Edit mode**: Monaco editor with `language="markdown"`, Ctrl+S to save
- Toggle button in the toolbar switches between modes
- File content loaded/saved via `fs:readFile` and `fs:writeFile` IPC channels
- Opened by double-clicking `.md` files in the file explorer (`handlePathDoubleClick` → `handleOpenMarkdownTab`)

## AI Story Generator

The app integrates AI APIs (Google Gemini via `@google/genai`, with optional OpenAI and Anthropic support via dynamic imports) for generating story content. API keys are encrypted at rest using Electron's `safeStorage`. The generator UI lives in `components/AIGenerator.tsx`.

## CI/CD

GitHub Actions (`.github/workflows/build.yml`) builds on push/PR to main across Windows, macOS (ARM + Intel), and Linux using Node.js 20. Produces platform-specific installers via electron-builder.
