/**
 * @file types.ts
 * @description Central type definitions for the Vangard Ren'Py IDE.
 * Defines all core data structures used throughout the application including
 * story blocks, characters, variables, assets, UI components, and context values.
 * This file serves as the single source of truth for type safety across the project.
 */

/**
 * Represents a 2D coordinate position on the canvas.
 * @interface Position
 * @property {number} x - The x-coordinate (horizontal position)
 * @property {number} y - The y-coordinate (vertical position)
 */
export interface Position {
  x: number;
  y: number;
}

/**
 * Represents a Ren'Py story block (typically a .rpy file) displayed on the canvas.
 * Blocks are the primary containers for story content and connect through Links.
 * @interface Block
 * @property {string} id - Unique identifier for the block
 * @property {string} content - The full Ren'Py Python/script content of the file
 * @property {Position} position - Canvas position where the block is rendered
 * @property {number} width - Width of the block when displayed on canvas (pixels)
 * @property {number} height - Height of the block when displayed on canvas (pixels)
 * @property {string} [title] - Optional display title (usually first label name)
 * @property {string} [filePath] - File system path to the source .rpy file (e.g., "game/script.rpy")
 * @property {FileSystemFileHandle} [fileHandle] - File system API handle for direct file access
 * @property {string} [color] - Hex color code for visual display (#RRGGBB format)
 */
export interface Block {
  id: string;
  content: string;
  position: Position;
  width: number;
  height: number;
  title?: string;
  filePath?: string;
  fileHandle?: FileSystemFileHandle;
  color?: string;
}

/**
 * Represents a group of blocks on the canvas for visual organization.
 * Used to create logical groupings without affecting story flow.
 * @interface BlockGroup
 * @property {string} id - Unique identifier for the group
 * @property {string} title - Display name for the group
 * @property {Position} position - Top-left corner position of the group
 * @property {number} width - Width of the group rectangle (pixels)
 * @property {number} height - Height of the group rectangle (pixels)
 * @property {string[]} blockIds - Array of block IDs contained in this group
 */
export interface BlockGroup {
  id: string;
  title: string;
  position: Position;
  width: number;
  height: number;
  blockIds: string[];
}

/**
 * Type for sticky note colors available in the UI.
 * @typedef {('yellow' | 'blue' | 'green' | 'pink' | 'purple' | 'red')} NoteColor
 */
export type NoteColor = 'yellow' | 'blue' | 'green' | 'pink' | 'purple' | 'red';

/**
 * Represents a sticky note placed on the canvas for annotations and notes.
 * @interface StickyNote
 * @property {string} id - Unique identifier for the note
 * @property {string} content - Markdown-formatted text content of the note
 * @property {Position} position - Canvas position of the note's top-left corner
 * @property {number} width - Note width (pixels)
 * @property {number} height - Note height (pixels)
 * @property {NoteColor} color - Visual color of the note
 */
export interface StickyNote {
  id: string;
  content: string;
  position: Position;
  width: number;
  height: number;
  color: NoteColor;
}

// LLM support types
export type LLMProvider = 'google' | 'openai' | 'anthropic' | 'other';

export interface LLMModel {
  id: string;
  name: string;
  provider: LLMProvider;
  apiKeyEnvVar?: string;
  apiKeyName?: string;
  description?: string;
  isDefault?: boolean;
}

export interface ApiKeyStore {
  [provider: string]: string;
}

/**
 * Metadata associated with punchlist items for task tracking.
 * @interface PunchlistMetadata
 * @property {string} [notes] - Additional notes for the task
 * @property {string[]} [tags] - Array of tag strings for categorization
 * @property {string} [assignee] - Name or ID of the person responsible
 * @property {'open' | 'completed' | 'ignored'} [status] - Current task status
 */
export interface PunchlistMetadata {
  notes?: string;
  tags?: string[];
  assignee?: string;
  status?: 'open' | 'completed' | 'ignored';
}

// ---------------------------------------------------------------------------
// Diagnostics types
// ---------------------------------------------------------------------------

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface DiagnosticIssue {
  id: string;               // deterministic: "category:blockId:line" or "category:name"
  severity: DiagnosticSeverity;
  category: string;         // "invalid-jump" | "syntax" | "missing-image" | "missing-audio"
                            // | "undefined-character" | "undefined-screen"
                            // | "unused-character" | "unreachable-label"
  message: string;
  blockId?: string;
  filePath?: string;
  line?: number;
  column?: number;
}

export interface DiagnosticsTask {
  id: string;               // crypto.randomUUID()
  title: string;
  description?: string;
  status: 'open' | 'completed';
  blockId?: string;         // optional link to a file
  line?: number;
  stickyNoteId?: string;    // if derived from a canvas sticky note
  createdAt: number;        // Date.now()
}

