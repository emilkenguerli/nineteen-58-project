'use client';

import { experimental_useObject as useObject } from '@ai-sdk/react';
import { reportSchema } from '@/lib/schema';
import { PromptInput } from '@/components/prompt-input';
import { ReportRenderer } from '@/components/report-renderer';
import { useState, useEffect, useRef } from 'react';

export default function Home() {
  const { object, submit, isLoading, error, stop } = useObject({
    api: '/api/report',
    schema: reportSchema,
  });

  const [savedId, setSavedId] = useState<string | null>(null);
  const prevIsLoading = useRef(isLoading);
  const lastPrompt = useRef<string>('');

  // Auto-save report when generation completes
  useEffect(() => {
    if (prevIsLoading.current && !isLoading && lastPrompt.current && object?.title && object?.sections?.length) {
      fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: lastPrompt.current,
          report_json: object,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.id) setSavedId(data.id);
        })
        .catch(() => {
          // Silent fail on save — non-critical
        });
    }
    prevIsLoading.current = isLoading;
  }, [isLoading, object]);

  const handleSubmit = (prompt: string) => {
    setSavedId(null);
    lastPrompt.current = prompt;
    submit({ prompt });
  };

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">
            Marketing Report Generator
          </h1>
          <p className="text-gray-500">
            Ask any question about your campaign performance and get a visual report
          </p>
        </div>

        {/* Prompt Input */}
        <PromptInput onSubmit={handleSubmit} isLoading={isLoading} />

        {/* Error Banner */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            <strong>Error:</strong> {error.message}
          </div>
        )}

        {/* Loading State (before any data arrives) */}
        {isLoading && !object && (
          <div className="text-center py-12 text-gray-400 space-y-3">
            <div className="inline-block w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
            <p>Querying your data and generating report...</p>
          </div>
        )}

        {/* Report */}
        <ReportRenderer report={object as Record<string, unknown> | undefined} />

        {/* Stop Button */}
        {isLoading && object && (
          <div className="text-center">
            <button
              onClick={stop}
              className="px-4 py-2 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Stop generating
            </button>
          </div>
        )}

        {/* Saved indicator */}
        {savedId && !isLoading && (
          <p className="text-center text-xs text-gray-400">
            Report saved &middot;{' '}
            <a href="/reports" className="underline hover:text-gray-600">
              View all reports
            </a>
          </p>
        )}

        {/* Footer link to reports history */}
        {!isLoading && !object && (
          <div className="text-center pt-8">
            <a
              href="/reports"
              className="text-sm text-gray-400 hover:text-gray-600 underline"
            >
              View past reports
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
