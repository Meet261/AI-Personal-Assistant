import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const TRADES_CSV = join(process.cwd(), '..', 'Trading Agent', 'trading_agent', 'logs', 'trades.csv')
const RISK_JSON  = join(process.cwd(), '..', 'Trading Agent', 'trading_agent', 'logs', 'risk_state.json')

function parseCSV(text: string) {
  const lines = text.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim())
  return lines.slice(1).map(line => {
    const vals = line.split(',')
    return Object.fromEntries(headers.map((h, i) => [h, vals[i]?.trim() ?? '']))
  })
}

export async function GET() {
  try {
    let trades: Record<string, string>[] = []
    let openPositions: Record<string, boolean> = {}
    let tradingRunning = false

    // Check if trading agent is up
    try {
      const r = await fetch('http://localhost:8000/health', { signal: AbortSignal.timeout(1000) })
      tradingRunning = r.ok
    } catch {}

    if (existsSync(TRADES_CSV)) {
      trades = parseCSV(readFileSync(TRADES_CSV, 'utf-8'))
    }

    if (existsSync(RISK_JSON)) {
      const risk = JSON.parse(readFileSync(RISK_JSON, 'utf-8'))
      openPositions = risk.open_positions ?? {}
    }

    const profits = trades.map(t => parseFloat(t.profit)).filter(p => !isNaN(p))
    const totalPnl = profits.reduce((a, b) => a + b, 0)
    const wins = profits.filter(p => p > 0).length
    const losses = profits.filter(p => p <= 0).length
    const winRate = profits.length > 0 ? wins / profits.length : 0
    const openCount = Object.values(openPositions).filter(Boolean).length

    // Today's trades
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '.')
    const todayTrades = trades.filter(t => t.close_time?.startsWith(today) || t.open_time?.startsWith(today))
    const todayPnl = todayTrades.map(t => parseFloat(t.profit)).filter(p => !isNaN(p)).reduce((a, b) => a + b, 0)

    return NextResponse.json({
      running: tradingRunning,
      total_trades: profits.length,
      total_pnl: Math.round(totalPnl * 100) / 100,
      today_pnl: Math.round(todayPnl * 100) / 100,
      today_trades: todayTrades.length,
      wins,
      losses,
      win_rate: Math.round(winRate * 1000) / 10,
      open_positions: openCount,
      symbols: Object.entries(openPositions)
        .filter(([, v]) => v)
        .map(([k]) => k),
    })
  } catch (e) {
    return NextResponse.json({ error: String(e), running: false }, { status: 500 })
  }
}
