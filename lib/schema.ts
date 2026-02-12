import { z } from 'zod';

// KPI section data item
const kpiItem = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]),
  format: z.enum(['number', 'currency', 'percent']).optional(),
  delta: z.number().optional(),
  trend: z.enum(['up', 'down', 'flat']).optional(),
});

// Discriminated union on 'visualisation' field:
// - kpi_card: data is array of kpi items
// - table: data has columns [{key, label}] and rows [Record<string, string|number>]
// - bar_chart: data has xKey, yKeys, points [Record<string, string|number>]
// - line_chart: same as bar_chart

const reportSchema = z.object({
  title: z.string(),
  summary: z.string(),
  sections: z.array(z.discriminatedUnion('visualisation', [
    z.object({
      heading: z.string(),
      narrative: z.string(),
      visualisation: z.literal('kpi_card'),
      data: z.array(kpiItem),
    }),
    z.object({
      heading: z.string(),
      narrative: z.string(),
      visualisation: z.literal('table'),
      data: z.object({
        columns: z.array(z.object({ key: z.string(), label: z.string() })),
        rows: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
      }),
    }),
    z.object({
      heading: z.string(),
      narrative: z.string(),
      visualisation: z.literal('bar_chart'),
      data: z.object({
        xKey: z.string(),
        yKeys: z.array(z.string()),
        points: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
      }),
    }),
    z.object({
      heading: z.string(),
      narrative: z.string(),
      visualisation: z.literal('line_chart'),
      data: z.object({
        xKey: z.string(),
        yKeys: z.array(z.string()),
        points: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
      }),
    }),
  ])),
});

export { reportSchema };
// Export all inferred types
export type Report = z.infer<typeof reportSchema>;
export type ReportSection = Report['sections'][number];
// Also export individual section types by extracting from the union
export type KpiCardSection = Extract<ReportSection, { visualisation: 'kpi_card' }>;
export type TableSection = Extract<ReportSection, { visualisation: 'table' }>;
export type BarChartSection = Extract<ReportSection, { visualisation: 'bar_chart' }>;
export type LineChartSection = Extract<ReportSection, { visualisation: 'line_chart' }>;
export type KpiItem = z.infer<typeof kpiItem>;
