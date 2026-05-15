import { NextRequest, NextResponse } from 'next/server'
import { executeJournalAction } from '@/agents/specialist/journal'

// GET /api/agents/journal?action=get_today_entry
// POST /api/agents/journal  { action, params }
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action') ?? 'get_today_entry'
  const days = req.nextUrl.searchParams.get('days')
  const logType = req.nextUrl.searchParams.get('log_type')
  const params: Record<string, unknown> = {}
  if (days) params.days = parseInt(days)
  if (logType) params.log_type = logType
  const result = await executeJournalAction(action, params)
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const { action, params = {} } = await req.json()
  if (!action) return NextResponse.json({ ok: false, message: 'action required' }, { status: 400 })
  const result = await executeJournalAction(action, params)
  return NextResponse.json(result)
}
