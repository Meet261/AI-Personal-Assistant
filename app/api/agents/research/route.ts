import { NextRequest, NextResponse } from 'next/server'
import { executeResearchAction } from '@/agents/specialist/research'

export async function POST(req: NextRequest) {
  const { action, params = {} } = await req.json()
  if (!action) return NextResponse.json({ ok: false, message: 'action required' }, { status: 400 })
  const result = await executeResearchAction(action, params)
  return NextResponse.json(result)
}
