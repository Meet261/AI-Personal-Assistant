import { NextResponse } from 'next/server'
import { runTradingJournalSchedulerCascade } from '@/agents/cascade/trading-journal-scheduler'

// POST /api/agents/cascade — run full cascade manually or from cron
export async function POST() {
  const result = await runTradingJournalSchedulerCascade()
  return NextResponse.json(result)
}

// GET /api/agents/cascade — quick status check
export async function GET() {
  return NextResponse.json({ ok: true, message: 'Cascade endpoint ready. POST to run.' })
}
