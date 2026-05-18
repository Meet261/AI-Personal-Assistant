import { NextResponse } from 'next/server'
import { executeTradingAction } from '@/agents/specialist/trading'

export async function GET() {
  const result = await executeTradingAction('get_today_trades', {})
  return NextResponse.json(result)
}
