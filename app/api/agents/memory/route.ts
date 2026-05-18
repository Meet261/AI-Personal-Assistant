import { NextRequest, NextResponse } from 'next/server'
import { executeMemoryAction } from '@/agents/specialist/memory'

export async function POST(req: NextRequest) {
  const { action, params = {} } = await req.json()
  if (!action) return NextResponse.json({ ok: false, message: 'action required' }, { status: 400 })
  const result = await executeMemoryAction(action, params)
  return NextResponse.json(result)
}

export async function GET() {
  const result = await executeMemoryAction('get_summary', {})
  return NextResponse.json(result)
}
