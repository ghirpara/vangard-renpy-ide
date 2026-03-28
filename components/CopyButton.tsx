import React, { useState } from 'react';

interface CopyButtonProps {
    /** Text to write to the clipboard */
    text: string;
    /** Button label in idle state (default: "Copy to Clipboard") */
    label?: string;
    /**
     * xs — very compact, for code-preview headers and list rows
     * sm — standard button (default)
     * md — primary action button
     */
    size?: 'xs' | 'sm' | 'md';
    className?: string;
}

/**
 * Consistent clipboard copy button.
 * Idle: clipboard icon + label text, neutral bg.
 * Copied: checkmark icon + "Copied!", green bg. Resets after 2 s.
 */
export default function CopyButton({ text, label = 'Copy to Clipboard', size = 'sm', className = '' }: CopyButtonProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
        }
    };

    const sizeClasses: Record<NonNullable<CopyButtonProps['size']>, string> = {
        xs: 'px-2 py-0.5 text-[10px] gap-1',
        sm: 'px-3 py-1.5 text-xs gap-1.5',
        md: 'px-4 py-2 text-sm gap-2',
    };

    const iconSizeClass: Record<NonNullable<CopyButtonProps['size']>, string> = {
        xs: 'w-2.5 h-2.5',
        sm: 'w-3 h-3',
        md: 'w-4 h-4',
    };

    const iconClass = iconSizeClass[size];

    return (
        <button
            onClick={handleCopy}
            className={`inline-flex items-center font-semibold rounded transition-colors
                ${sizeClasses[size]}
                ${copied
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'
                } ${className}`}
        >
            {copied ? (
                <>
                    <svg viewBox="0 0 12 12" className={iconClass} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 6l3 3 5-5" />
                    </svg>
                    Copied!
                </>
            ) : (
                <>
                    <svg viewBox="0 0 12 12" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="4" y="1" width="7" height="8" rx="1" />
                        <path d="M1 4v7h7" />
                    </svg>
                    {label}
                </>
            )}
        </button>
    );
}
