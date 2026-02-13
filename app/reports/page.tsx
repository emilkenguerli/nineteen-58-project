'use client';

import { useEffect, useState } from 'react';
import { ReportRenderer } from '@/components/report-renderer';

interface SavedReport {
  id: string;
  title?: string;
  prompt: string;
  report_json?: Record<string, unknown>;
  created_at: string;
}

export default function ReportsPage() {
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<SavedReport | null>(null);

  useEffect(() => {
    fetch('/api/reports')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setReports(data);
        } else {
          setError(data.error || 'Failed to load reports');
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // If a report is selected, fetch its full JSON and display it
  const handleSelectReport = async (report: SavedReport) => {
    if (report.report_json) {
      setSelectedReport(report);
      return;
    }
    // Fetch full report (list endpoint only returns id, prompt, created_at)
    try {
      const res = await fetch(`/api/reports/${report.id}`);
      const data = await res.json();
      setSelectedReport({ ...report, report_json: data.report_json });
    } catch {
      // If individual fetch fails, just show what we have
      setSelectedReport(report);
    }
  };

  if (selectedReport?.report_json) {
    return (
      <main className="min-h-screen p-6 md:p-10">
        <div className="max-w-5xl mx-auto space-y-6">
          <button
            onClick={() => setSelectedReport(null)}
            className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            &larr; Back to reports
          </button>
          <p className="text-sm text-gray-400">
            Generated on{' '}
            {new Date(selectedReport.created_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
          <ReportRenderer report={selectedReport.report_json} />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Past Reports</h1>
          <a
            href="/"
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            &larr; New report
          </a>
        </div>

        {loading && (
          <div className="text-center py-12 text-gray-400">
            <div className="inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
            <p className="mt-2">Loading reports...</p>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && reports.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p>No reports yet. Generate one from the home page.</p>
          </div>
        )}

        {reports.length > 0 && (
          <div className="divide-y divide-gray-100">
            {reports.map((report) => (
              <button
                key={report.id}
                onClick={() => handleSelectReport(report)}
                className="w-full text-left px-4 py-4 hover:bg-gray-50 transition-colors flex items-center justify-between group"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 group-hover:text-blue-600 truncate">
                    {report.title || report.prompt}
                  </p>
                  {report.title && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      &ldquo;{report.prompt}&rdquo;
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(report.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <span className="text-gray-300 group-hover:text-blue-500 text-lg">
                  &rarr;
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
