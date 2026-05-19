import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// POST — save a trade tag (called by Python EA after each closed trade)
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { order_ticket, symbol, close_time, setup_type, session_phase, market_regime, planned_vs_impulse } = body

  if (!symbol || !close_time) {
    return NextResponse.json({ ok: false, message: 'symbol and close_time required' }, { status: 400 })
  }

  const { error } = await supabase.from('trade_tags').upsert({
    order_ticket: order_ticket || null,
    symbol,
    close_time,
    setup_type,
    session_phase,
    market_regime,
    planned_vs_impulse,
  }, { onConflict: 'symbol,close_time' })

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, message: `Tagged: ${setup_type} / ${session_phase}` })
}

// GET — fetch tags, optionally filtered by setup_type or date range
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const setup = searchParams.get('setup_type')
  const limit = parseInt(searchParams.get('limit') ?? '100')

  let q = supabase.from('trade_tags').select('*').order('close_time', { ascending: false }).limit(limit)
  if (setup) q = q.eq('setup_type', setup)

  const { data, error } = await q
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data, count: data?.length ?? 0 })
}
