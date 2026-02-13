# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Next.js dev server at http://localhost:3000
npm run build    # Production build
npm run lint     # ESLint
```

Requires **Node.js 20+** (`nvm use 20`). No test framework is configured.
**IMPORTANT: Always run `source ~/.nvm/nvm.sh && nvm use 20` before ANY npm/npx command.** Chain it in the same shell invocation since shell state does not persist between commands.

## Environment

Copy `.env.example` to `.env.local` with:

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, never expose to client
- `ANTHROPIC_API_KEY` — Claude API key

The Supabase client uses lazy initialization (Proxy pattern in `lib/supabase-admin.ts`) so `next build` succeeds without env vars. Errors surface at runtime.

## Architecture

This is a generative reporting tool: user types a natural language prompt → LLM queries Supabase via tool-calling → streams back a structured JSON report that renders progressively.

### Two-Phase Streaming

The AI SDK's `streamObject` doesn't support tool-calling, so the API route (`app/api/report/route.ts`) uses two phases:

1. **Phase 1** — `generateText` with `reportTools`: Claude calls Supabase RPCs (up to 10 steps via `stepCountIs`) and produces a text summary of findings
2. **Phase 2** — `streamObject` with `reportSchema`: Claude generates schema-constrained streaming JSON from the data summary

Client receives incremental updates via `experimental_useObject` from `@ai-sdk/react`, which yields a `DeepPartial<Report>`.

### Schema as Single Source of Truth

`lib/schema.ts` defines a Zod discriminated union on the `visualisation` field with 4 section types: `kpi_card`, `table`, `bar_chart`, `line_chart`. This schema is imported by both the server (`streamObject`) and client (`useObject`). All TypeScript types are inferred from it.

### Tool → Supabase Bridge

`lib/tools.ts` defines 4 tools (`listCampaigns`, `listChannels`, `getMetrics`, `getTimeseries`) that call Supabase RPC functions. All return `{ ok: true, data }` or `{ ok: false, error }` so the LLM can adapt its narrative on failures.

### Rendering Pipeline

`SectionRenderer` dispatches by `section.visualisation` and enforces **readiness gates** — each section type only mounts its visualizer when minimum required fields have arrived (e.g., table needs `columns` AND `rows`). Until then, shows a skeleton. Each section is wrapped in an `ErrorBoundary` to isolate malformed AI output.

### Persistence

Auto-saves completed reports to Supabase (`reports` table) via `POST /api/reports`. History page at `/reports` fetches list and re-renders from stored JSON.

## Database

`seed.sql` creates 4 tables (`campaigns`, `channels`, `daily_metrics`, `reports`), 4 RPC functions with `SECURITY DEFINER`, RLS policies, and ~350 rows of deterministic seed data. INSERTs use `ON CONFLICT DO NOTHING` for idempotency. The `get_timeseries` function whitelists metric columns (no dynamic SQL).

A GitHub Actions workflow (`.github/workflows/seed-database.yml`) applies migrations on push via the Supabase CLI (`supabase db push`), using `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, and `SUPABASE_DB_PASSWORD` secrets.

## SDK Version Gotchas

- **AI SDK v6**: tools use `inputSchema` (not `parameters`), step limiting uses `stopWhen: stepCountIs(N)` (not `maxSteps`), `streamObject` has no `tools` support
- **Zod 4**: `z.record()` requires 2 args (`z.record(z.string(), valueSchema)`), `z.discriminatedUnion()` takes the discriminator key name as first arg
- **Tailwind v4**: uses `@tailwindcss/postcss` plugin, not the legacy `tailwindcss` PostCSS plugin
- **Next.js 16 App Router**: dynamic route params are `Promise<{ id: string }>` (must be awaited)
- **Model**: Both phases use `claude-sonnet-4-20250514`

## Git Policy

**Do NOT stage, commit, or push.** The user handles all git operations. Never run `git add`, `git commit`, `git push`, or any destructive git commands.

## Adding a New Visualization Type

1. Add a new case to the discriminated union in `lib/schema.ts`
2. Create the component in `components/`
3. Add a case + readiness gate in `section-renderer.tsx`'s `renderVisualisation()`
4. Update the Phase 2 system prompt in `app/api/report/route.ts` to describe when to use it
