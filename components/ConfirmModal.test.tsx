import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmModal from './ConfirmModal';

describe('ConfirmModal', () => {
  const defaultProps = {
    title: 'Delete File',
    onConfirm: vi.fn(),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title, children, and default button labels', () => {
    render(
      <ConfirmModal {...defaultProps}>
        Are you sure you want to delete this file?
      </ConfirmModal>
    );

    expect(screen.getByText('Delete File')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete this file?')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Confirm')).toBeInTheDocument();
  });

  it('renders custom confirm text', () => {
    render(
      <ConfirmModal {...defaultProps} confirmText="Delete Forever">
        content
      </ConfirmModal>
    );

    expect(screen.getByText('Delete Forever')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', async () => {
    const user = userEvent.setup();
    render(<ConfirmModal {...defaultProps}>content</ConfirmModal>);

    await user.click(screen.getByText('Confirm'));
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when cancel button is clicked', async () => {
    const user = userEvent.setup();
    render(<ConfirmModal {...defaultProps}>content</ConfirmModal>);

    await user.click(screen.getByText('Cancel'));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(<ConfirmModal {...defaultProps}>content</ConfirmModal>);

    // The backdrop is the outermost div with aria-modal
    const backdrop = container.querySelector('[aria-modal="true"]')!;
    await user.click(backdrop);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when clicking inside modal content', async () => {
    const user = userEvent.setup();
    render(<ConfirmModal {...defaultProps}>content</ConfirmModal>);

    await user.click(screen.getByText('Delete File'));
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it('renders secondary action when provided', async () => {
    const secondaryAction = {
      onClick: vi.fn(),
      label: "Don't Save",
    };
    const user = userEvent.setup();
    render(
      <ConfirmModal {...defaultProps} secondaryAction={secondaryAction}>
        content
      </ConfirmModal>
    );

    const btn = screen.getByText("Don't Save");
    expect(btn).toBeInTheDocument();

    await user.click(btn);
    expect(secondaryAction.onClick).toHaveBeenCalledTimes(1);
  });

  it('has correct accessibility attributes', () => {
    const { container } = render(<ConfirmModal {...defaultProps}>content</ConfirmModal>);

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});
