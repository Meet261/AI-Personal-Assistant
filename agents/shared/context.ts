// ─── Context builder — gathers live data from all domains ─────────────────
// Called once per orchestrator request. Cheap reads only — no LLM calls.

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { AgentContext } from './types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const TRADING_BASE = join(process.cwd(), '..', 'Trading Agent', 'trading_agent', 'logs')

export async function buildAgentContext(): Promise<AgentContext> {
  const today = new Date().toISOString().slice(0, 10)
  const todayDot = today.replace(/-/g, '.')

  const [
    { data: tasks },
    { data: projects },
    { data: researchPapers },
    { data: journalRows },
  ] = await Promise.all([
    supabase.from('tasks').select('title,priority,deadline,status').neq('status', 'done').order('priority').limit(20),
    supabase.from('projects').select('name,status').eq('status', 'active'),
    supabase.from('research_papers').select('title,reading_status').in('reading_status', ['reading', 'important']).limit(5),
    supabase.from('journal_entries').select('energy_level,completed_today,blocked_or_pushed').eq('date', today).limit(1),
  ])
  const journalEntry = journalRows?.[0] ?? null

  // Trading context from files
  let tradingToday: AgentContext['tradingToday']
  try {
    const lines = readFileSync(join(TRADING_BASE, 'trades.csv'), 'utf-8').trim().split('\n')
    const todayTrades = lines.slice(1).filter(l => l.includes(todayDot))
    const profits = todayTrades.map(l => parseFloat(l.split(',')[11])).filter(p => !isNaN(p))
    const state = existsSync(join(TRADING_BASE, 'risk_state.json'))
      ? JSON.parse(readFileSync(join(TRADING_BASE, 'risk_state.json'), 'utf-8'))
      : {}
    tradingToday = {
      pnl: Math.round(profits.reduce((a, b) => a + b, 0) * 100) / 100,
      trades: profits.length,
      wins: profits.filter(p => p > 0).length,
      openPositions: Object.entries(state.open_positions ?? {}).filter(([, v]) => v).map(([k]) => k),
    }
  } catch { tradingToday = undefined }

  return {
    tasks: tasks ?? [],
    projects: projects ?? [],
    tradingToday,
    researchActive: (researchPapers ?? []).map(p => ({ title: p.title, status: p.reading_status })),
    journalToday: journalEntry ? {
      energy: journalEntry.energy_level,
      completed: journalEntry.completed_today,
      blocked: journalEntry.blocked_or_pushed,
    } : null,
  }
}

export function contextToString(ctx: AgentContext, date: string): string {
  const parts: string[] = [`Date: ${date}`]

  if (ctx.projects?.length)
    parts.push(`Active projects: ${ctx.projects.map(p => p.name).join(', ')}`)

  if (ctx.tasks?.length)
    parts.push(`Open tasks (top): ${ctx.tasks.slice(0, 8).map(t => `"${t.title}"[${t.priority}]`).join(', ')}`)

  if (ctx.tradingToday)
    parts.push(`Trading today: ${ctx.tradingToday.trades} trades, ${ctx.tradingToday.wins}W/${ctx.tradingToday.trades - ctx.tradingToday.wins}L, P&L $${ctx.tradingToday.pnl}${ctx.tradingToday.openPositions.length ? `, open: ${ctx.tradingToday.openPositions.join('+')}` : ''}`)

  if (ctx.researchActive?.length)
    parts.push(`Research in progress: ${ctx.researchActive.map(p => p.title).join(', ')}`)

  if (ctx.journalToday)
    parts.push(`Today's energy: ${ctx.journalToday.energy}/5. Completed: ${ctx.journalToday.completed}`)

  if (ctx.schedulerAlerts?.length)
    parts.push(`Scheduler alerts: ${ctx.schedulerAlerts.join(' | ')}`)

  return parts.join('\n')
}
