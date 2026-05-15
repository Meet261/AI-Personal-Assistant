import { NextRequest, NextResponse } from 'next/server'
import { executeHabitAction } from '@/agents/specialist/habit-tracker'

// GET /api/agents/habit?action=get_habits
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action') ?? 'get_habits'
  const result = await executeHabitAction(action, {})
  return NextResponse.json(result)
}

// POST /api/agents/habit  { action, params }
export async function POST(req: NextRequest) {
  const { action, params = {} } = await req.json()
  if (!action) return NextResponse.json({ ok: false, message: 'action required' }, { status: 400 })
  const result = await executeHabitAction(action, params)
  return NextResponse.json(result)
}
