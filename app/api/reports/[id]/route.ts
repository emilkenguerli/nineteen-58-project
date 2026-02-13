import { supabaseAdmin } from '@/lib/supabase-admin';
import { NextResponse } from 'next/server';

// GET /api/reports/[id] — Fetch a single report with full JSON
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const { data, error } = await supabaseAdmin
      .from('reports')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch report: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
