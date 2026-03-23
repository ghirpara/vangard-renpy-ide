import React from 'react';
import { useModalAccessibility } from '../hooks/useModalAccessibility';

interface ConfirmModalProps {
  title: string;
  children: React.ReactNode;
  onConfirm: () => void;
  onClose: () => void;
  confirmText?: string;
  confirmClassName?: string;
  /**
   * Optional secondary action to render between Cancel and Confirm.
   * Useful for dialogs that need an extra choice (e.g. "Don't Save").
   */
  secondaryAction?: {
    onClick: () => void;
    label: string;
    className?: string;
  };
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({ 
  title, 
  children, 
  onConfirm, 
  onClose, 
  confirmText = 'Confirm',
  confirmClassName = 'bg-red-600 hover:bg-red-700',
  secondaryAction
}) => {
  const { modalProps, contentRef } = useModalAccessibility({ isOpen: true, onClose, titleId: 'confirm-modal-title' });

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
      onClick={onClose}
      {...modalProps}
    >
      <div
        ref={contentRef}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-md m-4 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 id="confirm-modal-title" className="text-xl font-bold">{title}</h2>
        </header>
        <main className="p-6">
          <p className="text-gray-600 dark:text-gray-300">
            {children}
          </p>
        </main>
        <footer className="bg-gray-50 dark:bg-gray-700 p-4 rounded-b-lg flex justify-end items-center space-x-4">
          <button
            onClick={onClose}
            className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-200 font-bold py-2 px-4 rounded transition duration-200"
          >
            Cancel
          </button>
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className={`${secondaryAction.className || 'bg-gray-300 hover:bg-gray-400'} text-white font-bold py-2 px-4 rounded transition duration-200`}
            >
              {secondaryAction.label}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`${confirmClassName} text-white font-bold py-2 px-4 rounded transition duration-200`}
          >
            {confirmText}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default ConfirmModal;