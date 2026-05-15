import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { executeKnowledgeAction } from '@/agents/specialist/knowledge'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('project_id')
  const status = searchParams.get('status')
  const favorite = searchParams.get('favorite')

  let query = supabase.from('research_papers').select('*').order('created_at', { ascending: false })
  if (projectId) query = query.eq('project_id', projectId)
  if (status) query = query.eq('reading_status', status)
  if (favorite === 'true') query = query.eq('favorite', true)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { data, error } = await supabase
    .from('research_papers')
    .insert(body)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Auto-embed into ChromaDB (fire-and-forget — don't block the response)
  if (data?.id) {
    executeKnowledgeAction('embed_paper', { paper_id: data.id }).catch(() => {})
  }
  return NextResponse.json(data)
}

// Bulk upsert for migration
export async function PUT(req: NextRequest) {
  const body = await req.json()
  const rows: unknown[] = Array.isArray(body) ? body : body.papers
  if (!rows?.length) return NextResponse.json({ ok: true, inserted: 0 })
  const { error } = await supabase
    .from('research_papers')
    .upsert(rows as never[], { onConflict: 'id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, inserted: rows.length })
}

export async function PATCH(req: NextRequest) {
  const { id, ...updates } = await req.json()
  const { data, error } = await supabase
    .from('research_papers')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const { error } = await supabase.from('research_papers').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Remove from ChromaDB index (fire-and-forget)
  executeKnowledgeAction('remove_paper', { paper_id: id }).catch(() => {})
  return NextResponse.json({ ok: true })
}
