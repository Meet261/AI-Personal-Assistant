import { NextResponse } from 'next/server'

// DEPRECATED — no callers remain. Use /api/orchestrator directly.
export async function POST() {
  return NextResponse.json(
    { error: 'Deprecated. Use /api/orchestrator instead.' },
    { status: 410 }
  )
}
