import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchPanel from './SearchPanel';
import type { SearchResult } from '../types';

// Mock the useSearch hook
const mockUseSearch = {
  searchQuery: '',
  setSearchQuery: vi.fn(),
  replaceQuery: '',
  setReplaceQuery: vi.fn(),
  searchOptions: { isCaseSensitive: false, isWholeWord: false, isRegex: false },
  setSearchOptions: vi.fn(),
  searchResults: [] as SearchResult[],
  executeSearch: vi.fn(),
  executeReplaceAll: vi.fn(),
  handleResultClick: vi.fn(),
  isSearching: false,
  activeLeftPanel: 'search' as const,
  setActiveLeftPanel: vi.fn(),
  findUsagesHighlightIds: null,
  setFindUsagesHighlightIds: vi.fn(),
  handleFindUsages: vi.fn(),
};

vi.mock('../contexts/SearchContext', () => ({
  useSearch: () => mockUseSearch,
}));

describe('SearchPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSearch.searchQuery = '';
    mockUseSearch.searchResults = [];
    mockUseSearch.isSearching = false;
    mockUseSearch.searchOptions = { isCaseSensitive: false, isWholeWord: false, isRegex: false };
  });

  it('renders search heading and input', () => {
    render(<SearchPanel />);
    expect(screen.getByText('Search')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search')).toBeInTheDocument();
    expect(screen.getByText('Find All')).toBeInTheDocument();
  });

  it('disables Find All button when query is empty', () => {
    render(<SearchPanel />);
    expect(screen.getByText('Find All')).toBeDisabled();
  });

  it('enables Find All button when query is non-empty', () => {
    mockUseSearch.searchQuery = 'hello';
    render(<SearchPanel />);
    expect(screen.getByText('Find All')).not.toBeDisabled();
  });

  it('calls executeSearch when Find All is clicked', async () => {
    mockUseSearch.searchQuery = 'hello';
    const user = userEvent.setup();
    render(<SearchPanel />);
    await user.click(screen.getByText('Find All'));
    expect(mockUseSearch.executeSearch).toHaveBeenCalledTimes(1);
  });

  it('calls executeSearch on Enter key in search input', async () => {
    mockUseSearch.searchQuery = 'hello';
    const user = userEvent.setup();
    render(<SearchPanel />);
    const input = screen.getByPlaceholderText('Search');
    await user.click(input);
    await user.keyboard('{Enter}');
    expect(mockUseSearch.executeSearch).toHaveBeenCalledTimes(1);
  });

  it('shows "Searching..." when isSearching is true', () => {
    mockUseSearch.isSearching = true;
    render(<SearchPanel />);
    expect(screen.getByText('Searching...')).toBeInTheDocument();
  });

  it('shows "No results found." when query exists but results are empty', () => {
    mockUseSearch.searchQuery = 'nonexistent';
    render(<SearchPanel />);
    expect(screen.getByText('No results found.')).toBeInTheDocument();
  });

  it('renders results with file paths and match counts', () => {
    mockUseSearch.searchResults = [
      {
        filePath: 'game/script.rpy',
        matches: [
          { lineNumber: 10, lineContent: '    jump start', startColumn: 10, endColumn: 15 },
          { lineNumber: 25, lineContent: '    jump end', startColumn: 10, endColumn: 13 },
        ],
      },
    ];
    render(<SearchPanel />);
    expect(screen.getByText('game/script.rpy')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('2 results in 1 file')).toBeInTheDocument();
  });

  it('renders result summary with correct pluralization', () => {
    mockUseSearch.searchResults = [
      {
        filePath: 'game/a.rpy',
        matches: [{ lineNumber: 1, lineContent: 'hello', startColumn: 1, endColumn: 6 }],
      },
    ];
    render(<SearchPanel />);
    expect(screen.getByText('1 result in 1 file')).toBeInTheDocument();
  });

  it('calls handleResultClick when a match is clicked', async () => {
    mockUseSearch.searchResults = [
      {
        filePath: 'game/script.rpy',
        matches: [
          { lineNumber: 10, lineContent: '    jump start', startColumn: 10, endColumn: 15 },
        ],
      },
    ];
    const user = userEvent.setup();
    render(<SearchPanel />);
    await user.click(screen.getByText('10:'));
    expect(mockUseSearch.handleResultClick).toHaveBeenCalledWith('game/script.rpy', 10);
  });

  it('renders search option buttons', () => {
    render(<SearchPanel />);
    expect(screen.getByTitle('Match Case (Alt+C)')).toBeInTheDocument();
    expect(screen.getByTitle('Match Whole Word (Alt+W)')).toBeInTheDocument();
    expect(screen.getByTitle('Use Regular Expression (Alt+R)')).toBeInTheDocument();
  });

  it('toggles case sensitivity option', async () => {
    const user = userEvent.setup();
    render(<SearchPanel />);
    await user.click(screen.getByTitle('Match Case (Alt+C)'));
    expect(mockUseSearch.setSearchOptions).toHaveBeenCalledWith({
      isCaseSensitive: true,
      isWholeWord: false,
      isRegex: false,
    });
  });
});
