import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const TRADES_CSV = join(process.cwd(), '..', 'Trading Agent', 'trading_agent', 'logs', 'trades.csv')

type Trade = {
  close_time: string
  open_time:  string
  symbol:     string
  action:     string
  profit:     number
  lots:       number
  close_reason: string
}

function parseTrades(): Trade[] {
  if (!existsSync(TRADES_CSV)) return []
  const lines = readFileSync(TRADES_CSV, 'utf-8').trim().split('\n')
  const header = lines[0].split(',')
  const idx = (col: string) => header.indexOf(col)

  return lines.slice(1).map(line => {
    const cols = line.split(',')
    return {
      close_time:   cols[idx('close_time')]  ?? '',
      open_time:    cols[idx('open_time')]   ?? '',
      symbol:       cols[idx('symbol')]      ?? '',
      action:       cols[idx('action')]      ?? '',
      profit:       parseFloat(cols[idx('profit')] ?? '0') || 0,
      lots:         parseFloat(cols[idx('lots')]   ?? '0') || 0,
      close_reason: cols[idx('close_reason')] ?? '',
    }
  }).filter(t => t.close_time && t.symbol)
}

// CSV dates are "2026.05.15 11:00:58" — convert to comparable string
function csvDateToISO(d: string): string {
  return d.replace(/\./g, '-').replace(' ', 'T')
}

function buildWeeklyStats(trades: Trade[], weekStart: Date, weekEnd: Date) {
  const ws = format(weekStart, 'yyyy.MM.dd')
  const we = format(weekEnd,   'yyyy.MM.dd')

  const weekTrades = trades.filter(t => {
    const d = t.close_time.slice(0, 10) // "2026.05.15"
    return d >= ws && d <= we
  })

  if (!weekTrades.length) return null

  const profits  = weekTrades.map(t => t.profit)
  const wins     = weekTrades.filter(t => t.profit > 0)
  const losses   = weekTrades.filter(t => t.profit <= 0)
  const totalPnl = profits.reduce((a, b) => a + b, 0)
  const winRate  = (wins.length / weekTrades.length) * 100

  // Best and worst trade
  const best  = weekTrades.reduce((a, b) => b.profit > a.profit ? b : a)
  const worst = weekTrades.reduce((a, b) => b.profit < a.profit ? b : a)

  // Per-symbol breakdown
  const bySymbol: Record<string, { trades: number; pnl: number; wins: number }> = {}
  for (const t of weekTrades) {
    if (!bySymbol[t.symbol]) bySymbol[t.symbol] = { trades: 0, pnl: 0, wins: 0 }
    bySymbol[t.symbol].trades++
    bySymbol[t.symbol].pnl += t.profit
    if (t.profit > 0) bySymbol[t.symbol].wins++
  }

  // Per-day P&L
  const byDay: Record<string, number> = {}
  for (const t of weekTrades) {
    const day = t.close_time.slice(0, 10).replace(/\./g, '-')
    byDay[day] = (byDay[day] ?? 0) + t.profit
  }

  // Close reason breakdown
  const byReason: Record<string, number> = {}
  for (const t of weekTrades) {
    const r = t.close_reason || 'unknown'
    byReason[r] = (byReason[r] ?? 0) + 1
  }

  // Avg win / avg loss
  const avgWin  = wins.length  ? wins.reduce((s, t)   => s + t.profit, 0) / wins.length   : 0
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.profit, 0) / losses.length : 0
  const rr      = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0

  return {
    week_start:   format(weekStart, 'yyyy-MM-dd'),
    week_end:     format(weekEnd,   'yyyy-MM-dd'),
    total_trades: weekTrades.length,
    wins:         wins.length,
    losses:       losses.length,
    win_rate:     parseFloat(winRate.toFixed(1)),
    total_pnl:    parseFloat(totalPnl.toFixed(2)),
    avg_win:      parseFloat(avgWin.toFixed(2)),
    avg_loss:     parseFloat(avgLoss.toFixed(2)),
    risk_reward:  parseFloat(rr.toFixed(2)),
    best_trade:   { symbol: best.symbol, profit: best.profit, action: best.action, time: best.close_time },
    worst_trade:  { symbol: worst.symbol, profit: worst.profit, action: worst.action, time: worst.close_time },
    by_symbol:    bySymbol,
    by_day:       byDay,
    by_reason:    byReason,
  }
}

