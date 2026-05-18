import { NextResponse } from 'next/server'
import { executeTradingAction } from '@/agents/specialist/trading'

export async function GET() {
  const result = await executeTradingAction('get_recent_trades', { limit: 100 })
  return NextResponse.json(result)
}
