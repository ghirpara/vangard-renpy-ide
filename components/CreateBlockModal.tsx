
import React, { useState, useEffect, useRef } from 'react';
import { useModalAccessibility } from '../hooks/useModalAccessibility';

export type BlockType = 'story' | 'screen' | 'config';

interface CreateBlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string, type: BlockType) => void;
  defaultPath: string;
}

const CreateBlockModal: React.FC<CreateBlockModalProps> = ({ isOpen, onClose, onConfirm, defaultPath }) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<BlockType>('story');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { modalProps, contentRef } = useModalAccessibility({ isOpen, onClose, titleId: 'create-block-title' });

  useEffect(() => {
    if (isOpen) {
        setName('');
        setType('story');
        setError('');
        // Small timeout to allow render
        setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleConfirm = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
        setError('Filename cannot be empty.');
        return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmedName)) {
        setError('Filename should only contain letters, numbers, and underscores.');
        return;
    }
    
    onConfirm(trimmedName, type);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleConfirm();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" {...modalProps}>
      <div
        ref={contentRef}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-md m-4 flex flex-col border border-gray-200 dark:border-gray-700"
        onClick={e => e.stopPropagation()}
      >
        <header className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 id="create-block-title" className="text-xl font-bold text-gray-900 dark:text-gray-100">Add New Block</h2>
        </header>
        
        <main className="p-6 space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Block Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                    <button 
                        onClick={() => setType('story')}
                        className={`p-2 text-sm font-medium rounded border ${type === 'story' ? 'bg-indigo-100 dark:bg-indigo-900 border-indigo-500 text-indigo-700 dark:text-indigo-300' : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                    >
                        Story
                    </button>
                    <button 
                        onClick={() => setType('screen')}
                        className={`p-2 text-sm font-medium rounded border ${type === 'screen' ? 'bg-teal-100 dark:bg-teal-900 border-teal-500 text-teal-700 dark:text-teal-300' : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                    >
                        Screen
                    </button>
                    <button 
                        onClick={() => setType('config')}
                        className={`p-2 text-sm font-medium rounded border ${type === 'config' ? 'bg-red-100 dark:bg-red-900 border-red-500 text-red-700 dark:text-red-300' : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                    >
                        Config
                    </button>
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Name (without .rpy)
                </label>
                <input
                    ref={inputRef}
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={type === 'story' ? 'chapter_1' : type === 'screen' ? 'inventory_screen' : 'custom_config'}
                    className={`w-full p-2 rounded bg-white dark:bg-gray-900 border ${error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} focus:ring-2 focus:ring-indigo-500 outline-none`}
                />
                {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
            </div>

            <div className="text-xs text-gray-500 dark:text-gray-400">
                Creating in: <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">{defaultPath}</span>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded text-xs text-gray-600 dark:text-gray-400 font-mono">
                {type === 'story' && `label ${name || 'name'}:\n    "Write your story here..."\n    return`}
                {type === 'screen' && `screen ${name || 'name'}():\n    frame:\n        text "New Screen"`}
                {type === 'config' && `# Configuration definitions\ndefine ${name || 'name'}_enabled = True`}
            </div>
        </main>

        <footer className="bg-gray-50 dark:bg-gray-700 p-4 rounded-b-lg flex justify-end items-center space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded shadow-sm"
          >
            Create Block
          </button>
        </footer>
      </div>
    </div>
  );
};

export default CreateBlockModal;
