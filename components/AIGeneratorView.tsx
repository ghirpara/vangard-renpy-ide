import React, { useState, useCallback, useEffect } from 'react';
import type { Block, RenpyAnalysisResult } from '../types';
import CopyButton from './CopyButton';

interface AIGeneratorViewProps {
  currentBlockId: string;
  blocks: Block[];
  analysisResult: RenpyAnalysisResult;
  getCurrentContext: () => string;
  availableModels: string[];
  selectedModel: string;
}

const modelProviderFor = (modelId: string): 'google' | 'openai' | 'anthropic' | 'google-unknown' => {
  const id = (modelId || '').toLowerCase();
  if (id.includes('gpt') || id.includes('openai')) return 'openai';
  if (id.includes('claude') || id.includes('anthropic')) return 'anthropic';
  if (id.includes('gemini') || id.includes('veo')) return 'google';
  return 'google-unknown';
};

const AIGeneratorView: React.FC<AIGeneratorViewProps> = ({
  currentBlockId,
  blocks,
  analysisResult,
  getCurrentContext,
  availableModels,
  selectedModel
}) => {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [includeContext, setIncludeContext] = useState(true);
  const [renpyOnly, setRenpyOnly] = useState(true);
  const [model, setModel] = useState(selectedModel);

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savedApiKey, setSavedApiKey] = useState<string | null>(null);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);

  useEffect(() => {
    setModel(selectedModel);
  }, [selectedModel]);

  // Load saved API key on mount
  useEffect(() => {
    const loadApiKey = async () => {
      if (!window.electronAPI) return;
      setApiKeyLoading(true);
      try {
        const keys = await window.electronAPI.loadApiKeys();
        const provider = modelProviderFor(model);
        setSavedApiKey(keys[provider] || null);
      } catch (err) {
        console.error('Failed to load API key:', err);
      } finally {
        setApiKeyLoading(false);
      }
    };
    loadApiKey();
  }, [model]);

  const handleSaveApiKey = async () => {
    if (!window.electronAPI || !apiKeyInput.trim()) return;
    try {
      const provider = modelProviderFor(model);
      const result = await window.electronAPI.saveApiKey(provider, apiKeyInput.trim());
      if (result.success) {
        setSavedApiKey(apiKeyInput.trim());
        setApiKeyInput('');
      } else {
        setError(`Failed to save API key: ${result.error}`);
      }
    } catch (err) {
      setError(`Failed to save API key: ${err}`);
    }
  };

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;

    setIsLoading(true);
    setError(null);
    setResponse('');

    try {
      const provider = modelProviderFor(model);
      const apiKey = savedApiKey;

      if (!apiKey) {
        setError('No API key found. Please save an API key first.');
        return;
      }

      let fullPrompt = prompt;
      if (includeContext) {
        const context = getCurrentContext();
        fullPrompt = `Context from current Ren'Py project:\n${context}\n\nUser request: ${prompt}`;
      }

      if (renpyOnly) {
        fullPrompt += '\n\nPlease provide only Ren\'Py script code without any explanations or markdown formatting.';
      }

      let generatedContent = '';

      if (provider === 'google') {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: fullPrompt }] }]
          })
        });
        if (!response.ok) {
          throw new Error(`Google API error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        generatedContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } else if (provider === 'openai') {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: fullPrompt }],
            max_tokens: 4096
          })
        });
        if (!response.ok) {
          throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        generatedContent = data.choices?.[0]?.message?.content || '';
      } else if (provider === 'anthropic') {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: model,
            max_tokens: 4096,
            messages: [{ role: 'user', content: fullPrompt }]
          })
        });
        if (!response.ok) {
          throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        generatedContent = data.content?.[0]?.text || '';
      }

      setResponse(generatedContent);

    } catch (err) {
      console.error('Generation error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [prompt, model, savedApiKey, includeContext, renpyOnly, getCurrentContext]);


  const currentBlock = blocks.find(b => b.id === currentBlockId);

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              AI Content Generator
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Generate Ren'Py script content using AI models. Current context: {currentBlock?.title || 'No block selected'}
            </p>
          </div>

          {/* Model Selection */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Model Selection</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  AI Model
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                >
                  {availableModels.map(modelId => (
                    <option key={modelId} value={modelId}>{modelId}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Provider
                </label>
                <div className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700">
                  <span className="text-gray-900 dark:text-white capitalize">
                    {modelProviderFor(model)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* API Key Management */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">API Key</h3>
            {apiKeyLoading ? (
              <div className="text-gray-600 dark:text-gray-400">Loading...</div>
            ) : savedApiKey ? (
              <div className="flex items-center space-x-2">
                <span className="text-green-600 dark:text-green-400">✓ API key saved</span>
                <button
                  onClick={() => setSavedApiKey(null)}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Change key
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={`Enter ${modelProviderFor(model)} API key`}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                />
                <button
                  onClick={handleSaveApiKey}
                  disabled={!apiKeyInput.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save API Key
                </button>
              </div>
            )}
          </div>

          {/* Generation Options */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Generation Options</h3>
            <div className="space-y-3">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={includeContext}
                  onChange={(e) => setIncludeContext(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50 dark:bg-gray-700"
                />
                <span className="ml-2 text-gray-700 dark:text-gray-300">Include current project context</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={renpyOnly}
                  onChange={(e) => setRenpyOnly(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50 dark:bg-gray-700"
                />
                <span className="ml-2 text-gray-700 dark:text-gray-300">Ren'Py script only (no explanations)</span>
              </label>
            </div>
          </div>

          {/* Prompt Input */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Prompt</h3>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what you want to generate..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white resize-none"
            />
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleGenerate}
                disabled={isLoading || !prompt.trim() || !savedApiKey}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Generating...' : 'Generate Content'}
              </button>
            </div>
          </div>

          {/* Response */}
          {response && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Generated Content</h3>
                <CopyButton text={response.trim()} size="md" />
              </div>
              <pre className="whitespace-pre-wrap text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 p-4 rounded-md border text-sm overflow-auto max-h-96">
                {response}
              </pre>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg p-4">
              <div className="text-red-800 dark:text-red-200">
                <strong>Error:</strong> {error}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIGeneratorView;