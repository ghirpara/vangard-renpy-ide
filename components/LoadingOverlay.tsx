import React, { useState } from 'react';

interface LoadingOverlayProps {
  progress: number;
  message: string;
  onCancel?: () => void;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ progress, message, onCancel }) => {
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = () => {
    setCancelling(true);
    onCancel?.();
  };

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-[100] backdrop-blur-sm transition-opacity duration-300">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-8 max-w-lg w-full text-center border border-gray-200 dark:border-gray-700">
        {cancelling ? (
          <>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Cancelling...</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">Stopping file scan, please wait.</p>
            <div className="flex justify-center">
              <svg className="animate-spin h-8 w-8 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Loading Project...</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6 h-6 truncate" title={message}>
              {message}
            </p>
            <div className="w-full bg-gray-200 rounded-full h-4 dark:bg-gray-700">
              <div
                className="bg-indigo-600 h-4 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="text-lg font-semibold mt-4 text-gray-800 dark:text-gray-200">{Math.round(progress)}%</p>
            {onCancel && (
              <button
                onClick={handleCancel}
                className="mt-6 px-5 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default LoadingOverlay;
