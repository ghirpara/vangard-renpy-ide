import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Toolbar from './Toolbar';

// Mock the logo import — jsdom can't handle image imports
vi.mock('../vangard-renide-512x512.png', () => ({ default: 'logo.png' }));

describe('Toolbar', () => {
  const createProps = (overrides?: Partial<Parameters<typeof Toolbar>[0]>) => ({
    directoryHandle: null,
    projectRootPath: '/project',
    dirtyBlockIds: new Set<string>(),
    dirtyEditors: new Set<string>(),
    hasUnsavedSettings: false,
    saveStatus: 'saved' as const,
    canUndo: false,
    canRedo: false,
    undo: vi.fn(),
    redo: vi.fn(),
    addBlock: vi.fn(),
    handleTidyUp: vi.fn(),
    onRequestNewProject: vi.fn(),
    requestOpenFolder: vi.fn(),
    handleSave: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenStaticTab: vi.fn(),
    onAddStickyNote: vi.fn(),
    isGameRunning: false,
    onRunGame: vi.fn(),
    onStopGame: vi.fn(),
    renpyPath: '/path/to/renpy',
    isRenpyPathValid: true,
    draftingMode: false,
    onToggleDraftingMode: vi.fn(),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders key toolbar buttons', () => {
    render(<Toolbar {...createProps()} />);

    expect(screen.getByText('Add Block')).toBeInTheDocument();
    expect(screen.getByText('Add Note')).toBeInTheDocument();
    expect(screen.getByText('Tidy Up')).toBeInTheDocument();
    expect(screen.getByText('Run')).toBeInTheDocument();
  });

  it('disables undo button when canUndo is false', () => {
    render(<Toolbar {...createProps({ canUndo: false })} />);
    const undoBtn = screen.getByTitle('Undo (Ctrl+Z)');
    expect(undoBtn).toBeDisabled();
  });

  it('enables undo button when canUndo is true', () => {
    render(<Toolbar {...createProps({ canUndo: true })} />);
    const undoBtn = screen.getByTitle('Undo (Ctrl+Z)');
    expect(undoBtn).not.toBeDisabled();
  });

  it('disables redo button when canRedo is false', () => {
    render(<Toolbar {...createProps({ canRedo: false })} />);
    const redoBtn = screen.getByTitle('Redo (Ctrl+Y)');
    expect(redoBtn).toBeDisabled();
  });

  it('enables redo button when canRedo is true', () => {
    render(<Toolbar {...createProps({ canRedo: true })} />);
    const redoBtn = screen.getByTitle('Redo (Ctrl+Y)');
    expect(redoBtn).not.toBeDisabled();
  });

  it('calls undo when undo button is clicked', async () => {
    const props = createProps({ canUndo: true });
    const user = userEvent.setup();
    render(<Toolbar {...props} />);

    await user.click(screen.getByTitle('Undo (Ctrl+Z)'));
    expect(props.undo).toHaveBeenCalledTimes(1);
  });

  it('calls redo when redo button is clicked', async () => {
    const props = createProps({ canRedo: true });
    const user = userEvent.setup();
    render(<Toolbar {...props} />);

    await user.click(screen.getByTitle('Redo (Ctrl+Y)'));
    expect(props.redo).toHaveBeenCalledTimes(1);
  });

  it('shows save button as disabled when no unsaved changes', () => {
    render(<Toolbar {...createProps()} />);
    // Save button has a dynamic title that mentions "No changes to save"
    const saveBtn = screen.getByTitle('No changes to save');
    expect(saveBtn).toBeDisabled();
  });

  it('shows save button as enabled when there are unsaved changes', () => {
    render(<Toolbar {...createProps({ dirtyBlockIds: new Set(['block-1']) })} />);
    const saveBtn = screen.getByTitle(/Save All/);
    expect(saveBtn).not.toBeDisabled();
  });

  it('shows Stop button when game is running', () => {
    render(<Toolbar {...createProps({ isGameRunning: true })} />);
    expect(screen.getByText('Stop')).toBeInTheDocument();
    expect(screen.queryByText('Run')).not.toBeInTheDocument();
  });

  it('shows Run button when game is not running', () => {
    render(<Toolbar {...createProps({ isGameRunning: false })} />);
    expect(screen.getByText('Run')).toBeInTheDocument();
    expect(screen.queryByText('Stop')).not.toBeInTheDocument();
  });

  it('disables Run button when no project is open', () => {
    render(<Toolbar {...createProps({ projectRootPath: null })} />);
    const runBtn = screen.getByTitle('Run Project (F5)');
    expect(runBtn).toBeDisabled();
  });

  it('disables Run button when Ren\'Py path is invalid', () => {
    render(<Toolbar {...createProps({ isRenpyPathValid: false })} />);
    const runBtn = screen.getByTitle('Run Project (F5)');
    expect(runBtn).toBeDisabled();
  });

  it('toggles drafting mode when toggle is clicked', async () => {
    const props = createProps({ draftingMode: false });
    const user = userEvent.setup();
    render(<Toolbar {...props} />);

    // Find the drafting mode toggle button (it's next to the "Drafting Mode" text)
    const toggle = screen.getByTitle(/Drafting Mode/);
    await user.click(toggle);
    expect(props.onToggleDraftingMode).toHaveBeenCalledWith(true);
  });

  it('calls addBlock when Add Block is clicked', async () => {
    const props = createProps();
    const user = userEvent.setup();
    render(<Toolbar {...props} />);

    await user.click(screen.getByText('Add Block'));
    expect(props.addBlock).toHaveBeenCalledTimes(1);
  });
});
