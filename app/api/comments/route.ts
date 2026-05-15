import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function GET(req: NextRequest) {
  const task_id = new URL(req.url).searchParams.get('task_id')
  if (!task_id) return NextResponse.json([])
  const { data } = await supabase
    .from('task_comments')
    .select('*')
    .eq('task_id', task_id)
    .order('created_at')
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const { task_id, body } = await req.json()
  const { data, error } = await supabase
    .from('task_comments')
    .insert({ task_id, body })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const { error } = await supabase.from('task_comments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
