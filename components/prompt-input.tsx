'use client';

import { useState, type KeyboardEvent } from 'react';

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
  isLoading: boolean;
  isRefining?: boolean;
}

const EXAMPLE_PROMPTS = [
  'Show me a performance overview of all active campaigns',
  'Compare revenue across channels for the last 7 days',
  'Which campaign has the best ROAS?',
  'Show daily revenue trends with week-over-week comparison',
];

export function PromptInput({ onSubmit, isLoading, isRefining = false }: PromptInputProps) {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = () => {
    const trimmed = prompt.trim();
    if (!trimmed || isLoading) return;
    onSubmit(trimmed);
    setPrompt('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleExampleClick = (example: string) => {
    if (isLoading) return;
    onSubmit(example);
    setPrompt('');
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isRefining ? 'Ask a follow-up question...' : 'Ask a question about your campaign data...'}
          rows={2}
          disabled={isLoading}
          className="flex-1 resize-none rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isLoading || !prompt.trim()}
          className="self-end rounded-lg bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500/20 focus:outline-none disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? (
            <span className="inline-flex items-center gap-2">
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Generating...
            </span>
          ) : isRefining ? (
            'Refine'
          ) : (
            'Submit'
          )}
        </button>
      </div>

      {!isRefining && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_PROMPTS.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => handleExampleClick(example)}
              disabled={isLoading}
              className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {example}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