export interface DiagnosticsResult {
  issues: DiagnosticIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

/**
 * Represents a Ren'Py Character definition extracted from code.
 * Includes standard Character() parameters and custom extensions for styling.
 * @interface Character
 * @property {string} name - Display name shown during dialogue
 * @property {string} tag - Python variable name for the character (e.g., "e" for Eileen)
 * @property {string} color - Hex color code used for visual identification
 * @property {string} [profile] - Notes/description extracted from comments
 * @property {string} definedInBlockId - ID of the block containing the character definition
 * @property {string} [image] - Default image for the character (Ren'Py image tag)
 * @property {string} [who_style] - Style for character name in dialogue
 * @property {string} [who_prefix] - Text prefix before character name
 * @property {string} [who_suffix] - Text suffix after character name
 * @property {string} [what_color] - Dialogue text color (CSS format)
 * @property {string} [what_style] - Dialogue text style
 * @property {string} [what_prefix] - Text prefix before dialogue
 * @property {string} [what_suffix] - Text suffix after dialogue
 * @property {boolean} [slow] - Whether to use slow text effect
 * @property {number} [slow_speed] - Text reveal speed in characters per second
 * @property {boolean} [slow_abortable] - Whether player can skip slow text
 * @property {boolean} [all_at_once] - Display entire dialogue at once
 * @property {string} [window_style] - Style for dialogue window
 * @property {string} [ctc] - Click-to-continue indicator image/text
 * @property {'nestled' | 'fixed'} [ctc_position] - Position of click-to-continue indicator
 * @property {boolean} [interact] - Whether character name is clickable
 * @property {boolean} [afm] - Auto-forward mode setting
 * @property {string} [what_properties] - Raw Python dict string for additional dialogue properties
 * @property {string} [window_properties] - Raw Python dict string for additional window properties
 */
export interface Character {
  // Core attributes
  name: string;
  tag: string;
  color: string;
  profile?: string;
  definedInBlockId: string;

  // Other Ren'Py Character parameters
  image?: string;

  // who_ prefix (name label)
  who_style?: string;
  who_prefix?: string;
  who_suffix?: string;

  // what_ prefix (dialogue text)
  what_color?: string;
  what_style?: string;
  what_prefix?: string;
  what_suffix?: string;
  
  // Slow text parameters
  slow?: boolean;
  slow_speed?: number;
  slow_abortable?: boolean;
  all_at_once?: boolean;
  
  // window_ prefix (dialogue window)
  window_style?: string;

  // Click-to-continue
  ctc?: string;
  ctc_position?: 'nestled' | 'fixed';

  // Other behaviors
  interact?: boolean;
  afm?: boolean;

  // Raw properties for complex cases
  what_properties?: string;
  window_properties?: string;
}


/**
 * Represents a Ren'Py variable definition (define or default statement).
 * @interface Variable
 * @property {string} name - Variable identifier (e.g., "persistent.player_name")
 * @property {'define' | 'default'} type - Statement type: 'define' for constants, 'default' for dynamic
 * @property {string} initialValue - Initial value expression as string
 * @property {string} definedInBlockId - ID of the block where variable is defined
 * @property {number} line - Line number in the file where variable is defined
 */
export interface Variable {
  name: string;
  type: 'define' | 'default';
  initialValue: string;
  definedInBlockId: string;
  line: number;
}

/**
 * Represents a Ren'Py screen definition extracted from code.
 * @interface RenpyScreen
 * @property {string} name - Name of the screen as defined in code
 * @property {string} parameters - Parameter list string (e.g., "(msg='Hello')")
 * @property {string} definedInBlockId - ID of the block containing this screen
 * @property {number} line - Line number where screen is defined
 */
export interface RenpyScreen {
  name: string;
  parameters: string;
  definedInBlockId: string;
  line: number;
}

/**
 * A component within a visual screen editor layout.
 * Used by the Screen Editor (post-1.0 feature).
 */
export interface ScreenComponent {
  id: string;
  type: 'frame' | 'vbox' | 'hbox' | 'text' | 'textbutton' | 'imagebutton' | 'image' | 'null';
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: Record<string, any>;
  children: ScreenComponent[];
}

/**
 * The top-level model for a screen being edited in the visual Screen Editor.
 * Used by the Screen Editor (post-1.0 feature).
 */
export interface ScreenModel {
  name: string;
  width?: number;
  height?: number;
  backgroundColor?: string;
  components: ScreenComponent[];
}

/**
 * Represents an image asset that can be used in the project.
 * Supports both internal (game/images/) and external scanned images.
 * @interface ProjectImage
 * @property {string} filePath - Unique file path (e.g., "ScannedDir/subdir/img.png" or "game/images/img.png")
 * @property {string} fileName - Base filename with extension
 * @property {string} [dataUrl] - Data URL for displaying image (blob:, media://, or base64)
 * @property {FileSystemFileHandle | null} fileHandle - File system API handle for direct access
 * @property {boolean} isInProject - True if image is in game/images folder
 * @property {string} [projectFilePath] - Path within project if copied (e.g., "game/images/img.png")
 * @property {number} [lastModified] - File modification timestamp
 * @property {number} [size] - File size in bytes
 */
export interface ProjectImage {
  filePath: string;
  fileName: string;
  dataUrl?: string;
  fileHandle: FileSystemFileHandle | null;
  isInProject: boolean;
  projectFilePath?: string;
  lastModified?: number;
  size?: number;
}

/**
 * Metadata for organizing and tagging images in the project.
 * @interface ImageMetadata
 * @property {string} renpyName - Ren'Py image tag (e.g., "eileen happy")
 * @property {string[]} tags - Searchable tags for categorization
 * @property {string} [projectSubfolder] - Subfolder path (e.g., "characters/eileen" for game/images/characters/eileen)
 */
export interface ImageMetadata {
  renpyName: string;
  tags: string[];
  projectSubfolder?: string;
}

/**
 * Represents an audio asset that can be used in the project.
 * Supports both internal (game/audio/) and external scanned audio files.
 * @interface RenpyAudio
 * @property {string} filePath - Unique file path (e.g., "ScannedDir/subdir/sound.ogg" or "game/audio/sound.ogg")
 * @property {string} fileName - Base filename with extension
 * @property {string} dataUrl - Data URL for audio playback
 * @property {FileSystemFileHandle | null} fileHandle - File system API handle for direct access
 * @property {boolean} isInProject - True if audio is in game/audio folder
 * @property {string} [projectFilePath] - Path within project if copied (e.g., "game/audio/sound.ogg")
 * @property {number} [lastModified] - File modification timestamp
 * @property {number} [size] - File size in bytes
 */
export interface RenpyAudio {
  filePath: string;
  fileName: string;
  dataUrl: string;
  fileHandle: FileSystemFileHandle | null;
  isInProject: boolean;
  projectFilePath?: string;
  lastModified?: number;
  size?: number;
}

/**
 * Metadata for organizing and tagging audio files in the project.
 * @interface AudioMetadata
 * @property {string} renpyName - Ren'Py audio channel (e.g., "music" or "sfx")
 * @property {string[]} tags - Searchable tags for categorization
 * @property {string} [projectSubfolder] - Subfolder path (e.g., "sfx/footsteps" for game/audio/sfx/footsteps)
 */
export interface AudioMetadata {
  renpyName: string;
  tags: string[];
  projectSubfolder?: string;
}

/**
 * Records a single usage instance of a variable in the code.
 * @interface VariableUsage
 * @property {string} blockId - ID of the block where variable is used
 * @property {number} line - Line number of the usage
 */
export interface VariableUsage {
  blockId: string;
  line: number;
}

/**
 * Represents a connection between two story blocks in the narrative flow.
 * @interface Link
 * @property {string} sourceId - Block ID where the jump/call originates
 * @property {string} targetId - Block ID being jumped/called to
 * @property {string} targetLabel - Name of the specific label being targeted
 */
export interface Link {
  sourceId: string;
  targetId: string;
  targetLabel: string;
  type?: 'jump' | 'call';
}

/**
 * Detailed location information for a label definition in code.
 * Used for navigation and editor integration.
 * @interface LabelLocation
 * @property {string} blockId - ID of the block containing this label
 * @property {string} label - Name of the label
 * @property {number} line - Line number where label is defined
 * @property {number} column - Column number where label name starts
 * @property {'label' | 'menu'} type - Whether it's a standard label or menu label
 */
export interface LabelLocation {
  blockId: string;
  label: string;
  line: number;
  column: number;
  type: 'label' | 'menu';
}

/**
 * Records information about a jump or call statement in the code.
 * @interface JumpLocation
 * @property {string} blockId - ID of the block containing the jump
 * @property {string} target - Target label name
 * @property {'jump' | 'call'} type - Jump type (jump exits current flow, call returns)
 * @property {boolean} [isDynamic] - True if target is dynamically determined at runtime
 * @property {number} line - Line number of the jump statement
 * @property {number} columnStart - Starting column of target label in editor
 * @property {number} columnEnd - Ending column of target label in editor
 */
export interface JumpLocation {
  blockId: string;
  target: string;
  type: 'jump' | 'call';
  isDynamic?: boolean;
  line: number;
  columnStart: number;
  columnEnd: number;
  choiceText?: string;      // Set when this jump is inside a menu choice block
  choiceCondition?: string; // The `if <expr>` guard on the choice, if any
  menuLine?: number;        // 1-based line of the `menu:` keyword (groups choices in the same menu)
}

/**
 * Represents a single line of dialogue in the script.
 * @interface DialogueLine
 * @property {number} line - Line number in the block
 * @property {string} tag - Character tag speaking the dialogue
 */
export interface DialogueLine {
  line: number;
  tag: string;
}

/**
 * Represents a single label node on the Route Canvas.
 * Each label is a distinct point in the narrative flow.
 * @interface LabelNode
 * @property {string} id - Composite key: `${blockId}:${label}`
 * @property {string} label - Label name
 * @property {string} blockId - ID of containing block
 * @property {string} [containerName] - Display name of the file/block
 * @property {number} startLine - Starting line number in the file
 * @property {Position} position - Canvas position for rendering
 * @property {number} width - Node width (pixels)
 * @property {number} height - Node height (pixels)
 */
export interface LabelNode {
  id: string;
  label: string;
  blockId: string;
  containerName?: string;
  startLine: number;
  position: Position;
  width: number;
  height: number;
}

/**
 * Represents a connection between two label nodes on the Route Canvas.
 * Shows the flow of execution from one label to another.
 * @interface RouteLink
 * @property {string} id - Unique identifier for the link
 * @property {string} sourceId - Source label node ID
 * @property {string} targetId - Target label node ID
 * @property {'jump' | 'call' | 'implicit'} type - Type of flow (explicit jump/call or implicit fall-through)
 */
export interface RouteLink {
  id: string;
  sourceId: string;
  targetId: string;
  type: 'jump' | 'call' | 'implicit';
  choiceText?: string;      // Set when this link originated from a menu choice jump
  choiceCondition?: string; // The `if <expr>` guard on the choice, if any
  sourceLine?: number;      // Line number of the jump statement (for "Open in editor")
  menuLine?: number;        // Line of the `menu:` keyword — groups all edges from the same menu
}

/**
 * Represents one identified route (path) through the entire label graph.
 * Used to color-code different narrative paths in the Route Canvas.
 * @interface IdentifiedRoute
 * @property {number} id - Unique route identifier
 * @property {string} color - Hex color code for visual representation
 * @property {Set<string>} linkIds - Set of route link IDs that comprise this route
 */
export interface IdentifiedRoute {
  id: number;
  color: string;
  linkIds: Set<string>;
}

/**
 * Comprehensive analysis result containing all extracted data from Ren'Py blocks.
 * Returned by performRenpyAnalysis() and useRenpyAnalysis() hook.
 * @interface RenpyAnalysisResult
 * @property {Link[]} links - Inter-block connections from jump/call statements
 * @property {Object} invalidJumps - Map of block ID to array of unresolvable jump targets
 * @property {Object} firstLabels - Map of block ID to first label name found
 * @property {Object} labels - Map of label name to detailed location information
 * @property {Object} jumps - Map of block ID to array of jump locations
 * @property {Set<string>} rootBlockIds - Block IDs with no incoming jumps (entry points)
 * @property {Set<string>} leafBlockIds - Block IDs with no outgoing jumps (endings)
 * @property {Set<string>} branchingBlockIds - Block IDs with multiple paths (menus/conditions)
 * @property {Set<string>} screenOnlyBlockIds - Block IDs that only define screens, not story
 * @property {Set<string>} storyBlockIds - Block IDs containing story content
 * @property {Set<string>} configBlockIds - Block IDs for configuration (options.rpy, etc.)
 * @property {Map<string, Character>} characters - Map of character tag to Character definition
 * @property {Map<string, DialogueLine[]>} dialogueLines - Map of block ID to dialogue lines
 * @property {Map<string, number>} characterUsage - Map of character tag to appearance count
 * @property {Map<string, Variable>} variables - Map of variable name to definition
 * @property {Map<string, VariableUsage[]>} variableUsages - Map of variable name to usage locations
 * @property {Map<string, RenpyScreen>} screens - Map of screen name to definition
 * @property {Set<string>} definedImages - Set of image tags defined in code
 * @property {Map<string, Set<string>>} blockTypes - Map of block ID to content types found
 * @property {LabelNode[]} labelNodes - All nodes in Route Canvas visualization
 * @property {RouteLink[]} routeLinks - All connections in Route Canvas
 * @property {IdentifiedRoute[]} identifiedRoutes - Identified narrative paths
 */
export interface RenpyAnalysisResult {
  links: Link[];
  invalidJumps: { [blockId: string]: string[] };
  firstLabels: { [blockId: string]: string };
  labels: { [label: string]: LabelLocation };
  jumps: { [blockId: string]: JumpLocation[] };
  rootBlockIds: Set<string>;
  leafBlockIds: Set<string>;
  branchingBlockIds: Set<string>;
  screenOnlyBlockIds: Set<string>;
  storyBlockIds: Set<string>;
  configBlockIds: Set<string>;
  characters: Map<string, Character>;
  dialogueLines: Map<string, DialogueLine[]>;
  characterUsage: Map<string, number>;
  variables: Map<string, Variable>;
  variableUsages: Map<string, VariableUsage[]>;
  screens: Map<string, RenpyScreen>;
  definedImages: Set<string>;
  blockTypes: Map<string, Set<string>>;
  labelNodes: LabelNode[];
  routeLinks: RouteLink[];
  identifiedRoutes: IdentifiedRoute[];
}


/**
 * Represents a single open tab in the main editor UI.
 * Tabs can display different views: canvas, code editor, images, characters, etc.
 * @interface EditorTab
 * @property {string} id - Unique tab identifier (block ID or view name)
 * @property {'canvas' | 'route-canvas' | 'punchlist' | 'editor' | 'image' | 'audio' | 'character' | 'scene-composer'} type - Type of tab content
 * @property {string} [blockId] - Block ID if editing code (for editor type)
 * @property {string} [filePath] - File path for image/audio tabs
 * @property {string} [characterTag] - Character tag for character editor tabs
 * @property {string} [sceneId] - Scene ID for scene composer tabs
 * @property {Object} [scrollRequest] - Request to scroll editor to specific line
 * @property {number} scrollRequest.line - Target line number
 * @property {number} scrollRequest.key - Unique key to trigger scroll event
 */
export interface EditorTab {
  id: string;
  type: 'canvas' | 'route-canvas' | 'punchlist' | 'diagnostics' | 'editor' | 'image' | 'audio' | 'character' | 'scene-composer' | 'imagemap-composer' | 'screen-layout-composer' | 'ai-generator' | 'stats' | 'markdown';
  blockId?: string;
  filePath?: string;
  characterTag?: string;
  sceneId?: string;
  imagemapId?: string;
  layoutId?: string;
  scrollRequest?: { line: number; key: number };
}

/**
 * Represents a node in the file explorer tree hierarchy.
 * Used to display the project's folder structure in the left panel.
 * @interface FileSystemTreeNode
 * @property {string} name - File or folder name
 * @property {string} path - Absolute path to the file or folder
 * @property {FileSystemTreeNode[]} [children] - Child nodes for folders
 */
export interface FileSystemTreeNode {
  name: string;
  path: string;
  children?: FileSystemTreeNode[];
}

/**
 * Represents a single toast notification message.
 * Displayed as a temporary notification in the UI.
 * @interface ToastMessage
 * @property {string} id - Unique message identifier
 * @property {string} message - Message text to display
 * @property {'success' | 'error' | 'warning' | 'info'} type - Message severity type
 */
export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

/**
 * Type for available UI themes.
 * @typedef {('system' | 'light' | 'dark' | 'solarized-light' | 'solarized-dark' | 'colorful' | 'colorful-light' | 'neon-dark' | 'ocean-dark' | 'candy-light' | 'forest-light')} Theme
 */
export type Theme = 'system' | 'light' | 'dark' | 'solarized-light' | 'solarized-dark' | 'colorful' | 'colorful-light' | 'neon-dark' | 'ocean-dark' | 'candy-light' | 'forest-light';

/**
 * Application-level settings persisted across sessions.
 * Includes UI preferences, paths, and editor settings.
 * @interface AppSettings
 * @property {Theme} theme - Current UI theme
 * @property {boolean} isLeftSidebarOpen - Whether left sidebar is visible
 * @property {number} leftSidebarWidth - Width of left sidebar (pixels)
 * @property {boolean} isRightSidebarOpen - Whether right sidebar is visible
 * @property {number} rightSidebarWidth - Width of right sidebar (pixels)
 * @property {string} renpyPath - Path to Ren'Py runtime directory
 * @property {string[]} recentProjects - List of recently opened project paths
 * @property {string} editorFontFamily - Font family for code editor
 * @property {number} editorFontSize - Font size for code editor (pixels)
 * @property {Record<string, boolean>} [snippetCategoriesState] - Collapsed/expanded state of snippet categories
 */
export interface AppSettings {
  theme: Theme;
  isLeftSidebarOpen: boolean;
  leftSidebarWidth: number;
  isRightSidebarOpen: boolean;
  rightSidebarWidth: number;
  renpyPath: string;
  recentProjects: string[];
  editorFontFamily: string;
  editorFontSize: number;
  snippetCategoriesState?: Record<string, boolean>;
  mouseGestures?: MouseGestureSettings;
  userSnippets?: UserSnippet[];
}

/**
 * A user-defined code snippet.
 * Stored in AppSettings and available in both the SnippetManager panel and Monaco autocomplete.
 */
export interface UserSnippet {
  id: string;
  title: string;
  prefix: string;
  description: string;
  code: string;
  monacoBody?: string;
}

export type CanvasPanGesture = 'shift-drag' | 'drag' | 'middle-drag';

export interface MouseGestureSettings {
  canvasPanGesture: CanvasPanGesture;
  middleMouseAlwaysPans: boolean;
  zoomScrollDirection: 'normal' | 'inverted';
  zoomScrollSensitivity: number;
}

/**
 * Represents a sprite in a scene composition.
 * Used by Scene Composer to manage visual elements.
 * @interface SceneSprite
 * @property {string} id - Unique sprite identifier
 * @property {ProjectImage} image - Image asset for the sprite
 * @property {number} x - Horizontal alignment (0.0 to 1.0, where 0 is left, 1 is right)
 * @property {number} y - Vertical alignment (0.0 to 1.0, where 0 is top, 1 is bottom)
 * @property {number} zoom - Scale factor (1.0 is original size)
 * @property {number} zIndex - Layering order (higher = on top)
 * @property {boolean} flipH - Horizontal flip
 * @property {boolean} flipV - Vertical flip
 * @property {number} rotation - Rotation angle in degrees
 * @property {number} alpha - Opacity (0.0 to 1.0)
 * @property {number} blur - Blur effect in pixels
 * @property {boolean} [visible] - Whether sprite is visible
 */
export interface SceneSprite {
  id: string;
  image: ProjectImage;
  x: number;
  y: number;
  zoom: number;
  zIndex: number;
  flipH: boolean;
  flipV: boolean;
  rotation: number;
  alpha: number;
  blur: number;
  visible?: boolean;
}

/**
 * Represents a complete scene composition with background and sprites.
 * Used by Scene Composer to manage visual layouts.
 * @interface SceneComposition
 * @property {SceneSprite | null} background - Background image (null if none)
 * @property {SceneSprite[]} sprites - Array of foreground sprites
 * @property {{ width: number; height: number }} [resolution] - Reference canvas resolution (defaults to 1920×1080)
 */
export interface SceneComposition {
  background: SceneSprite | null;
  sprites: SceneSprite[];
  resolution?: { width: number; height: number };
}

/**
 * Action type for ImageMap hotspot interactions.
 * Determines what happens when a hotspot is clicked.
 * @typedef {('jump' | 'call')} ImageMapActionType
 */
export type ImageMapActionType = 'jump' | 'call';

/**
 * Represents a clickable hotspot region in an imagemap.
 * @interface ImageMapHotspot
 * @property {string} id - Unique identifier for the hotspot
 * @property {number} x - X coordinate of top-left corner (pixels)
 * @property {number} y - Y coordinate of top-left corner (pixels)
 * @property {number} width - Width of the hotspot region (pixels)
 * @property {number} height - Height of the hotspot region (pixels)
 * @property {ImageMapActionType} actionType - Type of action (jump or call)
 * @property {string} targetLabel - Label to jump/call when clicked
 */
export interface ImageMapHotspot {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  actionType: ImageMapActionType;
  targetLabel: string;
}

/**
 * Represents a complete imagemap composition with ground image and hotspots.
 * Used by ImageMap Composer to design clickable image regions.
 * @interface ImageMapComposition
 * @property {string} screenName - Name of the Ren'Py screen
 * @property {ProjectImage | null} groundImage - Base image for the imagemap
 * @property {ProjectImage | null} hoverImage - Optional hover overlay image
 * @property {ImageMapHotspot[]} hotspots - Array of clickable hotspot regions
 */
export interface ImageMapComposition {
  screenName: string;
  groundImage: ProjectImage | null;
  hoverImage: ProjectImage | null;
  hotspots: ImageMapHotspot[];
}

/**
 * Widget types supported by the Screen Layout Composer.
 * Maps to Ren'Py screen language statement types.
 */
export type ScreenWidgetType =
  'vbox' | 'hbox' | 'frame' |
  'text' | 'image' |
  'textbutton' | 'button' | 'imagebutton' |
  'bar' | 'input' | 'null';

/**
 * A single widget node in a screen layout composition.
 * Widgets may be nested (vbox/hbox/frame carry children).
 * Top-level widgets support absolute positioning via xpos/ypos/xalign/yalign.
 * Children of container widgets are flow-positioned by the container.
 */
export interface ScreenWidget {
  id: string;
  type: ScreenWidgetType;
  xpos?: number;
  ypos?: number;
  xalign?: number;
  yalign?: number;
  text?: string;
  action?: string;
  imagePath?: string;
  /** Preview-only: data/media URL for displaying the image in the composer. Not used in code generation. */
  imageDataUrl?: string;
  style?: string;
  children?: ScreenWidget[];
}

/**
 * A complete screen layout composition managed by the Screen Layout Composer.
 * Generates a Ren'Py `screen` block. Persisted in ProjectSettings.
 */
export interface ScreenLayoutComposition {
  screenName: string;
  gameWidth: number;
  gameHeight: number;
  modal: boolean;
  zorder: number;
  widgets: ScreenWidget[];
}

/**
 * Project-level settings stored per Ren'Py project.
 * Includes AI features, tab state, and custom content.
 * @interface ProjectSettings
 * @property {boolean} enableAiFeatures - Whether AI features are enabled
 * @property {string} selectedModel - AI model ID for content generation
 * @property {boolean} draftingMode - Whether drafting mode is active
 * @property {EditorTab[]} openTabs - Currently open editor tabs
 * @property {string} activeTabId - ID of the currently active tab
 * @property {StickyNote[]} [stickyNotes] - Annotations on the canvas
 * @property {Record<string, string>} [characterProfiles] - Character profile notes indexed by character tag
 * @property {Record<string, PunchlistMetadata>} [punchlistMetadata] - Task tracking metadata
 * @property {Record<string, SceneComposition>} [sceneCompositions] - Saved scene layouts indexed by scene ID
 * @property {Record<string, string>} [sceneNames] - Display names for scenes
 * @property {string[]} [scannedImagePaths] - Paths to directories scanned for images
 * @property {string[]} [scannedAudioPaths] - Paths to directories scanned for audio
 */
export interface ProjectSettings {
  enableAiFeatures: boolean;
  selectedModel: string;
  draftingMode: boolean;
  openTabs: EditorTab[];
  activeTabId: string;
  splitLayout?: 'none' | 'right' | 'bottom';
  splitPrimarySize?: number;
  secondaryOpenTabs?: EditorTab[];
  secondaryActiveTabId?: string;
  stickyNotes?: StickyNote[];
  characterProfiles?: Record<string, string>;
  punchlistMetadata?: Record<string, PunchlistMetadata>;
  diagnosticsTasks?: DiagnosticsTask[];
  sceneCompositions?: Record<string, SceneComposition>;
  sceneNames?: Record<string, string>;
  imagemapCompositions?: Record<string, ImageMapComposition>;
  screenLayoutCompositions?: Record<string, ScreenLayoutComposition>;
  scannedImagePaths?: string[];
  scannedAudioPaths?: string[];
}

/**
 * Combined settings interface for components that need both app and project settings.
 * Used primarily in the Settings Modal.
 * @interface IdeSettings
 * @extends AppSettings
 * @extends Omit<ProjectSettings, 'openTabs' | 'activeTabId' | 'stickyNotes' | 'characterProfiles' | 'punchlistMetadata' | 'sceneCompositions' | 'sceneNames' | 'scannedImagePaths' | 'scannedAudioPaths'>
 */
export interface IdeSettings extends AppSettings, Omit<ProjectSettings, 'openTabs' | 'activeTabId' | 'stickyNotes' | 'characterProfiles' | 'punchlistMetadata' | 'diagnosticsTasks' | 'sceneCompositions' | 'sceneNames' | 'scannedImagePaths' | 'scannedAudioPaths'> {}

/**
 * Represents the current clipboard state for cut/copy operations in the file explorer.
 * @typedef {({type: 'copy' | 'cut'; paths: Set<string>} | null)} ClipboardState
 * - null: Nothing in clipboard
 * - type 'copy': Items to be copied to new location
 * - type 'cut': Items to be moved to new location
 */
export type ClipboardState = { type: 'copy' | 'cut'; paths: Set<string> } | null;

/**
 * Represents a single match result from a text search in the project.
 * @interface SearchMatch
 * @property {number} lineNumber - Line number of the match (1-based)
 * @property {string} lineContent - Full text content of the matching line
 * @property {number} startColumn - Starting column of match in the line
 * @property {number} endColumn - Ending column of match in the line
 */
export interface SearchMatch {
  lineNumber: number;
  lineContent: string;
  startColumn: number;
  endColumn: number;
}

/**
 * Represents search results from a single file.
 * @interface SearchResult
 * @property {string} filePath - Path to the file containing matches
 * @property {SearchMatch[]} matches - Array of matches found in the file
 */
export interface SearchResult {
  filePath: string;
  matches: SearchMatch[];
}

/**
 * Context value type for Asset management (images and audio).
 * Provides state and methods for managing project assets.
 * @interface AssetContextValue
 * @property {Map<string, ProjectImage>} projectImages - Map of project images indexed by file path
 * @property {Map<string, ImageMetadata>} imageMetadata - Metadata for images
 * @property {Map<string, FileSystemDirectoryHandle>} imageScanDirectories - Scanned image directories
 * @property {Map<string, RenpyAudio>} projectAudios - Map of project audio files
 * @property {Map<string, AudioMetadata>} audioMetadata - Metadata for audio files
 * @property {Map<string, FileSystemDirectoryHandle>} audioScanDirectories - Scanned audio directories
 * @property {Function} loadProjectAssets - Load assets from project directory
 * @property {Function} loadIdeSettings - Load IDE settings from project
 * @property {Function} setAllAssets - Set all asset maps at once
 * @property {Function} handleAddImageScanDirectory - Add new image scan directory
 * @property {Function} handleCopyImagesToProject - Copy images from external location to project
 * @property {Function} handleUpdateImageMetadata - Update metadata for an image
 * @property {Function} handleAddAudioScanDirectory - Add new audio scan directory
 * @property {Function} handleCopyAudiosToProject - Copy audio files from external location to project
 * @property {Function} handleUpdateAudioMetadata - Update metadata for audio file
 */
export interface AssetContextValue {
  projectImages: Map<string, ProjectImage>;
  imageMetadata: Map<string, ImageMetadata>;
  imageScanDirectories: Map<string, FileSystemDirectoryHandle>;
  projectAudios: Map<string, RenpyAudio>;
  audioMetadata: Map<string, AudioMetadata>;
  audioScanDirectories: Map<string, FileSystemDirectoryHandle>;
  loadProjectAssets: (rootHandle: FileSystemDirectoryHandle) => Promise<void>;
  loadIdeSettings: (rootHandle: FileSystemDirectoryHandle) => Promise<void>;
  setAllAssets: (data: {
    images: Map<string, ProjectImage>;
    audios: Map<string, RenpyAudio>;
    imageMeta: Map<string, ImageMetadata>;
    audioMeta: Map<string, AudioMetadata>;
  }) => void;
  handleAddImageScanDirectory: () => Promise<void>;
  handleCopyImagesToProject: (sourceFilePaths: string[], metadataOverride?: ImageMetadata) => Promise<void>;
  handleUpdateImageMetadata: (projectFilePath: string, newMetadata: ImageMetadata) => Promise<void>;
  handleAddAudioScanDirectory: () => Promise<void>;
  handleCopyAudiosToProject: (sourceFilePaths: string[], metadataOverride?: AudioMetadata) => Promise<void>;
  handleUpdateAudioMetadata: (projectFilePath: string, newMetadata: AudioMetadata) => Promise<void>;
}

/**
 * Context value type for File System operations.
 * Provides access to project files and folder structure.
 * @interface FileSystemContextValue
 * @property {FileSystemDirectoryHandle | null} directoryHandle - Handle to the open project directory
 * @property {FileSystemTreeNode | null} fileTree - Hierarchical representation of project structure
 * @property {ClipboardState} clipboard - Current clipboard state for cut/copy operations
 * @property {Function} requestOpenFolder - Prompt user to open a project folder
 * @property {Function} handleCreateNode - Create a new file or folder
 * @property {Function} handleRenameNode - Rename a file or folder
 * @property {Function} handleDeleteNode - Delete one or more files/folders
 * @property {Function} handleMoveNode - Move files/folders to new location
 * @property {Function} handleCut - Cut files/folders to clipboard
 * @property {Function} handleCopy - Copy files/folders to clipboard
 * @property {Function} handlePaste - Paste clipboard contents to target folder
 * @property {boolean} isWelcomeScreenVisible - Whether welcome screen is shown
 * @property {Function} setIsWelcomeScreenVisible - Toggle welcome screen visibility
 * @property {Function} processUploadedFile - Handle file upload from user
 * @property {Object} uploadConfirm - Upload confirmation dialog state
 * @property {boolean} uploadConfirm.visible - Whether confirmation is shown
 * @property {File | null} uploadConfirm.file - File pending confirmation
 * @property {Function} setUploadConfirm - Update upload confirmation state
 * @property {Function} tidyUpLayout - Automatically arrange blocks on canvas
 */
export interface FileSystemContextValue {
  directoryHandle: FileSystemDirectoryHandle | null;
  fileTree: FileSystemTreeNode | null;
  clipboard: ClipboardState;
  requestOpenFolder: () => void;
  handleCreateNode: (parentPath: string, name: string, type: 'file' | 'folder') => Promise<void>;
  handleRenameNode: (oldPath: string, newName: string) => Promise<void>;
  handleDeleteNode: (paths: string[]) => void;
  handleMoveNode: (sourcePaths: string[], targetFolderPath: string) => Promise<void>;
  handleCut: (paths: string[]) => void;
  handleCopy: (paths: string[]) => void;
  handlePaste: (targetFolderPath: string) => Promise<void>;
  isWelcomeScreenVisible: boolean;
  setIsWelcomeScreenVisible: React.Dispatch<React.SetStateAction<boolean>>;
  processUploadedFile: (file: File) => Promise<void>;
  uploadConfirm: { visible: boolean; file: File | null; };
  setUploadConfirm: React.Dispatch<React.SetStateAction<{ visible: boolean; file: File | null; }>>;
  tidyUpLayout: (blocksToLayout: Block[], links: Link[]) => Block[];
}

// --- IPC Data Shapes (returned by Electron main process) ---

/** A file entry returned by the loadProject IPC handler. */
export interface ProjectFileEntry {
  path: string;
  content: string;
}

/** An image asset entry returned by loadProject or scanDirectory. */
export interface ScannedImageAsset {
  path: string;
  fileName: string;
  dataUrl: string;
  lastModified: number;
  size: number;
}

/** An audio asset entry returned by loadProject or scanDirectory. */
export interface ScannedAudioAsset {
  path: string;
  fileName: string;
  dataUrl: string;
  lastModified: number;
  size: number;
}

/** Result of the loadProject IPC call. */
export interface ProjectLoadResult {
  rootPath: string;
  files: ProjectFileEntry[];
  images: ScannedImageAsset[];
  audios: ScannedAudioAsset[];
  settings: ProjectSettings | null;
  tree: FileSystemTreeNode;
}

/** Result of the scanDirectory IPC call. */
export interface ScanDirectoryResult {
  images: ScannedImageAsset[];
  audios: ScannedAudioAsset[];
  error?: string;
}

/** Serialized sprite for saving scene compositions (paths only, no data URLs). */
export interface SerializedSprite {
  id: string;
  image: { filePath: string };
  x: number;
  y: number;
  zoom: number;
  zIndex: number;
  flipH: boolean;
  flipV: boolean;
  rotation: number;
  alpha: number;
  blur: number;
  visible?: boolean;
}

/** Serialized scene composition for persistence. */
export interface SerializedSceneComposition {
  background: SerializedSprite | null;
  sprites: SerializedSprite[];
  resolution?: { width: number; height: number };
}

/**
 * Global Electron API interface available in windows.electronAPI.
 * Provides access to OS-level features in Electron app mode.
 * Methods for file operations, Ren'Py execution, game control, and IPC.
 */
declare global {
  interface Window {
    electronAPI?: {
          openDirectory: () => Promise<string | null>;
          createProject?: () => Promise<string | null>;
          checkRenpyProject?: (path: string) => Promise<{ hasGameFolder: boolean; isRenpyProject: boolean }>;
          cancelProjectLoad?: () => void;
          loadProject: (path: string) => Promise<ProjectLoadResult>;
          refreshProjectTree: (path: string) => Promise<FileSystemTreeNode>;
          readFile: (path: string) => Promise<string>;
          writeFile: (path: string, content: string, encoding?: string) => Promise<{ success: boolean; error?: string }>;
          createDirectory: (path: string) => Promise<{ success: boolean; error?: string }>;
          removeEntry: (path: string) => Promise<{ success: boolean; error?: string }>;
          moveFile: (oldPath: string, newPath: string) => Promise<{ success: boolean; error?: string }>;
          copyEntry: (sourcePath: string, destPath: string) => Promise<{ success: boolean; error?: string }>;
          scanDirectory: (path: string) => Promise<ScanDirectoryResult>;
          onMenuCommand: (callback: (data: { command: string, type?: 'canvas' | 'route-canvas' | 'punchlist', path?: string }) => void) => () => void;
          onCheckUnsavedChangesBeforeExit: (callback: () => void) => () => void;
          replyUnsavedChangesBeforeExit: (hasUnsaved: boolean) => void;
          onShowExitModal: (callback: () => void) => () => void;
          forceQuit: () => void;
          getAppSettings: () => Promise<Partial<AppSettings> | null>;
          saveAppSettings: (settings: AppSettings) => Promise<{ success: boolean; error?: string }>;
          selectRenpy: () => Promise<string | null>;
          runGame: (renpyPath: string, projectPath: string) => void;
          stopGame: () => void;
          checkRenpyPath: (path: string) => Promise<boolean>;
          onGameStarted: (callback: () => void) => () => void;
          onGameStopped: (callback: () => void) => () => void;
          onGameError: (callback: (error: string) => void) => () => void;
          onSaveIdeStateBeforeQuit: (callback: () => void) => () => void;
          ideStateSavedForQuit: () => void;
          path: {
              join: (...paths: string[]) => Promise<string>;
          };
          searchInProject: (options: { 
              projectPath: string; 
              query: string; 
              isCaseSensitive?: boolean; 
              isWholeWord?: boolean; 
              isRegex?: boolean; 
          }) => Promise<SearchResult[]>;
          showSaveDialog: (options: {
              title?: string;
              defaultPath?: string;
              buttonLabel?: string;
              filters?: { name: string; extensions: string[] }[];
          }) => Promise<string | null>;
          loadApiKeys: () => Promise<Record<string, string>>;
          saveApiKey: (provider: string, key: string) => Promise<{ success: boolean; error?: string }>;
          getApiKey: (provider: string) => Promise<string | null>;
          onUpdateAvailable?: (callback: (version: string) => void) => () => void;
          onUpdateNotAvailable?: (callback: () => void) => () => void;
          onUpdateError?: (callback: () => void) => () => void;
          onUpdateDownloaded?: (callback: (version: string) => void) => () => void;
          installUpdate?: () => void;
          openExternal?: (url: string) => Promise<void>;
      }
  }
}
