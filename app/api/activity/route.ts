import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') || '50')

  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const { type, entity_type, entity_id, entity_title, meta, source } = await req.json()

  const { error } = await supabase.from('activity_log').insert({
    type,           // 'task_created' | 'task_updated' | 'task_deleted' | 'project_created' etc.
    entity_type,    // 'task' | 'project'
    entity_id,
    entity_title,
    meta,           // JSON blob with extra info (priority, status change, etc.)
    source,         // 'manual' | 'agent'
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
