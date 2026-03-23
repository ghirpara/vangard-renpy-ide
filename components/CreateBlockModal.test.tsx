import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateBlockModal from './CreateBlockModal';

describe('CreateBlockModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    defaultPath: 'game/scenes',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<CreateBlockModal {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the modal with title and form when open', () => {
    render(<CreateBlockModal {...defaultProps} />);

    expect(screen.getByText('Add New Block')).toBeInTheDocument();
    expect(screen.getByText('Story')).toBeInTheDocument();
    expect(screen.getByText('Screen')).toBeInTheDocument();
    expect(screen.getByText('Config')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Create Block')).toBeInTheDocument();
  });

  it('shows the default path', () => {
    render(<CreateBlockModal {...defaultProps} />);
    expect(screen.getByText('game/scenes')).toBeInTheDocument();
  });

  it('shows error when trying to confirm with empty name', async () => {
    const user = userEvent.setup();
    render(<CreateBlockModal {...defaultProps} />);

    await user.click(screen.getByText('Create Block'));
    expect(screen.getByText('Filename cannot be empty.')).toBeInTheDocument();
    expect(defaultProps.onConfirm).not.toHaveBeenCalled();
  });

  it('shows error for invalid filename characters', async () => {
    const user = userEvent.setup();
    render(<CreateBlockModal {...defaultProps} />);

    const input = screen.getByPlaceholderText('chapter_1');
    await user.type(input, 'invalid-name!');
    await user.click(screen.getByText('Create Block'));

    expect(screen.getByText('Filename should only contain letters, numbers, and underscores.')).toBeInTheDocument();
    expect(defaultProps.onConfirm).not.toHaveBeenCalled();
  });

  it('calls onConfirm with name and type on valid submission', async () => {
    const user = userEvent.setup();
    render(<CreateBlockModal {...defaultProps} />);

    const input = screen.getByPlaceholderText('chapter_1');
    await user.type(input, 'my_scene');
    await user.click(screen.getByText('Create Block'));

    expect(defaultProps.onConfirm).toHaveBeenCalledWith('my_scene', 'story');
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('allows selecting screen type', async () => {
    const user = userEvent.setup();
    render(<CreateBlockModal {...defaultProps} />);

    await user.click(screen.getByText('Screen'));
    const input = screen.getByPlaceholderText('inventory_screen');
    await user.type(input, 'menu_screen');
    await user.click(screen.getByText('Create Block'));

    expect(defaultProps.onConfirm).toHaveBeenCalledWith('menu_screen', 'screen');
  });

  it('allows selecting config type', async () => {
    const user = userEvent.setup();
    render(<CreateBlockModal {...defaultProps} />);

    await user.click(screen.getByText('Config'));
    const input = screen.getByPlaceholderText('custom_config');
    await user.type(input, 'game_options');
    await user.click(screen.getByText('Create Block'));

    expect(defaultProps.onConfirm).toHaveBeenCalledWith('game_options', 'config');
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<CreateBlockModal {...defaultProps} />);

    await user.click(screen.getByText('Cancel'));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('submits on Enter key', async () => {
    const user = userEvent.setup();
    render(<CreateBlockModal {...defaultProps} />);

    const input = screen.getByPlaceholderText('chapter_1');
    await user.type(input, 'my_block');
    await user.keyboard('{Enter}');

    expect(defaultProps.onConfirm).toHaveBeenCalledWith('my_block', 'story');
  });

  it('closes on Escape key', async () => {
    const user = userEvent.setup();
    render(<CreateBlockModal {...defaultProps} />);

    const input = screen.getByPlaceholderText('chapter_1');
    await user.click(input);
    await user.keyboard('{Escape}');

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('shows code preview for story type', () => {
    render(<CreateBlockModal {...defaultProps} />);
    // The preview shows a template with label keyword
    expect(screen.getByText(/label.*:/, { exact: false })).toBeInTheDocument();
  });
});
