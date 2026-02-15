# Marketing Report Generator

A generative reporting tool that turns natural language questions into structured, visual reports. Users type a prompt (e.g. "Compare revenue across channels this week"), an LLM interprets it, queries a Supabase database via tool-calling, and streams back a structured JSON report that renders progressively in the browser.

Built for the Nineteen58 technical assessment. This was a 2-day prototype, so I focused on correctness and clarity over visual polish.

**Live demo:** [https://nineteen-58-project.vercel.app](https://nineteen-58-project.vercel.app)

## Quick Start

### Prerequisites

- Node.js 20+ (`nvm use 20`)
- A [Supabase](https://supabase.com) project
- An [Anthropic API key](https://console.anthropic.com)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in your `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key          # optional
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ANTHROPIC_API_KEY=your-anthropic-key
```

### 3. Seed the database

Run the contents of `seed.sql` in your Supabase SQL editor (Dashboard → SQL Editor → New Query → paste → Run). This creates:

- 3 related tables (`campaigns`, `channels`, `daily_metrics`) + a `reports` table for persistence
- 4 RPC functions (`list_campaigns`, `list_channels`, `get_metrics`, `get_timeseries`)
- 14 days of seed data across 5 campaigns and 5 channels (~350 rows)
- Row Level Security policies on all tables

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and try a prompt like:

- "Show me a performance overview of all active campaigns"
- "Compare revenue across channels for the last 7 days"
- "What's our best performing campaign by ROAS?"
- "Show daily spend trends with week-over-week comparison"

## Architecture

```
User prompt
    │
    ▼
┌────────────────────────────────────┐
│  POST /api/report                  │
│                                    │
│  Phase 1: generateText + tools     │
│  ┌──────────────────────────────┐  │
│  │ Claude calls Supabase RPCs   │  │
│  │ via 4 tool definitions       │  │
│  │ (listCampaigns, listChannels,│  │
│  │  getMetrics, getTimeseries)  │  │
│  └──────────────────────────────┘  │
│            │ raw data               │
│            ▼                        │
│  Phase 2: streamObject + Zod schema│
│  ┌──────────────────────────────┐  │
│  │ Claude generates structured   │  │
│  │ JSON constrained by schema    │  │
│  │ (streamed incrementally)      │  │
│  └──────────────────────────────┘  │
└──────────────┬─────────────────────┘
               │ streaming JSON
               ▼
┌────────────────────────────────────┐
│  Browser (useObject)               │
│  DeepPartial<Report> updates       │
│  progressively → sections render   │
│  as they arrive                    │
└────────────────────────────────────┘
```

### Two-Phase Design

The endpoint uses a two-phase approach to keep tool-calling and schema-constrained streaming cleanly separated:

1. **Phase 1** - `generateText` with tools: Claude decides which Supabase RPCs to call based on the user's prompt, fetches real data, and produces a text summary of findings
2. **Phase 2** - `streamObject` with Zod schema: Claude takes the data summary and generates a schema-constrained streaming JSON report

This keeps tool-calling and structured generation cleanly separated while maintaining full streaming to the client.

### Prompt Refinement

After a report is generated, the user can ask follow-up questions to modify or drill into it. The client tracks the last completed report and sends it alongside the new prompt. Both phases receive context about the previous report:

- **Phase 1** gets the previous report's title, summary, and section headings so Claude can decide whether to query new data or reuse existing findings
- **Phase 2** gets the full previous report JSON and instructions to modify/extend it rather than starting from scratch

The UI switches to "refinement mode" - the input placeholder changes to "Ask a follow-up question...", the submit button reads "Refine", and example prompts are hidden. A "New report" button lets the user clear context and start fresh.

### Key Design Decisions

| Decision                                   | Rationale                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Zod schema shared end-to-end**           | `lib/schema.ts` is imported by both the API route (server) and `useObject` (client). One schema drives validation, streaming, and component props.                                                                                                                                                                         |
| **Discriminated union on `visualisation`** | Each section type (kpi_card, table, bar_chart, line_chart) has its own data shape. TypeScript enforces correct props per type.                                                                                                                                                                                             |
| **Section readiness gates**                | The trickiest part of streaming was handling `DeepPartial<Report>` - sections arrive incomplete, so each renderer guards on minimum required fields (e.g. table needs both `columns` and `rows`) before mounting. Shows a skeleton otherwise.                                                                              |
| **Supabase RPC functions**                 | All data access goes through Postgres functions, not raw table queries. `get_timeseries` whitelists metric columns to avoid dynamic SQL injection.                                                                                                                                                                         |
| **Lazy Supabase client**                   | Uses a Proxy so env vars are validated at first use, not module load. This lets `next build` succeed without env vars set (useful for CI).                                                                                                                                                                                 |
| **ErrorBoundary per section**              | Malformed AI output crashes one section, not the whole report.                                                                                                                                                                                                                                                             |
| **RLS on all tables**                      | Row Level Security is enabled on every table with policies scoped to the `authenticated` role. The RPC functions use `SECURITY DEFINER` so they execute with the definer's privileges, but the underlying tables are still locked down. Without user auth there's no per-user scoping yet, but the foundation is in place. |

## Project Structure

```
lib/
  schema.ts          # Shared Zod report schema + exported types
  supabase-admin.ts  # Server-only Supabase client (service role)
  tools.ts           # 4 AI tool definitions (Supabase bridge)

app/
  page.tsx           # Main page - prompt input + streaming report
  reports/page.tsx   # Past reports history
  api/
    report/route.ts      # Two-phase streaming endpoint
    reports/route.ts     # GET (list) + POST (save) reports
    reports/[id]/route.ts # GET single saved report

components/
  prompt-input.tsx       # Textarea + example prompt chips
  report-renderer.tsx    # Report shell (title, summary, sections)
  section-renderer.tsx   # Dispatch by visualisation type + readiness gates
  kpi-card.tsx           # KPI metric card with delta/trend
  data-table.tsx         # Sortable table (click column headers)
  bar-chart.tsx          # Recharts bar chart wrapper
  line-chart.tsx         # Recharts line chart wrapper
  error-boundary.tsx     # Per-section error boundary

seed.sql               # Database schema, RPC functions, seed data, RLS
```

## Tech Stack

- **Next.js 16** - App Router, React 19, TypeScript
- **Vercel AI SDK v6** - `generateText` (tool-calling), `streamObject` (streaming structured JSON), `useObject` (client-side partial object streaming)
- **Anthropic Claude** - claude-sonnet-4-20250514 for both phases
- **Supabase** - Postgres database with RPC functions and RLS
- **Zod 4** - Schema validation, shared between server and client
- **Recharts** - Bar and line chart rendering
- **Tailwind CSS v4** - Styling

## Seed Data

This project uses a fully synthetic dataset generated specifically for the assessment. The seed script creates ~5 campaigns, ~5 channels, and ~14 days of daily performance metrics (~350 rows) using `generate_series` with deterministic variation. The goal is to produce realistic-looking distributions (CTR, ROAS, spend) so prompts like "week-over-week trends" and "best performing channel" yield meaningful reports.

No real customer or production data is used.

## Error Handling

| Scenario                | Handling                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| Malformed AI output     | ErrorBoundary per section - catches render crashes, shows fallback with reset button          |
| Supabase query failures | Tool try/catch returns error string to LLM; LLM mentions data unavailability in its narrative |
| Streaming errors        | `error` from `useObject()` displayed as banner; stop button available                         |
| Missing/partial data    | Skeleton placeholders for sections awaiting required fields                                   |
| Missing env vars        | Lazy client defers validation to runtime; clear error message                                 |

## Trade-offs & Improvements

**Trade-offs made:**

- The two-phase approach means the user waits for all tool calls to complete before seeing the report stream. A tighter integration could show progress during data fetching, but the clean separation makes the pipeline easier to debug and extend.
- No authentication - the service role key is only used server-side, but there's no user auth layer.

**With more time, I would:**

- Add WebSocket or SSE progress events during Phase 1 so users see "Querying campaigns..." while tools run
- Add user authentication (Supabase Auth) and scope reports to individual users
- Add PDF/CSV export for generated reports
- Add a prompt history with autocomplete
- Add unit tests for the Zod schema validation and integration tests for the API route
- Add caching for repeated queries (same prompt within a time window)
- Add rate limiting on the API endpoint
- Support more visualisation types (pie chart, funnel, heatmap)
