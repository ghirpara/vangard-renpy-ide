import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import UserSnippetModal from './UserSnippetModal';
import type { UserSnippet } from '../types';

describe('UserSnippetModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSave: vi.fn(),
    existingSnippet: null,
  };

  it('renders create mode when no existing snippet', () => {
    render(<UserSnippetModal {...defaultProps} />);
    expect(screen.getByText('New Snippet')).toBeInTheDocument();
    expect(screen.getByText('Create Snippet')).toBeInTheDocument();
  });

  it('renders edit mode with existing snippet data', () => {
    const snippet: UserSnippet = {
      id: 's1', title: 'Test', prefix: 'tst', description: 'A test', code: 'show test',
    };
    render(<UserSnippetModal {...defaultProps} existingSnippet={snippet} />);
    expect(screen.getByText('Edit Snippet')).toBeInTheDocument();
    expect(screen.getByText('Save Changes')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test')).toBeInTheDocument();
    expect(screen.getByDisplayValue('tst')).toBeInTheDocument();
  });

  it('shows error when title is empty', async () => {
    const user = userEvent.setup();
    render(<UserSnippetModal {...defaultProps} />);
    await user.click(screen.getByText('Create Snippet'));
    expect(screen.getByText('Title is required.')).toBeInTheDocument();
    expect(defaultProps.onSave).not.toHaveBeenCalled();
  });

  it('shows error when prefix is empty', async () => {
    const user = userEvent.setup();
    render(<UserSnippetModal {...defaultProps} />);
    await user.type(screen.getByPlaceholderText('My Custom Snippet'), 'Test');
    await user.click(screen.getByText('Create Snippet'));
    expect(screen.getByText('Prefix is required.')).toBeInTheDocument();
  });

  it('shows error when prefix has invalid characters', async () => {
    const user = userEvent.setup();
    render(<UserSnippetModal {...defaultProps} />);
    await user.type(screen.getByPlaceholderText('My Custom Snippet'), 'Test');
    await user.type(screen.getByPlaceholderText('mysnippet'), 'bad-prefix');
    await user.type(screen.getByPlaceholderText(/Hello, world/), 'show test');
    await user.click(screen.getByText('Create Snippet'));
    expect(screen.getByText('Prefix should only contain letters, numbers, and underscores.')).toBeInTheDocument();
  });

  it('shows error when code is empty', async () => {
    const user = userEvent.setup();
    render(<UserSnippetModal {...defaultProps} />);
    await user.type(screen.getByPlaceholderText('My Custom Snippet'), 'Test');
    await user.type(screen.getByPlaceholderText('mysnippet'), 'tst');
    await user.click(screen.getByText('Create Snippet'));
    expect(screen.getByText('Code is required.')).toBeInTheDocument();
  });

  it('calls onSave and onClose with valid data', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<UserSnippetModal isOpen={true} onClose={onClose} onSave={onSave} existingSnippet={null} />);

    await user.type(screen.getByPlaceholderText('My Custom Snippet'), 'My Snippet');
    await user.type(screen.getByPlaceholderText('mysnippet'), 'mysnip');
    await user.type(screen.getByPlaceholderText(/Hello, world/), 'show eileen happy');
    await user.click(screen.getByText('Create Snippet'));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved.title).toBe('My Snippet');
    expect(saved.prefix).toBe('mysnip');
    expect(saved.code).toBe('show eileen happy');
    expect(saved.monacoBody).toBeUndefined();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('sets monacoBody when placeholders checkbox is checked', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<UserSnippetModal isOpen={true} onClose={vi.fn()} onSave={onSave} existingSnippet={null} />);

    await user.type(screen.getByPlaceholderText('My Custom Snippet'), 'Labeled');
    await user.type(screen.getByPlaceholderText('mysnippet'), 'labeled');
    // Use fireEvent.change because userEvent.type interprets { } as special keys
    fireEvent.change(screen.getByPlaceholderText(/Hello, world/), { target: { value: 'label ${1:name}:\n    $0' } });
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByText('Create Snippet'));

    const saved = onSave.mock.calls[0][0];
    expect(saved.monacoBody).toBe('label ${1:name}:\n    $0');
    // code should have placeholders stripped
    expect(saved.code).toBe('label :\n    ');
  });

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<UserSnippetModal isOpen={true} onClose={onClose} onSave={vi.fn()} existingSnippet={null} />);
    await user.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('returns null when not open', () => {
    const { container } = render(<UserSnippetModal isOpen={false} onClose={vi.fn()} onSave={vi.fn()} existingSnippet={null} />);
    expect(container.innerHTML).toBe('');
  });
});
