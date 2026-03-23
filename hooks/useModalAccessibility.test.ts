import { renderHook, act } from '@testing-library/react';
import { useModalAccessibility } from './useModalAccessibility';

describe('useModalAccessibility', () => {
  it('returns correct modal props with titleId', () => {
    const { result } = renderHook(() =>
      useModalAccessibility({ isOpen: true, onClose: vi.fn(), titleId: 'test-title' })
    );

    expect(result.current.modalProps.role).toBe('dialog');
    expect(result.current.modalProps['aria-modal']).toBe(true);
    expect(result.current.modalProps['aria-labelledby']).toBe('test-title');
  });

  it('returns modal props without aria-labelledby when titleId is omitted', () => {
    const { result } = renderHook(() =>
      useModalAccessibility({ isOpen: true, onClose: vi.fn() })
    );

    expect(result.current.modalProps.role).toBe('dialog');
    expect(result.current.modalProps['aria-modal']).toBe(true);
    expect(result.current.modalProps['aria-labelledby']).toBeUndefined();
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    renderHook(() =>
      useModalAccessibility({ isOpen: true, onClose })
    );

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when Escape is pressed and modal is not open', () => {
    const onClose = vi.fn();
    renderHook(() =>
      useModalAccessibility({ isOpen: false, onClose })
    );

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('restores focus to previously focused element on close', () => {
    const previousButton = document.createElement('button');
    document.body.appendChild(previousButton);
    previousButton.focus();

    const onClose = vi.fn();
    const { unmount } = renderHook(() =>
      useModalAccessibility({ isOpen: true, onClose })
    );

    // Unmount simulates modal closing
    unmount();

    expect(document.activeElement).toBe(previousButton);
    document.body.removeChild(previousButton);
  });

  it('provides a contentRef', () => {
    const { result } = renderHook(() =>
      useModalAccessibility({ isOpen: true, onClose: vi.fn() })
    );

    expect(result.current.contentRef).toBeDefined();
    expect(result.current.contentRef.current).toBeNull(); // Not attached yet
  });
});
