
import React from 'react';

interface StatusBarProps {
  totalWords: number;
  currentFileWords: number | null;
  readingTime: string;
  statusMessage?: string;
  version?: string;
  build?: string;
  cursorPosition?: { line: number; column: number } | null;
}

const StatusBar: React.FC<StatusBarProps> = ({ totalWords, currentFileWords, readingTime, statusMessage, version, build, cursorPosition }) => {
  return (
    <footer className="flex-none h-6 bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 text-xs text-gray-600 dark:text-gray-400 z-20 transition-colors duration-200">
      <div className="flex items-center space-x-2 overflow-hidden mr-4">
        {statusMessage && (
            <span className="font-medium text-indigo-600 dark:text-indigo-400 animate-pulse truncate max-w-md">
                {statusMessage}
            </span>
        )}
      </div>
      <div className="flex items-center space-x-4 flex-shrink-0">
        {cursorPosition && (
            <>
                <span title="Cursor position" className="font-mono">Ln {cursorPosition.line}, Col {cursorPosition.column}</span>
                <div className="w-px h-3 bg-gray-300 dark:bg-gray-600"></div>
            </>
        )}
        {currentFileWords !== null && (
            <span title="Words in current editor tab">
            Current File: {currentFileWords.toLocaleString()} words
            </span>
        )}
        {currentFileWords !== null && <div className="w-px h-3 bg-gray-300 dark:bg-gray-600"></div>}
        <span title="Total words in all .rpy files">
            Total Project: {totalWords.toLocaleString()} words
        </span>
        <div className="w-px h-3 bg-gray-300 dark:bg-gray-600"></div>
        <span title="Estimated based on an average reading speed of 200 WPM">
            {readingTime}
        </span>
        {(version || build) && (
            <>
                <div className="w-px h-3 bg-gray-300 dark:bg-gray-600"></div>
                <span title={`Version ${version}, Build ${build}`} className="text-gray-400 dark:text-gray-500 font-mono">
                    v{version || '0.0.0'} ({build || '0'})
                </span>
            </>
        )}
      </div>
    </footer>
  );
};

export default StatusBar;