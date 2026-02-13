import { generateText, streamObject, stepCountIs } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { reportSchema } from '@/lib/schema';
import { reportTools } from '@/lib/tools';

export const maxDuration = 60;

export async function POST(req: Request) {
  const { prompt } = await req.json();

  if (!prompt || typeof prompt !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing prompt' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Phase 1: Use generateText with tools to let the model query Supabase
  const { text: dataContext, steps } = await generateText({
    model: anthropic('claude-sonnet-4-20250514'),
    system: `You are a marketing data analyst. The user will ask a question about marketing campaigns.
Use the available tools to query the database and gather relevant data. Call as many tools as needed.

After gathering data, write a brief summary of what data you found. Include all the raw data/numbers
so they can be used to build a report. Be thorough — include all relevant metrics, breakdowns, and time-series data.

TOOL RESULT SHAPE:
- All tools return { ok: true, data: ... } on success or { ok: false, error: "..." } on failure.
- If a tool fails, note the error and continue with other tools.`,
    tools: reportTools,
    stopWhen: stepCountIs(10),
    prompt,
  });

  // Log tool usage
  const toolCalls = steps.flatMap((s) => s.toolCalls || []);
  if (toolCalls.length > 0) {
    console.log('[report] Phase 1 tools called:', toolCalls.map((tc) => tc.toolName));
  }

  // Phase 2: Stream the structured report using the gathered data
  const result = streamObject({
    model: anthropic('claude-sonnet-4-20250514'),
    schema: reportSchema,
    system: `You are a marketing analytics report builder. You will receive raw data that was queried from a database,
along with the user's original question. Generate a structured report from this data.

REPORT GUIDELINES:
- title: A concise, descriptive title for the report
- summary: 2-3 sentence executive summary highlighting key findings
- sections: Choose the most appropriate visualisation for each insight:
  - kpi_card: For headline metrics (total spend, ROAS, CTR, conversion rate). Include delta and trend when comparing periods. Each KPI item needs label, value, and optionally format ('currency'/'percent'/'number'), delta (numeric change as percentage), and trend ('up'/'down'/'flat').
  - table: For detailed breakdowns with multiple columns. Provide columns as [{key, label}] and rows as arrays of objects with matching keys. Include 3-8 rows typically.
  - bar_chart: For comparing categories (e.g., spend by channel, conversions by campaign). Provide xKey (category axis key), yKeys (array of numeric value keys to plot), and points (array of data objects).
  - line_chart: For trends over time. Provide xKey (date axis key), yKeys (metric series keys), and points (array of data objects with date + metric values).
- Each section needs a heading and a narrative (1-2 sentences explaining the insight).
- Aim for 3-5 sections per report with a mix of visualisation types.

DATA INTEGRITY:
- Only use the data provided below. Never fabricate numbers.
- Format currency values as plain numbers (e.g., 1234.56 not "$1,234.56") and set format to 'currency'.
- Format percentages as plain numbers (e.g., 5.8 not "5.8%") and set format to 'percent'.
- For table rows, keep numeric fields as numbers (including ROAS, conversion_rate, CTR). Do not include currency symbols, commas, or percent signs. The frontend handles all number formatting.
- For charts, ensure xKey matches a key present in every points object, and yKeys lists only numeric keys.
- If data is missing or incomplete, mention the limitation in your narrative.`,
    prompt: `User question: ${prompt}\n\nData gathered from database:\n${dataContext}`,
    onFinish({ object, error }) {
      if (error) {
        console.error('[report] Phase 2 error:', error);
      }
      if (object) {
        console.log('[report] Generated:', object.title, `(${object.sections.length} sections)`);
      }
    },
  });

  return result.toTextStreamResponse();
}
