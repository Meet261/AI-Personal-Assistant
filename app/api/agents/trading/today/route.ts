import { NextResponse } from 'next/server'
import { executeTradingAction } from '@/agents/specialist/trading'

type RawTrade = Record<string, string>

function normalizeTrade(r: RawTrade) {
  return {
    symbol:      r.symbol ?? '',
    type:        r.action ?? r.type ?? '',
    open_time:   r.open_time ?? '',
    close_time:  r.close_time ?? '',
    open_price:  r.entry_price ?? r.open_price ?? '',
    close_price: r.exit_price ?? r.close_price ?? '',
    volume:      r.lots ?? r.volume ?? '',
    profit:      r.profit ?? '0',
  }
}

export async function GET() {
  const result = await executeTradingAction('get_today_trades', {})
  const data = result.data as { trades: RawTrade[]; summary: unknown } | null
  return NextResponse.json({
    ...result,
    data: {
      trades: (data?.trades ?? []).map(normalizeTrade),
      summary: data?.summary,
    },
  })
}
