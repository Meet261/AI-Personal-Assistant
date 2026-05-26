import { NextResponse } from 'next/server'
import { executeTradingAction, type TradeSource } from '@/agents/specialist/trading'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const source = (searchParams.get('source') ?? 'both') as TradeSource

    let running = false
    try {
      const r = await fetch('http://localhost:8000/health', { signal: AbortSignal.timeout(1000) })
      running = r.ok
    } catch {}

    const [summary, todayResult, riskResult] = await Promise.all([
      executeTradingAction('get_performance_summary', { source }),
      executeTradingAction('get_today_trades', { source }),
      executeTradingAction('get_risk_state', {}),
    ])

    const perf = summary.data as {
      total: number; wins: number; losses: number
      winRate: string; totalPnl: string; avgTrade: string; maxDrawdown: string
    } | null

    const todayData = (todayResult.data as { trades: unknown[]; summary: { count: number; pnl: string; wins: number; losses: number } } | null)
    const risk = riskResult.data as { open_positions?: Record<string, boolean> } | null

    const openPositions = running ? (risk?.open_positions ?? {}) : {}
    const openCount = Object.values(openPositions).filter(Boolean).length
    const symbols = Object.entries(openPositions).filter(([, v]) => v).map(([k]) => k)

    return NextResponse.json({
      running,
      total_trades: perf?.total ?? 0,
      total_pnl: parseFloat(perf?.totalPnl ?? '0'),
      today_pnl: parseFloat(todayData?.summary?.pnl ?? '0'),
      today_trades: todayData?.summary?.count ?? 0,
      wins: perf?.wins ?? 0,
      losses: perf?.losses ?? 0,
      win_rate: parseFloat(perf?.winRate ?? '0'),
      open_positions: openCount,
      symbols,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e), running: false }, { status: 500 })
  }
}
