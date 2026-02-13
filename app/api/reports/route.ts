import { supabaseAdmin } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';

// GET /api/reports — List saved reports
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('reports')
      .select('id, prompt, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch reports: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}

// POST /api/reports — Save a completed report
export async function POST(req: Request) {
  try {
    const { prompt, report_json } = await req.json();

    if (!prompt || !report_json) {
      return NextResponse.json(
        { error: 'Missing prompt or report_json' },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from('reports')
      .insert({ prompt, report_json })
      .select('id')
      .single();

    if (error) throw error;
    return NextResponse.json({ id: data.id });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to save report: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