// GET — fetch stored weekly review or compute on-demand
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const weeksAgo = parseInt(searchParams.get('weeks_ago') ?? '1')

  const refDate  = subWeeks(new Date(), weeksAgo - 1)
  const weekStart = startOfWeek(refDate, { weekStartsOn: 1 }) // Monday
  const weekEnd   = endOfWeek(refDate,   { weekStartsOn: 1 }) // Sunday

  const weekKey = format(weekStart, 'yyyy-MM-dd')

  // Check if already stored
  const { data: stored } = await supabase
    .from('trading_weekly_reviews')
    .select('*')
    .eq('week_start', weekKey)
    .single()

  if (stored) return NextResponse.json({ ok: true, data: stored, cached: true })

  // Compute fresh
  const trades = parseTrades()
  const stats  = buildWeeklyStats(trades, weekStart, weekEnd)
  if (!stats) return NextResponse.json({ ok: false, message: 'No trades found for that week' })

  // Also fetch trade tags for setup breakdown
  const ws = format(weekStart, 'yyyy-MM-dd')
  const we = format(weekEnd, 'yyyy-MM-dd')
  const { data: tags } = await supabase
    .from('trade_tags')
    .select('setup_type,session_phase,market_regime,planned_vs_impulse')
    .gte('close_time', ws.replace(/-/g, '.'))
    .lte('close_time', we.replace(/-/g, '.') + ' 23:59:59')

  const setupBreakdown: Record<string, number> = {}
  const sessionBreakdown: Record<string, number> = {}
  for (const tag of tags ?? []) {
    if (tag.setup_type) setupBreakdown[tag.setup_type] = (setupBreakdown[tag.setup_type] ?? 0) + 1
    if (tag.session_phase) sessionBreakdown[tag.session_phase] = (sessionBreakdown[tag.session_phase] ?? 0) + 1
  }

  const review = { ...stats, setup_breakdown: setupBreakdown, session_breakdown: sessionBreakdown }

  return NextResponse.json({ ok: true, data: review, cached: false })
}

// POST — generate + store weekly review (called by cron)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const weeksAgo = parseInt(body.weeks_ago ?? '1')

  const refDate   = subWeeks(new Date(), weeksAgo - 1)
  const weekStart = startOfWeek(refDate, { weekStartsOn: 1 })
  const weekEnd   = endOfWeek(refDate,   { weekStartsOn: 1 })
  const weekKey   = format(weekStart, 'yyyy-MM-dd')

  // Idempotency
  const { data: existing } = await supabase
    .from('trading_weekly_reviews')
    .select('id')
    .eq('week_start', weekKey)
    .single()
  if (existing) return NextResponse.json({ ok: true, message: `Review for ${weekKey} already exists`, cached: true })

  const trades = parseTrades()
  const stats  = buildWeeklyStats(trades, weekStart, weekEnd)
  if (!stats) return NextResponse.json({ ok: false, message: `No trades found for week of ${weekKey}` })

  // Fetch tags
  const ws = format(weekStart, 'yyyy-MM-dd')
  const we = format(weekEnd, 'yyyy-MM-dd')
  const { data: tags } = await supabase
    .from('trade_tags')
    .select('setup_type,session_phase,market_regime,planned_vs_impulse')
    .gte('close_time', ws.replace(/-/g, '.'))
    .lte('close_time', we.replace(/-/g, '.') + ' 23:59:59')

  const setupBreakdown: Record<string, number> = {}
  const sessionBreakdown: Record<string, number> = {}
  for (const tag of tags ?? []) {
    if (tag.setup_type) setupBreakdown[tag.setup_type] = (setupBreakdown[tag.setup_type] ?? 0) + 1
    if (tag.session_phase) sessionBreakdown[tag.session_phase] = (sessionBreakdown[tag.session_phase] ?? 0) + 1
  }

  const review = { ...stats, setup_breakdown: setupBreakdown, session_breakdown: sessionBreakdown }

  const { error } = await supabase.from('trading_weekly_reviews').insert({
    week_start:        review.week_start,
    week_end:          review.week_end,
    total_trades:      review.total_trades,
    wins:              review.wins,
    losses:            review.losses,
    win_rate:          review.win_rate,
    total_pnl:         review.total_pnl,
    avg_win:           review.avg_win,
    avg_loss:          review.avg_loss,
    risk_reward:       review.risk_reward,
    best_trade:        review.best_trade,
    worst_trade:       review.worst_trade,
    by_symbol:         review.by_symbol,
    by_day:            review.by_day,
    by_reason:         review.by_reason,
    setup_breakdown:   review.setup_breakdown,
    session_breakdown: review.session_breakdown,
  })

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, message: `Weekly review saved for ${weekKey}`, data: review })
}
