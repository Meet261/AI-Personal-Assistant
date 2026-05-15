import { NextRequest, NextResponse } from 'next/server'
import { executeEmailAction } from '@/agents/specialist/email'

// GET /api/agents/email?action=get_unread_count
// GET /api/agents/email?action=fetch_inbox&limit=10&unread_only=true
export async function GET(req: NextRequest) {
  const action     = req.nextUrl.searchParams.get('action') ?? 'get_unread_count'
  const limit      = parseInt(req.nextUrl.searchParams.get('limit') ?? '10')
  const unreadOnly = req.nextUrl.searchParams.get('unread_only') !== 'false'
  const result = await executeEmailAction(action, { limit, unread_only: unreadOnly })
  return NextResponse.json(result)
}

// POST /api/agents/email  { action, params }
// Actions: fetch_inbox, read_email, triage_inbox, summarize_email,
//          draft_reply, send_email, send_reply, search_emails, get_unread_count
export async function POST(req: NextRequest) {
  const { action, params = {} } = await req.json()
  if (!action) return NextResponse.json({ ok: false, message: 'action required' }, { status: 400 })
  const result = await executeEmailAction(action, params)
  return NextResponse.json(result)
}
