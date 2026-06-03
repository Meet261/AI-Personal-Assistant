// ─── Trading specialist — read-only access to trading logs ────────────────
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const AITRADER_BASE  = join(process.cwd(), '..', 'Trading Agent', 'trading_agent')
const ALCHEMIST_BASE = join(process.cwd(), '..', 'Trading Agent', 'alchemist_mt5_trader')

export type TradeSource = 'aitrader' | 'alchemist' | 'both'

export interface NormalizedTrade {
  source: TradeSource
  symbol: string
  type: string
  open_time: string
  close_time: string
  open_price: string
  close_price: string
  volume: string
  sl: string
  tp: string
  profit: string
}

function readCSV(path: string, limit?: number): Record<string, string>[] {
  if (!existsSync(path)) return []
  const lines = readFileSync(path, 'utf-8').trim().split('\n')
  const headers = lines[0].split(',')
  let rows = lines.slice(1).map(line => {
    const cols = line.split(',')
    return Object.fromEntries(headers.map((h, i) => [h.trim(), (cols[i] ?? '').trim()]))
  })
  if (limit) rows = rows.slice(-limit)
  return rows
}

function readAITraderTrades(limit?: number): NormalizedTrade[] {
  const rows = readCSV(join(AITRADER_BASE, 'logs', 'trade_ledger.csv'))
  const closed = rows.filter(r => r.status === 'CLOSED' && r.profit !== '' && r.close_time !== '')
  const limited = limit ? closed.slice(-limit) : closed
  return limited.map(r => ({
    source: 'aitrader' as TradeSource,
    symbol:      r.symbol ?? '',
    type:        r.action ?? '',
    open_time:   r.open_time ?? '',
    close_time:  r.close_time ?? '',
    open_price:  r.entry_price ?? '',
    close_price: r.exit_price ?? '',
    volume:      r.lots ?? '',
    sl:          r.sl ?? '',
    tp:          r.tp ?? '',
    profit:      r.profit ?? '0',
  }))
}

function readAlchemistTrades(limit?: number): NormalizedTrade[] {
  const rows = readCSV(join(ALCHEMIST_BASE, 'logs', 'alchemist_signals.csv'))
  const dealOuts = rows.filter(r => r.event_type === 'DEAL_OUT' && r.pos_total_profit !== '' && r.pos_exit_time !== '')
  const limited = limit ? dealOuts.slice(-limit) : dealOuts
  return limited.map(r => ({
    source: 'alchemist' as TradeSource,
    symbol:      r.symbol ?? '',
    type:        r.model_action ?? r.deal_type ?? '',
    open_time:   r.pos_entry_time ?? '',
    close_time:  r.pos_exit_time ?? '',
    open_price:  r.pos_entry_price ?? r.entry_price ?? '',
    close_price: r.pos_exit_price ?? r.deal_price ?? '',
    volume:      r.volume ?? '',
    sl:          r.sl_price ?? '',
    tp:          r.tp_price ?? '',
    profit:      r.pos_total_profit ?? r.deal_profit ?? '0',
  }))
}

function getTrades(source: TradeSource, limit?: number): NormalizedTrade[] {
  if (source === 'aitrader')  return readAITraderTrades(limit)
  if (source === 'alchemist') return readAlchemistTrades(limit)
  // both — merge and sort by close_time descending
  const combined = [...readAITraderTrades(), ...readAlchemistTrades()]
  combined.sort((a, b) => (a.close_time < b.close_time ? 1 : -1))
  return limit ? combined.slice(0, limit) : combined
}

function calcSummary(trades: NormalizedTrade[]) {
  const profits = trades.map(r => parseFloat(r.profit)).filter(p => !isNaN(p))
  if (!profits.length) return null
  const wins = profits.filter(p => p > 0).length
  const pnl  = profits.reduce((a, b) => a + b, 0)
  const equity = profits.reduce((acc, p, i) => { acc.push((acc[i - 1] ?? 0) + p); return acc }, [] as number[])
  const maxDD = equity.reduce((m, v, i) => Math.min(m, v - Math.max(...equity.slice(0, i + 1))), 0)
  return {
    total: profits.length,
    wins,
    losses: profits.length - wins,
    winRate: `${(wins / profits.length * 100).toFixed(1)}%`,
    totalPnl: pnl.toFixed(2),
    avgTrade: (pnl / profits.length).toFixed(2),
    maxDrawdown: maxDD.toFixed(2),
  }
}

export function executeTradingAction(action: string, params: Record<string, unknown>) {
  try {
    const source: TradeSource = (params.source as TradeSource) || 'aitrader'

    switch (action) {
      case 'get_risk_state': {
        try {
          const state = JSON.parse(readFileSync(join(AITRADER_BASE, 'logs', 'risk_state.json'), 'utf-8'))
          return { ok: true, message: 'Current risk state', data: state }
        } catch { return { ok: false, message: 'Could not read risk state' } }
      }

      case 'get_recent_trades': {
        const limit = (params.limit as number) || 100
        const rows = getTrades(source, limit)
        return { ok: true, message: `${rows.length} recent trades`, data: rows }
      }

      case 'get_today_trades': {
        const today = new Date().toISOString().slice(0, 10)
        const allRows = getTrades(source)
        // Alchemist uses ISO dates, AITrader uses dot-separated YYYY.MM.DD HH:MM:SS
        const rows = allRows.filter(r => {
          const ct = r.close_time
          return ct.startsWith(today) || ct.startsWith(today.replace(/-/g, '.'))
        })
        const profits = rows.map(r => parseFloat(r.profit)).filter(p => !isNaN(p))
        const pnl = profits.reduce((a, b) => a + b, 0)
        return {
          ok: true,
          message: `${rows.length} trades today, P&L $${pnl.toFixed(2)}`,
          data: {
            trades: rows,
            summary: { count: rows.length, pnl: pnl.toFixed(2), wins: profits.filter(p => p > 0).length, losses: profits.filter(p => p <= 0).length },
          },
        }
      }

      case 'get_performance_summary': {
        const rows = getTrades(source)
        const perf = calcSummary(rows)
        if (!perf) return { ok: true, message: 'No closed trades', data: {} }
        return { ok: true, message: 'Performance summary', data: perf }
      }

      case 'get_recent_predictions': {
        const limit = (params.limit as number) || 30
        const sym = params.symbol as string | undefined
        let rows = readCSV(join(AITRADER_BASE, 'logs', 'predictions.csv'), limit * 3)
        if (sym) rows = rows.filter(r => r.symbol === sym)
        return { ok: true, message: `${rows.slice(-limit).length} predictions`, data: rows.slice(-limit) }
      }

      default:
        return { ok: false, message: `Unknown action: ${action}` }
    }
  } catch (err) {
    return { ok: false, message: `Trading action failed: ${String(err)}` }
  }
}
