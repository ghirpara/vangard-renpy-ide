/**
 * @file SearchContext.tsx
 * @description React Context for project-wide search and replace functionality.
 * Extracts search state from App.tsx to reduce prop drilling to SearchPanel
 * and provide search functionality to other components (e.g., find usages).
 */

import React, { createContext, useState, useCallback, useContext, useMemo } from 'react';
import { useImmer } from 'use-immer';
import type { SearchResult, Block, RenpyAnalysisResult } from '../types';

interface SearchOptions {
  isCaseSensitive: boolean;
  isWholeWord: boolean;
  isRegex: boolean;
}

interface SearchContextType {
  // Search state
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  replaceQuery: string;
  setReplaceQuery: (r: string) => void;
  searchOptions: SearchOptions;
  setSearchOptions: (options: SearchOptions) => void;
  searchResults: SearchResult[];
  isSearching: boolean;

  // Actions
  executeSearch: () => Promise<void>;
  executeReplaceAll: () => void;
  handleResultClick: (filePath: string, lineNumber: number) => void;
}

const SearchContext = createContext<SearchContextType>({
  searchQuery: '',
  setSearchQuery: () => {},
  replaceQuery: '',
  setReplaceQuery: () => {},
  searchOptions: { isCaseSensitive: false, isWholeWord: false, isRegex: false },
  setSearchOptions: () => {},
  searchResults: [],
  isSearching: false,
  executeSearch: async () => {},
  executeReplaceAll: () => {},
  handleResultClick: () => {},
});

export const useSearch = () => useContext(SearchContext);

interface SearchProviderProps {
  children: React.ReactNode;
  blocks: Block[];
  projectRootPath: string | null;
  addToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  onOpenEditor: (blockId: string, line?: number) => void;
}

export const SearchProvider: React.FC<SearchProviderProps> = ({
  children,
  blocks,
  projectRootPath,
  addToast,
  onOpenEditor,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [searchOptions, setSearchOptions] = useImmer<SearchOptions>({
    isCaseSensitive: false,
    isWholeWord: false,
    isRegex: false,
  });
  const [searchResults, setSearchResults] = useImmer<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const executeSearch = useCallback(async () => {
    if (window.electronAPI && projectRootPath) {
      setIsSearching(true);
      try {
        const results = await window.electronAPI.searchInProject({
          projectPath: projectRootPath,
          query: searchQuery,
          ...searchOptions,
        });
        setSearchResults(results);
      } catch (err) {
        console.error('Search failed:', err);
        addToast('Search failed', 'error');
      } finally {
        setIsSearching(false);
      }
    }
  }, [projectRootPath, searchQuery, searchOptions, addToast, setSearchResults]);

  const executeReplaceAll = useCallback(() => {
    // Placeholder for replace all implementation
  }, []);

  const handleResultClick = useCallback((filePath: string, lineNumber: number) => {
    const block = blocks.find(b => b.filePath === filePath);
    if (block) onOpenEditor(block.id, lineNumber);
  }, [blocks, onOpenEditor]);

  const value = useMemo(() => ({
    searchQuery,
    setSearchQuery,
    replaceQuery,
    setReplaceQuery,
    searchOptions,
    setSearchOptions,
    searchResults,
    isSearching,
    executeSearch,
    executeReplaceAll,
    handleResultClick,
  }), [searchQuery, replaceQuery, searchOptions, searchResults, isSearching, executeSearch, executeReplaceAll, handleResultClick, setSearchOptions, setSearchResults]);

  return (
    <SearchContext.Provider value={value}>
      {children}
    </SearchContext.Provider>
  );
};
