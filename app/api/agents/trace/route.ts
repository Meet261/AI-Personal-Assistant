import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function GET(req: NextRequest) {
  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '100')
  const agent = req.nextUrl.searchParams.get('agent')

  let q = supabase
    .from('agent_intent_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (agent && agent !== 'all') q = q.eq('primary_agent', agent)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ logs: data ?? [] })
}
