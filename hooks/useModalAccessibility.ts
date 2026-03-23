import { useEffect, useRef, useCallback } from 'react';

interface UseModalAccessibilityOptions {
  isOpen: boolean;
  onClose: () => void;
  titleId?: string;
}

interface ModalProps {
  role: 'dialog';
  'aria-modal': true;
  'aria-labelledby'?: string;
}

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function useModalAccessibility({ isOpen, onClose, titleId }: UseModalAccessibilityOptions) {
  const contentRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  // Store onClose in a ref to avoid re-running effects when callback identity changes
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    // Save previously focused element for restoration
    previousFocusRef.current = document.activeElement;

    // Auto-focus first focusable element inside the modal
    const timer = setTimeout(() => {
      if (contentRef.current) {
        const firstFocusable = contentRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        if (firstFocusable) {
          firstFocusable.focus();
        }
      }
    }, 0);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      // Focus trap
      if (e.key === 'Tab' && contentRef.current) {
        const focusableElements = Array.from(
          contentRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter(el => !el.hasAttribute('disabled'));

        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown, true);

      // Restore focus to previously focused element
      if (previousFocusRef.current && previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen]);

  const modalProps: ModalProps = {
    role: 'dialog',
    'aria-modal': true,
    ...(titleId && { 'aria-labelledby': titleId }),
  };

  return { modalProps, contentRef };
}
