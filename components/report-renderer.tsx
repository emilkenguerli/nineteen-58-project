'use client';

import { SectionRenderer } from '@/components/section-renderer';

interface ReportRendererProps {
  report: Record<string, unknown> | undefined; // DeepPartial<Report>
}

export function ReportRenderer({ report }: ReportRendererProps) {
  if (!report) return null;

  const title = report.title as string | undefined;
  const summary = report.summary as string | undefined;
  const sections = report.sections as Array<Record<string, unknown>> | undefined;

  return (
    <div className="space-y-8">
      {title && (
        <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
      )}

      {summary && (
        <blockquote className="border-l-4 border-blue-500 pl-4 py-2 text-gray-600 bg-blue-50 rounded-r-lg">
          {summary}
        </blockquote>
      )}

      {Array.isArray(sections) && sections.length > 0 && (
        <div className="space-y-10">
          {sections.map((section, idx) => (
            <div key={idx} className="section-animate">
              <SectionRenderer section={section} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
