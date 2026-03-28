
import React, { useState, useEffect, useMemo } from 'react';
import type { RenpyAnalysisResult } from '../types';
import CopyButton from './CopyButton';

interface MenuConstructorProps {
    analysisResult: RenpyAnalysisResult;
}

interface MenuChoice {
    id: string;
    text: string;
    condition: string;
    logic: string;
}

const MenuConstructor: React.FC<MenuConstructorProps> = ({ analysisResult }) => {
    const [caption, setCaption] = useState('');
    const [choices, setChoices] = useState<MenuChoice[]>([
        { id: '1', text: 'Option 1', condition: '', logic: 'jump label_1' },
        { id: '2', text: 'Option 2', condition: '', logic: 'jump label_2' }
    ]);
    const [code, setCode] = useState('');
    const [parseError, setParseError] = useState<string | null>(null);
    const [isInternalUpdate, setIsInternalUpdate] = useState(false);

    // --- Validation Helpers ---
    const getCommonKeywords = () => {
        return new Set([
            'if', 'else', 'elif', 'jump', 'call', 'return', 'pass', 'show', 'hide', 'scene', 'with',
            'play', 'stop', 'queue', 'voice', 'window', 'pause', 'renpy',
            'True', 'False', 'None', 'not', 'and', 'or', 'in', 'is', 'len', 'range', 'int', 'str', 'float',
            'expression', 'audio', 'music', 'sound'
        ]);
    };

    const validateContent = (text: string) => {
        if (!text) return { valid: true, issues: [] };
        
        const issues: Set<string> = new Set();
        const lines = text.split('\n');
        const keywords = getCommonKeywords();

        lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;

            // 1. Syntax Check: Colons
            const colonKeywords = ['if', 'elif', 'else', 'while', 'for'];
            const firstWord = trimmed.split(/[\s(]/)[0]; // Split by space or open paren
            if (colonKeywords.includes(firstWord) && !trimmed.endsWith(':')) {
                issues.add(`Line ${index + 1}: Missing colon after '${firstWord}'`);
            }

            // 2. Link Validation (Jump/Call)
            // Matches "jump label_name" or "call label_name" anywhere in the line
            const jumpMatch = trimmed.match(/\b(jump|call)\s+([a-zA-Z0-9_]+)\b/);
            if (jumpMatch) {
                const target = jumpMatch[2];
                // 'expression' is a keyword in "jump expression", not a label
                if (target !== 'expression' && !analysisResult.labels[target]) {
                    issues.add(`Line ${index + 1}: Label '${target}' not found`);
                }
            }

            // 3. Variable/Identifier Validation
            // Remove strings to avoid matching content inside quotes
            const cleanLine = trimmed.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
            const words = cleanLine.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];

            words.forEach(word => {
                // Skip keywords, numbers (handled by regex), and known entities
                if (keywords.has(word)) return;
                
                const isVariable = analysisResult.variables.has(word);
                const isLabel = analysisResult.labels[word];
                const isCharacter = analysisResult.characters.has(word);
                const isScreen = analysisResult.screens.has(word);

                // If it's unknown, flag it. 
                // Note: This is a strict check. It might flag local variables defined in python blocks.
                // However, for standard Ren'Py menu logic (jumps, var assignment), this is helpful.
                if (!isVariable && !isLabel && !isCharacter && !isScreen) {
                    // We only add this if it looks like it's being used as a variable/value
                    // heuristic: avoid flagging words that might be part of an image tag if we aren't sure
                    // But for safety in a logic block, flagging unknown identifiers is usually good.
                    issues.add(`Line ${index + 1}: Unknown variable or identifier '${word}'`);
                }
            });
        });

        return { valid: issues.size === 0, issues: Array.from(issues) };
    };

    const validateCondition = (cond: string) => {
        if (!cond) return [];
        const issues: Set<string> = new Set();
        
        // Remove strings
        const cleanLine = cond.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
        const words = cleanLine.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
        const keywords = getCommonKeywords();
        
        words.forEach(word => {
            if (keywords.has(word)) return;
            if (!analysisResult.variables.has(word) && !analysisResult.characters.has(word)) {
                issues.add(`Unknown variable '${word}'`);
            }
        });
        return Array.from(issues);
    };

    // --- Generation ---
    const generateCode = () => {
        let output = `menu:\n`;
        if (caption) {
            output += `    "${caption}"\n`;
        }
        choices.forEach(choice => {
            if (!choice.text) return; // Skip empty choices
            const cond = choice.condition ? ` if ${choice.condition}` : '';
            output += `    "${choice.text}"${cond}:\n`;
            
            const logicLines = choice.logic.split('\n').map(l => l.trim()).filter(l => l);
            if (logicLines.length === 0) {
                output += `        pass\n`;
            } else {
                logicLines.forEach(line => {
                    output += `        ${line}\n`;
                });
            }
        });
        return output;
    };

    // --- Parsing ---
    const parseCode = (input: string) => {
        // Simple line-based parser.
        const lines = input.split('\n');
        let newCaption = '';
        const newChoices: MenuChoice[] = [];
        let currentChoice: MenuChoice | null = null;
        
        try {
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#') || trimmed === 'menu:') continue;

                const indent = line.search(/\S|$/);
                
                if (indent === 4) {
                    // Could be caption or choice
                    // Check for choice pattern: "Text" ... :
                    const choiceMatch = trimmed.match(/^"(.+)"(.*):$/);
                    
                    if (choiceMatch) {
                        // It's a choice
                        const text = choiceMatch[1];
                        let condition = '';
                        const rest = choiceMatch[2].trim();
                        if (rest.startsWith('if ')) {
                            condition = rest.substring(3).trim();
                        }

                        currentChoice = {
                            id: `c-${Date.now()}-${newChoices.length}`,
                            text,
                            condition,
                            logic: ''
                        };
                        newChoices.push(currentChoice);
                    } else if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
                        // Narrator caption
                        if (newChoices.length === 0) {
                            newCaption = trimmed.slice(1, -1);
                        }
                    }
                } else if (indent > 4 && currentChoice) {
                    // Logic for current choice
                    currentChoice.logic += (currentChoice.logic ? '\n' : '') + trimmed;
                }
            }
            
            if (newChoices.length === 0 && !newCaption) throw new Error("No valid menu structure found");

            setCaption(newCaption);
            setChoices(newChoices);
            setParseError(null);
        } catch (e) {
            setParseError("Cannot parse complex or invalid code. Visual editing disabled.");
        }
    };

    // --- Effects ---
    
    // When Visual State Changes -> Update Code
    useEffect(() => {
        if (!isInternalUpdate) {
            const newCode = generateCode();
            setCode(newCode);
        }
    }, [choices, caption]); // eslint-disable-line react-hooks/exhaustive-deps

    // When Code Input Changes manually
    const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newCode = e.target.value;
        setCode(newCode);
        setIsInternalUpdate(true);
        parseCode(newCode);
        setTimeout(() => setIsInternalUpdate(false), 0);
    };

    // --- Handlers ---
    const addChoice = () => {
        setChoices([...choices, { id: Date.now().toString(), text: 'New Choice', condition: '', logic: 'pass' }]);
    };

    const removeChoice = (id: string) => {
        setChoices(choices.filter(c => c.id !== id));
    };

    const updateChoice = (id: string, field: keyof MenuChoice, value: string) => {
        setChoices(choices.map(c => c.id === id ? { ...c, [field]: value } : c));
    };

    const moveChoice = (index: number, direction: -1 | 1) => {
        if (index + direction < 0 || index + direction >= choices.length) return;
        const newChoices = [...choices];
        const temp = newChoices[index];
        newChoices[index] = newChoices[index + direction];
        newChoices[index + direction] = temp;
        setChoices(newChoices);
    };


    const handleClear = () => {
        setCaption('');
        setChoices([
            { id: `reset-1-${Date.now()}`, text: 'Option 1', condition: '', logic: 'jump label_1' },
            { id: `reset-2-${Date.now()}`, text: 'Option 2', condition: '', logic: 'jump label_2' }
        ]);
        setParseError(null);
    };

    return (
        <div className="flex flex-col h-full bg-gray-100 dark:bg-gray-900">
            {/* Top: Visual Editor */}
            <div className="flex-1 overflow-y-auto p-4 border-b-2 border-gray-300 dark:border-gray-700">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-700 dark:text-gray-300">Menu Constructor</h3>
                    <div className="flex space-x-2">
                        <button onClick={handleClear} className="px-3 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded text-sm font-semibold">
                            Clear
                        </button>
                        <button onClick={addChoice} disabled={!!parseError} className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-semibold disabled:opacity-50">
                            + Add Choice
                        </button>
                    </div>
                </div>

                {parseError ? (
                    <div className="bg-yellow-100 dark:bg-yellow-900/30 p-3 rounded text-sm text-yellow-700 dark:text-yellow-300 mb-4 border border-yellow-300 dark:border-yellow-600">
                        {parseError} <br/>
                        <span className="text-xs opacity-75">Edit in the code box below or simplify syntax to restore visual editor.</span>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Narrator Caption (Optional)</label>
                            <input 
                                type="text" 
                                value={caption} 
                                onChange={(e) => setCaption(e.target.value)} 
                                className="w-full p-2 text-sm border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500"
                                placeholder='e.g. "What should I do?"'
                            />
                        </div>

                        <div className="space-y-3">
                            {choices.map((choice, idx) => {
                                const logicValidation = validateContent(choice.logic);
                                const conditionValidation = validateCondition(choice.condition);

                                return (
                                    <div key={choice.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md p-3 shadow-sm group">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-xs font-bold text-gray-400">Choice {idx + 1}</span>
                                            <div className="flex space-x-1 opacity-50 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => moveChoice(idx, -1)} disabled={idx === 0} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-30">
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                                                </button>
                                                <button onClick={() => moveChoice(idx, 1)} disabled={idx === choices.length - 1} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-30">
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                                </button>
                                                <button onClick={() => removeChoice(choice.id)} className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded">
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                </button>
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-2">
                                            <input 
                                                type="text" 
                                                value={choice.text} 
                                                onChange={(e) => updateChoice(choice.id, 'text', e.target.value)} 
                                                className="w-full p-1.5 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 font-medium"
                                                placeholder="Choice Text"
                                            />
                                            
                                            <div className="flex flex-col space-y-1">
                                                <span className="text-xs text-gray-500 font-mono">Display if</span>
                                                <div className="flex-1 relative">
                                                    <textarea 
                                                        value={choice.condition} 
                                                        onChange={(e) => updateChoice(choice.id, 'condition', e.target.value)} 
                                                        className={`w-full p-1.5 text-xs border rounded dark:bg-gray-700 font-mono resize-y ${conditionValidation.length > 0 ? 'border-yellow-500' : 'dark:border-gray-600'}`}
                                                        placeholder="condition (optional)"
                                                        rows={1}
                                                    />
                                                    {conditionValidation.length > 0 && (
                                                        <div className="absolute right-2 top-1.5 text-yellow-500" title={conditionValidation.join(', ')}>
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="relative">
                                                <textarea 
                                                    value={choice.logic}
                                                    onChange={(e) => updateChoice(choice.id, 'logic', e.target.value)}
                                                    className={`w-full p-2 text-xs font-mono border rounded bg-gray-50 dark:bg-gray-900 ${logicValidation.issues.length > 0 ? 'border-red-400' : 'dark:border-gray-600'}`}
                                                    rows={3}
                                                    placeholder="jump label..."
                                                />
                                                {logicValidation.issues.length > 0 && (
                                                    <div className="absolute right-2 bottom-2 text-red-500" title={logicValidation.issues.join('\n')}>
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom: Code View */}
            <div className="h-1/3 bg-gray-50 dark:bg-gray-950 flex flex-col border-t border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center px-3 py-1 bg-gray-200 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700">
                    <span className="text-xs font-bold text-gray-500 uppercase">Generated Code</span>
                    <CopyButton text={code} size="xs" />
                </div>
                <textarea 
                    value={code}
                    onChange={handleCodeChange}
                    className="flex-1 w-full p-3 font-mono text-sm bg-transparent resize-none focus:outline-none dark:text-gray-300"
                    spellCheck={false}
                />
            </div>
        </div>
    );
};

export default MenuConstructor;
