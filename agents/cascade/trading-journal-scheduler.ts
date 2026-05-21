// ─── Trading → Journal → Scheduler Cascade ────────────────────────────────
// Runs nightly at 21:00 via cron.
// 1. Read today's trading performance
// 2. Auto-create journal prompts based on trading outcome
// 3. Push scheduler alerts based on combined trading + energy state

import { createClient } from '@supabase/supabase-js'
import { executeTradingAction } from '../specialist/trading'
import { executeJournalAction } from '../specialist/journal'
import { callDeepSeekChat } from '../shared/models'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// Thresholds
const BAD_DAY_LOSS    = -20   // USD — day P&L below this = bad day
const GOOD_DAY_WIN    =  30   // USD — day P&L above this = good day
const LOW_ENERGY      =   2   // 1-5 scale — energy below this = low energy
const HIGH_ENERGY     =   4   // 1-5 scale — energy above this = high energy

interface CascadeResult {
  ok: boolean
  tradingPnl: number | null
  tradingOutcome: 'good' | 'bad' | 'neutral' | 'no_trades'
  energyLevel: number | null
  alertsPushed: string[]
  journalPrompt: string | null
}

export async function runTradingJournalSchedulerCascade(): Promise<CascadeResult> {
  const today = new Date().toISOString().slice(0, 10)
  const alertsPushed: string[] = []

  // ── Step 1: Read today's trading ────────────────────────────────────────
  // get_today_trades returns { data: { trades: Trade[], summary: {...} } }
  const tradingResult = executeTradingAction('get_today_trades', {})
  const rawData = tradingResult.data as { trades?: unknown[]; summary?: { pnl?: string; count?: number } } | null
  const trades = Array.isArray(rawData?.trades) ? rawData.trades : []

  let todayPnl: number | null = null
  let tradingOutcome: CascadeResult['tradingOutcome'] = 'no_trades'

  if (trades.length > 0) {
    // Use pre-computed PnL from summary if available, else sum from trades
    todayPnl = rawData?.summary?.pnl !== undefined
      ? parseFloat(String(rawData.summary.pnl))
      : trades.reduce((sum: number, t: unknown) => {
          const trade = t as { profit?: string | number }
          const p = parseFloat(String(trade.profit ?? 0))
          return sum + (isNaN(p) ? 0 : p)
        }, 0)

    if (todayPnl !== null && todayPnl <= BAD_DAY_LOSS) tradingOutcome = 'bad'
    else if (todayPnl !== null && todayPnl >= GOOD_DAY_WIN) tradingOutcome = 'good'
    else tradingOutcome = 'neutral'
  }

  // ── Step 2: Read today's journal energy ──────────────────────────────────
  const journalResult = await executeJournalAction('get_today_entry', {})
  const journalEntry = journalResult.data as { energy_level?: number; completed_today?: string; blocked_or_pushed?: string } | null
  const energyLevel = journalEntry?.energy_level ?? null

  // ── Step 3: Generate journal reflection prompt based on trading outcome ──
  let journalPrompt: string | null = null

  if (tradingOutcome !== 'no_trades') {
    const promptContext = `
Trading today: ${trades.length} trades, P&L: $${todayPnl?.toFixed(2)}
Outcome: ${tradingOutcome}
Energy today: ${energyLevel ? `${energyLevel}/5` : 'not logged'}
`
    const systemPrompt = 'You write short, honest journal reflection prompts. 1-2 sentences max. Direct, no fluff.'

    if (tradingOutcome === 'bad') {
      journalPrompt = await callDeepSeekChat(
        [{ role: 'user', content: `Write a calm, non-judgmental journal reflection prompt for a trader who had a losing day (P&L: $${todayPnl?.toFixed(2)}). Focus on learning and mental reset, not the money.${promptContext}` }],
        systemPrompt
      ).catch(() => `Today's trading resulted in a $${Math.abs(todayPnl ?? 0).toFixed(2)} loss. What did you learn, and how will you reset for tomorrow?`)
    } else if (tradingOutcome === 'good') {
      journalPrompt = await callDeepSeekChat(
        [{ role: 'user', content: `Write a grounding journal reflection prompt for a trader who had a winning day (P&L: +$${todayPnl?.toFixed(2)}). Encourage staying disciplined, not overconfident.${promptContext}` }],
        systemPrompt
      ).catch(() => `Strong trading day (+$${todayPnl?.toFixed(2)}). What worked well, and how do you stay disciplined tomorrow?`)
    }

    // Save the prompt as a journal note if no entry yet today
    if (journalPrompt && !journalEntry) {
      await executeJournalAction('save_entry', {
        energy_level: null,
        completed_today: null,
        blocked_or_pushed: null,
        tomorrow_focus: journalPrompt,
      }).catch(() => {})
    }
  }

  // ── Step 4: Push scheduler alerts based on combined state ────────────────

  // Bad trading day alert
  if (tradingOutcome === 'bad') {
    await supabase.from('scheduler_alerts').insert({
      title: `Losing day — $${Math.abs(todayPnl ?? 0).toFixed(2)} loss`,
      body: journalPrompt ?? 'Review your trades tonight before tomorrow\'s session.',
      priority: 'high',
      agent_id: 'cascade',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    alertsPushed.push('trading:bad_day')
  }

  // Good trading day — positive reinforcement
  if (tradingOutcome === 'good') {
    await supabase.from('scheduler_alerts').insert({
      title: `Strong trading day — +$${todayPnl?.toFixed(2)}`,
      body: journalPrompt ?? 'Good execution today. Stay consistent tomorrow.',
      priority: 'low',
      agent_id: 'cascade',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    alertsPushed.push('trading:good_day')
  }

  // Low energy + trading = extra rest recommendation
  if (energyLevel !== null && energyLevel <= LOW_ENERGY && tradingOutcome !== 'no_trades') {
    await supabase.from('scheduler_alerts').insert({
      title: 'Low energy day with active trading',
      body: `Energy ${energyLevel}/5 on a trading day. Consider lighter position sizes or rest tomorrow.`,
      priority: 'medium',
      agent_id: 'cascade',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    alertsPushed.push('health:low_energy_trading')
  }

  // High energy + no journal check-in = nudge to log
  if (energyLevel === null && tradingOutcome !== 'no_trades') {
    await supabase.from('scheduler_alerts').insert({
      title: 'No journal check-in today',
      body: 'You traded today but haven\'t logged your energy or reflection. Take 2 minutes tonight.',
      priority: 'low',
      agent_id: 'cascade',
      expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    })
    alertsPushed.push('journal:missing_checkin')
  }

  // ── Step 5: Detect multi-day patterns ────────────────────────────────────
  // If losing 3+ days in a row → urgent alert to pause and review
  const recentResult = executeTradingAction('get_recent_trades', { limit: 15 })
  if (recentResult.ok && Array.isArray(recentResult.data) && recentResult.data.length >= 3) {
    const recent = recentResult.data as { profit?: string | number; close_time?: string }[]

    // Group by day and check last 3 days
    const byDay: Record<string, number> = {}
    for (const t of recent) {
      const d = (t.close_time ?? '').slice(0, 10)
      if (!d) continue
      const p = parseFloat(String(t.profit ?? 0))
      byDay[d] = (byDay[d] ?? 0) + (isNaN(p) ? 0 : p)
    }
    const sortedDays = Object.entries(byDay).sort(([a], [b]) => b.localeCompare(a)).slice(0, 3)
    const lastThreeLosing = sortedDays.length === 3 && sortedDays.every(([, pnl]) => pnl < 0)

    if (lastThreeLosing) {
      const totalLoss = sortedDays.reduce((s, [, p]) => s + p, 0)
      await supabase.from('scheduler_alerts').insert({
        title: '⚠️ 3 consecutive losing days',
        body: `Total loss over 3 days: $${Math.abs(totalLoss).toFixed(2)}. Consider reviewing your strategy or taking a break.`,
        priority: 'urgent',
        agent_id: 'cascade',
        expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      })
      alertsPushed.push('trading:3day_losing_streak')
    }
  }

  return {
    ok: true,
    tradingPnl: todayPnl,
    tradingOutcome,
    energyLevel,
    alertsPushed,
    journalPrompt,
  }
}
