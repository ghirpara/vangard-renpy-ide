/**
 * @file SearchPanel.tsx
 * @description Full-text search interface (179 lines).
 * Search dialog with options for case sensitivity, whole word, and regex patterns.
 * Displays results grouped by file with line numbers and context.
 * Integrates with Electron API for project-wide file searching.
 * Supports replacing all occurrences of search term.
 */


import React, { useState, useMemo } from 'react';
import { useSearch } from '../contexts/SearchContext';

const SearchOptionButton: React.FC<{ title: string; isActive: boolean; onClick: () => void; children: React.ReactNode }> = ({ title, isActive, onClick, children }) => (
    <button
        title={title}
        onClick={onClick}
        className={`p-1.5 rounded ${isActive ? 'bg-indigo-200 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-300' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
    >
        {children}
    </button>
);

const SearchPanel: React.FC = () => {
    const search = useSearch();
    const { searchQuery: query, setSearchQuery: setQuery,
        replaceQuery: replace, setReplaceQuery: setReplace,
        searchOptions: options, setSearchOptions: setOptions,
        searchResults: results,
        executeSearch: onSearch, executeReplaceAll: onReplaceAll,
        handleResultClick: onResultClick,
        isSearching,
    } = search;
    const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
    const [showReplace, setShowReplace] = useState(false);

    const totalMatches = useMemo(() => {
        return results.reduce((sum, file) => sum + file.matches.length, 0);
    }, [results]);

    const toggleExpandFile = (filePath: string) => {
        setExpandedFiles(prev => {
            const next = new Set(prev);
            if (next.has(filePath)) {
                next.delete(filePath);
            } else {
                next.add(filePath);
            }
            return next;
        });
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            onSearch();
        }
    };
    
    // Auto-expand all results when a new search is performed
    React.useEffect(() => {
      if (results.length > 0) {
        setExpandedFiles(new Set(results.map(r => r.filePath)));
      }
    }, [results]);

    const HighlightedLine: React.FC<{ line: string, start: number, end: number }> = ({ line, start, end }) => {
        const prefix = line.substring(0, start - 1);
        const match = line.substring(start - 1, end - 1);
        const suffix = line.substring(end - 1);
        return (
            <p className="truncate">
                <span className="opacity-70">{prefix}</span>
                <span className="bg-yellow-200 dark:bg-yellow-700/50 rounded-sm">{match}</span>
                <span className="opacity-70">{suffix}</span>
            </p>
        );
    };

    return (
        <aside className="w-full h-full bg-white dark:bg-gray-800 flex flex-col z-10">
            <div className="flex-none p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-xl font-bold">Search</h2>
            </div>
            <div className="flex-none p-2 space-y-2 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center space-x-1">
                    <button onClick={() => setShowReplace(!showReplace)} className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${showReplace ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                    </button>
                    <div className="flex-grow space-y-1">
                        <div className="flex items-center space-x-2">
                            <input
                                type="text"
                                placeholder="Search"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={handleSearchKeyDown}
                                className="w-full px-2 py-1 text-sm rounded bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                            <button 
                                onClick={onSearch} 
                                disabled={isSearching || !query}
                                className="px-3 py-1 text-sm font-semibold rounded bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50"
                            >
                                Find All
                            </button>
                        </div>
                        {showReplace && (
                            <div className="flex items-center space-x-2">
                                <input
                                    type="text"
                                    placeholder="Replace"
                                    value={replace}
                                    onChange={(e) => setReplace(e.target.value)}
                                    className="w-full px-2 py-1 text-sm rounded bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
                                />
                                <button
                                    onClick={onReplaceAll}
                                    disabled={!query || totalMatches === 0}
                                    title="Replace All"
                                    className="px-3 py-1 text-sm font-semibold rounded bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50"
                                >
                                    Replace All
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                 <div className="flex items-center justify-start ml-6">
                    <div className="flex items-center space-x-1">
                        <SearchOptionButton title="Match Case (Alt+C)" isActive={options.isCaseSensitive} onClick={() => setOptions({ ...options, isCaseSensitive: !options.isCaseSensitive })}>
                            <span className="text-xs font-mono">Aa</span>
                        </SearchOptionButton>
                        <SearchOptionButton title="Match Whole Word (Alt+W)" isActive={options.isWholeWord} onClick={() => setOptions({ ...options, isWholeWord: !options.isWholeWord })}>
                             <span className="text-xs font-mono">ab|</span>
                        </SearchOptionButton>
                        <SearchOptionButton title="Use Regular Expression (Alt+R)" isActive={options.isRegex} onClick={() => setOptions({ ...options, isRegex: !options.isRegex })}>
                             <span className="text-xs font-mono">.*</span>
                        </SearchOptionButton>
                    </div>
                </div>
            </div>
            <div className="flex-1 min-h-0 p-2 overflow-y-auto overscroll-contain">
                 {isSearching && <p className="text-sm text-gray-500 dark:text-gray-400 px-2">Searching...</p>}
                 {!isSearching && results.length > 0 && (
                     <p className="text-xs text-gray-500 dark:text-gray-400 px-2 pb-2">
                        {totalMatches} result{totalMatches !== 1 ? 's' : ''} in {results.length} file{results.length !== 1 ? 's' : ''}
                     </p>
                 )}
                {results.map(fileResult => (
                    <div key={fileResult.filePath}>
                        <button onClick={() => toggleExpandFile(fileResult.filePath)} className="w-full flex items-center text-left py-1 px-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 mr-1 transition-transform ${expandedFiles.has(fileResult.filePath) ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                            <span className="font-semibold text-sm truncate">{fileResult.filePath}</span>
                            <span className="ml-2 text-xs text-gray-400 bg-gray-200 dark:bg-gray-600 rounded-full px-1.5">{fileResult.matches.length}</span>
                        </button>
                        {expandedFiles.has(fileResult.filePath) && (
                            <div className="pl-4">
                                {fileResult.matches.map((match, i) => (
                                    <div
                                        key={`${fileResult.filePath}-${match.lineNumber}-${i}`}
                                        onClick={() => onResultClick(fileResult.filePath, match.lineNumber)}
                                        className="flex items-start text-sm py-0.5 px-2 rounded cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
                                    >
                                        <span className="w-12 text-right text-gray-400 dark:text-gray-500 pr-2 flex-shrink-0">{match.lineNumber}:</span>
                                        <div className="font-mono text-xs flex-grow min-w-0">
                                            <HighlightedLine line={match.lineContent} start={match.startColumn} end={match.endColumn} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
                {!isSearching && query && results.length === 0 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 px-2">No results found.</p>
                )}
            </div>
        </aside>
    );
};

export default SearchPanel;