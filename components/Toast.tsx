import React, { useEffect, useState } from 'react';
import type { ToastMessage } from '../types';

interface ToastProps {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => onDismiss(toast.id), 300); // Wait for animation
    }, 5000);

    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => onDismiss(toast.id), 300);
  };

  const typeClasses = {
    success: 'bg-green-100 border-green-500 text-green-700 dark:bg-green-900/50 dark:border-green-700 dark:text-green-300',
    error: 'bg-red-100 border-red-500 text-red-700 dark:bg-red-900/50 dark:border-red-700 dark:text-red-300',
    warning: 'bg-yellow-100 border-yellow-500 text-yellow-700 dark:bg-yellow-900/50 dark:border-yellow-700 dark:text-yellow-300',
    info: 'bg-blue-100 border-blue-500 text-blue-700 dark:bg-blue-900/50 dark:border-blue-700 dark:text-blue-300',
  };

  const Icon: React.FC = () => {
    switch (toast.type) {
      case 'success':
        return <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>;
      case 'error':
        return <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>;
      case 'warning':
        return <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM10 13a1 1 0 110-2 1 1 0 010 2zm-1-8a1 1 0 00-1 1v3a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>;
      case 'info':
        return <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>;
    }
  };
  
  return (
    <>
      <style>{`
        @keyframes toast-in {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes toast-out {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
        .toast-enter { animation: toast-in 0.3s ease-out forwards; }
        .toast-exit { animation: toast-out 0.3s ease-in forwards; }
      `}</style>
      <div className={`w-80 max-w-sm rounded-lg shadow-lg border-l-4 p-4 flex items-start space-x-3 ${typeClasses[toast.type]} ${isExiting ? 'toast-exit' : 'toast-enter'}`}>
        <div className="flex-shrink-0"><Icon /></div>
        <div className="flex-grow text-sm">{toast.message}</div>
        <button onClick={handleDismiss} aria-label="Dismiss notification" className="flex-shrink-0 -mr-1 -mt-1 p-1 rounded-full hover:bg-black/10">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
        </button>
      </div>
    </>
  );
};

export default Toast;
