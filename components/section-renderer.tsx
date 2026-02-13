'use client';

import { ErrorBoundary } from '@/components/error-boundary';
import { KpiCard } from '@/components/kpi-card';
import { DataTable } from '@/components/data-table';
import { BarChartSection } from '@/components/bar-chart';
import { LineChartSection } from '@/components/line-chart';

interface SectionRendererProps {
  section: Record<string, unknown>; // Actually DeepPartial<ReportSection>
}

export function SectionRenderer({ section }: SectionRendererProps) {
  // Guard: need at least visualisation
  if (!section?.visualisation) return <SectionSkeleton />;

  const heading = typeof section.heading === 'string' ? section.heading : null;
  const narrative = typeof section.narrative === 'string' ? section.narrative : null;

  return (
    <ErrorBoundary>
      <div className="section-animate space-y-3">
        {heading && (
          <h2 className="text-xl font-semibold text-gray-900">{heading}</h2>
        )}
        {narrative && (
          <p className="text-gray-600">{narrative}</p>
        )}
        {renderVisualisation(section)}
      </div>
    </ErrorBoundary>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderVisualisation(section: any) {
  switch (section.visualisation) {
    case 'kpi_card': {
      // Readiness: need data array with at least one item
      if (!Array.isArray(section.data) || section.data.length === 0)
        return <SectionSkeleton />;
      return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {section.data.map((kpi: any, i: number) =>
            kpi?.label && kpi?.value !== undefined ? (
              <KpiCard key={i} {...kpi} />
            ) : null,
          )}
        </div>
      );
    }
    case 'table': {
      // Readiness: need columns and rows
      if (!section.data?.columns?.length || !section.data?.rows?.length)
        return <SectionSkeleton />;
      return (
        <DataTable
          columns={section.data.columns}
          rows={section.data.rows}
        />
      );
    }
    case 'bar_chart': {
      // Readiness: need xKey, yKeys, and points
      if (
        !section.data?.xKey ||
        !section.data?.yKeys?.length ||
        !section.data?.points?.length
      )
        return <SectionSkeleton />;
      return (
        <BarChartSection
          xKey={section.data.xKey}
          yKeys={section.data.yKeys}
          points={section.data.points}
        />
      );
    }
    case 'line_chart': {
      // Readiness: need xKey, yKeys, and points
      if (
        !section.data?.xKey ||
        !section.data?.yKeys?.length ||
        !section.data?.points?.length
      )
        return <SectionSkeleton />;
      return (
        <LineChartSection
          xKey={section.data.xKey}
          yKeys={section.data.yKeys}
          points={section.data.points}
        />
      );
    }
    default:
      return null;
  }
}

function SectionSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-6 bg-gray-200 rounded w-1/3" />
      <div className="h-4 bg-gray-200 rounded w-2/3" />
      <div className="h-48 bg-gray-200 rounded" />
    </div>
  );
}
