import React, { useState } from 'react';
import { useModalAccessibility } from '../hooks/useModalAccessibility';

interface ConfigureRenpyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (path: string) => void;
}

const ConfigureRenpyModal: React.FC<ConfigureRenpyModalProps> = ({ isOpen, onClose, onSave }) => {
  const [selectedPath, setSelectedPath] = useState('');
  const [error, setError] = useState('');
  const { modalProps, contentRef } = useModalAccessibility({ isOpen, onClose, titleId: 'configure-renpy-title' });

  if (!isOpen) {
    return null;
  }

  const handleBrowse = async () => {
    if (window.electronAPI) {
        const path = await window.electronAPI.selectRenpy();
        if (path) {
            const fileName = path.split(/[/\\]/).pop();
            if (fileName === 'renpy.exe' || fileName === 'renpy.sh') {
                setSelectedPath(path);
                setError('');
            } else {
                setError('Invalid selection. Please choose renpy.exe (Windows) or renpy.sh (macOS/Linux).');
            }
        }
    }
  };

  const handleSave = () => {
    if (selectedPath) {
        onSave(selectedPath);
    } else {
        setError('Please select a path before saving.');
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
      onClick={onClose}
      {...modalProps}
    >
      <div
        ref={contentRef}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-lg m-4 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 id="configure-renpy-title" className="text-xl font-bold">Configure Ren'Py Launcher</h2>
        </header>
        <main className="p-6 space-y-4">
          <p className="text-gray-600 dark:text-gray-300">
            To launch your game, the editor needs to know where your Ren'Py installation is located. This is a one-time setup.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Ren'Py Launcher Path
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                readOnly
                value={selectedPath || 'Not set'}
                className="w-full mt-1 p-2 rounded bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 font-mono text-xs"
              />
              <button 
                onClick={handleBrowse}
                className="mt-1 px-4 py-2 rounded bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-sm font-bold"
              >
                Browse...
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Please select the `renpy.exe` (Windows) or `renpy.sh` (macOS/Linux) file.
            </p>
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          </div>
        </main>
        <footer className="bg-gray-50 dark:bg-gray-700 p-4 rounded-b-lg flex justify-end items-center space-x-4">
          <button
            onClick={onClose}
            className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-200 font-bold py-2 px-4 rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!selectedPath}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save and Run
          </button>
        </footer>
      </div>
    </div>
  );
};

export default ConfigureRenpyModal;
