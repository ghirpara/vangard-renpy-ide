import React, { useState, useMemo } from 'react';
import type { Variable, RenpyAnalysisResult } from '../types';

interface VariableManagerProps {
    analysisResult: RenpyAnalysisResult;
    onAddVariable: (variable: Omit<Variable, 'definedInBlockId' | 'line'>) => void;
    onFindUsages: (variableName: string) => void;
    onHoverHighlightStart: (key: string, type: 'character' | 'variable') => void;
    onHoverHighlightEnd: () => void;
}

const VariableEditor: React.FC<{
    onSave: (variable: Omit<Variable, 'definedInBlockId' | 'line'>) => void;
    onCancel: () => void;
    existingNames: string[];
}> = ({ onSave, onCancel, existingNames }) => {
    const [name, setName] = useState('');
    const [type, setType] = useState<'define' | 'default'>('default');
    const [initialValue, setInitialValue] = useState('False');
    const [nameError, setNameError] = useState('');

    const handleSave = () => {
        const isNameUnique = !existingNames.includes(name);
        const isNameValid = /^[a-zA-Z0-9_.]+$/.test(name) && name.length > 0;

        if (!isNameValid) {
            setNameError('Name must be a valid variable name (letters, numbers, underscores, dots).');
            return;
        }
        if (!isNameUnique) {
            setNameError('This variable name is already in use.');
            return;
        }

        onSave({ name, type, initialValue });
    };
    
    React.useEffect(() => {
        setNameError('');
    }, [name]);

    return (
        <div className="bg-gray-100 dark:bg-gray-700/50 p-4 rounded-lg space-y-3">
            <h3 className="font-semibold text-lg">Add New Variable</h3>
            <div>
                <label className="text-sm font-medium">Type</label>
                <select value={type} onChange={e => setType(e.target.value as 'define' | 'default')} className="w-full mt-1 p-2 rounded bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500">
                    <option value="default">Default (persists through saves)</option>
                    <option value="define">Define (resets on game start)</option>
                </select>
            </div>
            <div>
                <label className="text-sm font-medium">Variable Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g., player_score" className={`w-full mt-1 p-2 rounded bg-white dark:bg-gray-800 border ${nameError ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} focus:ring-indigo-500 focus:border-indigo-500`} />
                 {nameError && <p className="text-red-500 text-xs mt-1">{nameError}</p>}
            </div>
            <div>
                <label className="text-sm font-medium">Initial Value</label>
                <input type="text" value={initialValue} onChange={e => setInitialValue(e.target.value)} placeholder={`e.g., 0 or "initial_state"`} className="w-full mt-1 p-2 rounded bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
            <div className="flex justify-end space-x-2 pt-2">
                <button onClick={onCancel} className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-sm font-bold">Cancel</button>
                <button onClick={handleSave} className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">Save</button>
            </div>
        </div>
    );
};


const VariableManager: React.FC<VariableManagerProps> = ({ analysisResult, onAddVariable, onFindUsages, onHoverHighlightStart, onHoverHighlightEnd }) => {
    const { variables, storyBlockIds } = analysisResult;
    const [mode, setMode] = useState<'list' | 'add'>('list');
    const [filterStoryVars, setFilterStoryVars] = useState(true);

    const filteredVariables = useMemo(() => {
        const allVars = Array.from(variables.values());
        if (!filterStoryVars) {
            return allVars;
        }
        return allVars.filter((v: Variable) => storyBlockIds.has(v.definedInBlockId));
    }, [variables, filterStoryVars, storyBlockIds]);

    const { defined, defaulted } = useMemo(() => {
        const grouped = { defined: [] as Variable[], defaulted: [] as Variable[] };
        for (const variable of filteredVariables) {
            if (variable.type === 'define') {
                grouped.defined.push(variable);
            } else {
                grouped.defaulted.push(variable);
            }
        }
        grouped.defined.sort((a: Variable, b: Variable) => a.name.localeCompare(b.name));
        grouped.defaulted.sort((a: Variable, b: Variable) => a.name.localeCompare(b.name));
        return grouped;
    }, [filteredVariables]);
    
    const handleSave = (variable: Omit<Variable, 'definedInBlockId' | 'line'>) => {
        onAddVariable(variable);
        setMode('list');
    };

    const VariableList: React.FC<{ title: string; vars: Variable[] }> = ({ title, vars }) => {
        const [collapsed, setCollapsed] = useState(false);
        return (
            <div className="mt-4">
                <button
                    onClick={() => setCollapsed(c => !c)}
                    className="flex items-center gap-1 w-full font-semibold text-gray-500 dark:text-gray-400 text-sm mb-2 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                    <svg className={`w-3 h-3 flex-none transition-transform ${collapsed ? '-rotate-90' : ''}`} viewBox="0 0 12 12" fill="none">
                        <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {title} ({vars.length})
                </button>
                {!collapsed && (
                    <ul className="space-y-2">
                        {vars.map(variable => (
                            <li
                              key={variable.name}
                              className="p-2 rounded-md bg-gray-50 dark:bg-gray-700/50 flex items-center justify-between"
                              onMouseEnter={() => onHoverHighlightStart(variable.name, 'variable')}
                              onMouseLeave={onHoverHighlightEnd}
                            >
                                <div className="flex-grow min-w-0">
                                    <p className="font-semibold font-mono text-sm truncate" title={variable.name}>{variable.name}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate" title={`= ${variable.initialValue}`}>
                                        = {variable.initialValue}
                                    </p>
                                </div>
                                <div className="flex items-center space-x-1 flex-shrink-0 pl-2">
                                    <button onClick={() => onFindUsages(variable.name)} title="Find Usages" className="p-1 text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                    </button>
                                </div>
                            </li>
                        ))}
                        {vars.length === 0 && <p className="text-xs text-gray-400 dark:text-gray-500 pl-1">None found.</p>}
                    </ul>
                )}
            </div>
        );
    };
    
    return (
        <>
            {mode === 'list' && (
                <>
                    <div className="flex justify-between items-center">
                        <h3 className="font-semibold">Variables ({filteredVariables.length})</h3>
                        <button onClick={() => setMode('add')} className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold">+ Add</button>
                    </div>

                    <label htmlFor="variable-filter-toggle" className="flex items-center justify-between mt-4 cursor-pointer">
                        <span className="text-sm text-gray-600 dark:text-gray-400 select-none">
                            Show story variables only
                        </span>
                        <div className="relative inline-flex items-center">
                            <input 
                                type="checkbox" 
                                id="variable-filter-toggle" 
                                className="sr-only peer" 
                                checked={filterStoryVars}
                                onChange={() => setFilterStoryVars(!filterStoryVars)}
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                        </div>
                    </label>

                    <div>
                        <VariableList title="Default Variables" vars={defaulted} />
                        <VariableList title="Defined Variables" vars={defined} />
                    </div>
                    {filteredVariables.length === 0 && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                            {filterStoryVars ? 'No story variables found.' : 'No variables defined yet.'}
                        </p>
                    )}
                </>
            )}

            {mode === 'add' && (
                <VariableEditor
                    onSave={handleSave}
                    onCancel={() => setMode('list')}
                    existingNames={Array.from(variables.keys())}
                />
            )}
        </>
    );
};

export default VariableManager;