import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY!
)

// Fetch all conversation sessions (metadata only for list, messages for a specific session)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('session_id')
  const mode = searchParams.get('mode') // 'sessions' | 'messages' | 'context'

  if (mode === 'context') {
    // Load recent messages (last 7 days full) + older summaries for AI context
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const [recentRes, summaryRes] = await Promise.all([
      supabase
        .from('agent_messages')
        .select('role, content, created_at, session_id')
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: true })
        .limit(200),
      supabase
        .from('agent_sessions')
        .select('summary, started_at')
        .lt('started_at', sevenDaysAgo)
        .not('summary', 'is', null)
        .order('started_at', { ascending: false })
        .limit(10),
    ])

    return NextResponse.json({
      recentMessages: recentRes.data || [],
      oldSummaries: summaryRes.data || [],
    })
  }

  if (mode === 'messages' && sessionId) {
    const { data } = await supabase
      .from('agent_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
    return NextResponse.json(data || [])
  }

  // Default: list sessions, optionally filtered by agent_id
  const agentId = searchParams.get('agent_id')
  let q = supabase.from('agent_sessions').select('*').order('started_at', { ascending: false }).limit(50)
  if (agentId) q = q.eq('agent_id', agentId)
  const { data } = await q
  return NextResponse.json(data || [])
}

// Save a message or create/update a session
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  if (action === 'create_session') {
    const { agent_id = 'assistant' } = body
    const { data, error } = await supabase
      .from('agent_sessions')
      .insert({ started_at: new Date().toISOString(), message_count: 0, agent_id })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  if (action === 'save_message') {
    const { session_id, role, content, tool_results } = body
    const { error } = await supabase
      .from('agent_messages')
      .insert({ session_id, role, content, tool_results: tool_results || null })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Increment message count
    const { data: session } = await supabase
      .from('agent_sessions')
      .select('message_count')
      .eq('id', session_id)
      .single()
    if (session) {
      await supabase
        .from('agent_sessions')
        .update({ message_count: (session.message_count || 0) + 1, last_message_at: new Date().toISOString() })
        .eq('id', session_id)
    }

    return NextResponse.json({ ok: true })
  }

  if (action === 'save_summary') {
    const { session_id, summary, title } = body
    const { error } = await supabase
      .from('agent_sessions')
      .update({ summary, title })
      .eq('id', session_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('session_id')
  if (!sessionId) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })

  await supabase.from('agent_messages').delete().eq('session_id', sessionId)
  await supabase.from('agent_sessions').delete().eq('id', sessionId)
  return NextResponse.json({ ok: true })
}
