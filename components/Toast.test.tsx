import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Toast from './Toast';
import type { ToastMessage } from '../types';

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createToast = (overrides?: Partial<ToastMessage>): ToastMessage => ({
    id: 'toast-1',
    message: 'Operation completed',
    type: 'success',
    ...overrides,
  });

  it('renders message text', () => {
    render(<Toast toast={createToast()} onDismiss={vi.fn()} />);
    expect(screen.getByText('Operation completed')).toBeInTheDocument();
  });

  it.each(['success', 'error', 'warning', 'info'] as const)(
    'renders with %s type styling',
    (type) => {
      const { container } = render(
        <Toast toast={createToast({ type })} onDismiss={vi.fn()} />
      );
      // Each type has a distinctive border color class
      const toastEl = container.querySelector('.border-l-4');
      expect(toastEl).toBeInTheDocument();
    }
  );

  it('auto-dismisses after timeout', () => {
    const onDismiss = vi.fn();
    render(<Toast toast={createToast()} onDismiss={onDismiss} />);

    // Advance past the 5-second display timer
    act(() => { vi.advanceTimersByTime(5000); });
    // Advance past the 300ms exit animation
    act(() => { vi.advanceTimersByTime(300); });

    expect(onDismiss).toHaveBeenCalledWith('toast-1');
  });

  it('calls onDismiss when close button is clicked', () => {
    const onDismiss = vi.fn();
    render(<Toast toast={createToast()} onDismiss={onDismiss} />);

    // The close button is a button inside the toast
    const buttons = screen.getAllByRole('button');
    act(() => { buttons[0].click(); });

    // Wait for exit animation
    act(() => { vi.advanceTimersByTime(300); });

    expect(onDismiss).toHaveBeenCalledWith('toast-1');
  });

  it('does not auto-dismiss before timeout', () => {
    const onDismiss = vi.fn();
    render(<Toast toast={createToast()} onDismiss={onDismiss} />);

    act(() => { vi.advanceTimersByTime(3000); });
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
