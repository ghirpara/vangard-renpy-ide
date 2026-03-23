import React, { useState, useEffect, useRef } from 'react';
import { useModalAccessibility } from '../hooks/useModalAccessibility';
import type { UserSnippet } from '../types';

interface UserSnippetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (snippet: UserSnippet) => void;
  existingSnippet?: UserSnippet | null;
}

function generateId() {
  return `snippet-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const UserSnippetModal: React.FC<UserSnippetModalProps> = ({ isOpen, onClose, onSave, existingSnippet }) => {
  const [title, setTitle] = useState('');
  const [prefix, setPrefix] = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [usePlaceholders, setUsePlaceholders] = useState(false);
  const [error, setError] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const { modalProps, contentRef } = useModalAccessibility({ isOpen, onClose, titleId: 'snippet-modal-title' });

  useEffect(() => {
    if (isOpen) {
      if (existingSnippet) {
        setTitle(existingSnippet.title);
        setPrefix(existingSnippet.prefix);
        setDescription(existingSnippet.description);
        setCode(existingSnippet.monacoBody || existingSnippet.code);
        setUsePlaceholders(!!existingSnippet.monacoBody);
      } else {
        setTitle('');
        setPrefix('');
        setDescription('');
        setCode('');
        setUsePlaceholders(false);
      }
      setError('');
      setTimeout(() => titleInputRef.current?.focus(), 50);
    }
  }, [isOpen, existingSnippet]);

  const handleSave = () => {
    const trimmedTitle = title.trim();
    const trimmedPrefix = prefix.trim();
    const trimmedCode = code.trim();

    if (!trimmedTitle) { setError('Title is required.'); return; }
    if (!trimmedPrefix) { setError('Prefix is required.'); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmedPrefix)) { setError('Prefix should only contain letters, numbers, and underscores.'); return; }
    if (!trimmedCode) { setError('Code is required.'); return; }

    onSave({
      id: existingSnippet?.id || generateId(),
      title: trimmedTitle,
      prefix: trimmedPrefix,
      description: description.trim(),
      code: usePlaceholders ? trimmedCode.replace(/\$\{?\d+[^}]*\}?/g, '') : trimmedCode,
      monacoBody: usePlaceholders ? trimmedCode : undefined,
    });
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
      handleSave();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" {...modalProps}>
      <div
        ref={contentRef}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-lg m-4 flex flex-col border border-gray-200 dark:border-gray-700"
        onClick={e => e.stopPropagation()}
      >
        <header className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 id="snippet-modal-title" className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {existingSnippet ? 'Edit Snippet' : 'New Snippet'}
          </h2>
        </header>

        <main className="p-6 space-y-4" onKeyDown={handleKeyDown}>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="My Custom Snippet"
              className="w-full p-2 rounded bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Prefix <span className="text-xs text-gray-400">(trigger word for autocomplete)</span>
            </label>
            <input
              type="text"
              value={prefix}
              onChange={e => setPrefix(e.target.value)}
              placeholder="mysnippet"
              className="w-full p-2 rounded bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description <span className="text-xs text-gray-400">(optional)</span></label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="A brief description of what this snippet does"
              className="w-full p-2 rounded bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Code</label>
            <textarea
              value={code}
              onChange={e => setCode(e.target.value)}
              rows={6}
              placeholder={'e "Hello, world!"'}
              className="w-full p-2 rounded bg-gray-800 text-white border border-gray-600 focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm whitespace-pre"
            />
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="use-placeholders"
              checked={usePlaceholders}
              onChange={e => setUsePlaceholders(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="use-placeholders" className="text-sm text-gray-600 dark:text-gray-300">
              Use tab-stop placeholders (<code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">$1</code>, <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">$2</code>, <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">$0</code>)
            </label>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </main>

        <footer className="bg-gray-50 dark:bg-gray-700 p-4 rounded-b-lg flex justify-end items-center space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded shadow-sm"
          >
            {existingSnippet ? 'Save Changes' : 'Create Snippet'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default UserSnippetModal;
