import { NextResponse } from 'next/server'
import { executeTradingAction, type TradeSource } from '@/agents/specialist/trading'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const source = (searchParams.get('source') ?? 'aitrader') as TradeSource
  const result = await executeTradingAction('get_today_trades', { source })
  return NextResponse.json(result)
}
