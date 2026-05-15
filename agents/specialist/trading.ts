// ─── Trading specialist — read-only access to trading logs ────────────────
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const BASE = join(process.cwd(), '..', 'Trading Agent', 'trading_agent')

function readCSV(path: string, limit?: number): Record<string, string>[] {
  if (!existsSync(path)) return []
  const lines = readFileSync(path, 'utf-8').trim().split('\n')
  const headers = lines[0].split(',')
  let rows = lines.slice(1).map(line => Object.fromEntries(headers.map((h, i) => [h.trim(), (line.split(',')[i] ?? '').trim()])))
  if (limit) rows = rows.slice(-limit)
  return rows
}

export function executeTradingAction(action: string, params: Record<string, unknown>) {
  switch (action) {
    case 'get_risk_state': {
      try {
        const state = JSON.parse(readFileSync(join(BASE, 'logs', 'risk_state.json'), 'utf-8'))
        return { ok: true, message: 'Current risk state', data: state }
      } catch { return { ok: false, message: 'Could not read risk state' } }
    }
    case 'get_recent_trades': {
      const rows = readCSV(join(BASE, 'logs', 'trades.csv'), (params.limit as number) || 20)
      return { ok: true, message: `${rows.length} recent trades`, data: rows }
    }
    case 'get_today_trades': {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '.')
      const rows = readCSV(join(BASE, 'logs', 'trades.csv')).filter(r => r.close_time?.startsWith(today) || r.open_time?.startsWith(today))
      const profits = rows.map(r => parseFloat(r.profit)).filter(p => !isNaN(p))
      const pnl = profits.reduce((a, b) => a + b, 0)
      return { ok: true, message: `${rows.length} trades today, P&L $${pnl.toFixed(2)}`, data: { trades: rows, summary: { count: rows.length, pnl: pnl.toFixed(2), wins: profits.filter(p => p > 0).length, losses: profits.filter(p => p <= 0).length } } }
    }
    case 'get_performance_summary': {
      const rows = readCSV(join(BASE, 'logs', 'trades.csv'))
      const profits = rows.map(r => parseFloat(r.profit)).filter(p => !isNaN(p))
      if (!profits.length) return { ok: true, message: 'No closed trades', data: {} }
      const wins = profits.filter(p => p > 0).length
      const pnl = profits.reduce((a, b) => a + b, 0)
      const equity = profits.reduce((acc, p, i) => { acc.push((acc[i - 1] ?? 0) + p); return acc }, [] as number[])
      const peak = equity.reduce((m, v) => Math.max(m, v), 0)
      const maxDD = equity.reduce((m, v, i) => Math.min(m, v - Math.max(...equity.slice(0, i + 1))), 0)
      return { ok: true, message: 'Performance summary', data: { total: profits.length, wins, losses: profits.length - wins, winRate: `${(wins / profits.length * 100).toFixed(1)}%`, totalPnl: pnl.toFixed(2), avgTrade: (pnl / profits.length).toFixed(2), maxDrawdown: maxDD.toFixed(2) } }
    }
    case 'get_recent_predictions': {
      const limit = (params.limit as number) || 30
      const sym = params.symbol as string | undefined
      let rows = readCSV(join(BASE, 'logs', 'predictions.csv'), limit * 3)
      if (sym) rows = rows.filter(r => r.symbol === sym)
      return { ok: true, message: `${rows.slice(-limit).length} predictions`, data: rows.slice(-limit) }
    }
    default:
      return { ok: false, message: `Unknown action: ${action}` }
  }
}
