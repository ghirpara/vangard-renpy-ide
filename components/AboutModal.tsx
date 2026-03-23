
import React from 'react';
import { useModalAccessibility } from '../hooks/useModalAccessibility';
import packageJson from '../package.json';
const BUILD_NUMBER = process.env.BUILD_NUMBER || 'dev';
import logo from '../vangard-renide-512x512.png';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  const { modalProps, contentRef } = useModalAccessibility({ isOpen, onClose, titleId: 'about-modal-title' });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[100]" onClick={onClose} {...modalProps}>
      <div
        ref={contentRef}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-md m-4 flex flex-col border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-8 flex flex-col items-center text-center">
            <img src={logo} alt="Vangard Ren'IDE Logo" className="w-32 h-32 mb-4 object-contain drop-shadow-md" />
            <h2 id="about-modal-title" className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Ren'IDE</h2>
            <p className="text-indigo-600 dark:text-indigo-400 font-mono text-sm mb-6">v{packageJson.version} (build {BUILD_NUMBER})</p>
            
            <p className="text-gray-600 dark:text-gray-300 text-sm mb-4 leading-relaxed">
                A powerful visual environment for creating Ren'Py visual novels. 
                Design flows, write scripts, and manage assets all in one place.
            </p>
            
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-4">
                <p>&copy; {new Date().getFullYear()} Blue Moon Foundry. All rights reserved.</p>
                <p className="mt-1">Built with Electron, React, and AI assistance — build {BUILD_NUMBER}</p>
            </div>
        </div>
        <footer className="bg-gray-50 dark:bg-gray-700/50 p-4 flex justify-center gap-3 border-t border-gray-200 dark:border-gray-700">
            <button
                onClick={() => window.electronAPI?.openExternal?.('https://github.com/bluemoonfoundry/vangard-renpy-ide/wiki')}
                className="px-6 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-100 text-sm font-bold rounded transition-colors shadow-sm"
            >
                Documentation
            </button>
            <button
                onClick={onClose}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded transition-colors shadow-sm"
            >
                Close
            </button>
        </footer>
      </div>
    </div>
  );
};

export default AboutModal;