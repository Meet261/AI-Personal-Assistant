import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { callDeepSeekChat } from '@/agents/shared/models'
import { format, addDays } from 'date-fns'
import type { CheckinAnswer } from '@/lib/types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function POST(req: NextRequest) {
  const answers: CheckinAnswer = await req.json()
  const today = format(new Date(), 'yyyy-MM-dd')
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')

  // Fetch trading data early so it can inform the AI summary too
  let tradingSummaryForPrompt = ''
  try {
    const tr = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/agents/trading/today`)
    if (tr.ok) {
      const td = await tr.json()
      const s = td?.data?.summary
      if (s && s.count > 0) {
        const pnl = parseFloat(s.pnl || '0')
        tradingSummaryForPrompt = `\n- Trading P&L: $${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} (${s.count} trades, ${s.wins}W/${s.losses}L)`
      }
    }
  } catch {}

  const prompt = `You are a personal assistant. Based on this evening check-in, do two things:

1. Write a brief (2-3 sentence) AI summary of the person's day.
2. Extract tasks to schedule for tomorrow based on what was blocked, pushed, new, or important.

Check-in answers:
- Completed today: ${answers.completed_today}
- Blocked or pushed: ${answers.blocked_or_pushed}
- New tasks that came up: ${answers.new_tasks}
- Energy level: ${answers.energy_level}/5
- Focus for tomorrow: ${answers.tomorrow_focus}${tradingSummaryForPrompt}

Respond in this exact JSON format:
{
  "summary": "2-3 sentence summary of the day",
  "tasks": [
    {"title": "task title", "priority": "high|medium|low", "effort": "S|M|L|XL", "reason": "why scheduled for tomorrow"}
  ]
}`

  const raw = await callDeepSeekChat(
    [{ role: 'user', content: prompt }],
    'You are a concise productivity assistant. Always respond with valid JSON only.'
  )

  let summary = ''
  let tasksToSchedule: Array<{ title: string; priority: string; effort: string; reason: string }> = []

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      summary = parsed.summary || ''
      tasksToSchedule = parsed.tasks || []
    }
  } catch {
    summary = raw.slice(0, 200)
  }

  // Build trading note for journal (reuse data already fetched above)
  const tradingNote = tradingSummaryForPrompt
    ? `\n\n[Trading auto-fill:${tradingSummaryForPrompt.trim().replace('- Trading P&L:', 'P&L')}]`
    : ''

  // Save journal entry — append trading note to completed_today if trades happened
  await supabase.from('journal_entries').upsert({
    date: today,
    completed_today: answers.completed_today + tradingNote,
    blocked_or_pushed: answers.blocked_or_pushed,
    new_tasks: answers.new_tasks,
    energy_level: answers.energy_level,
    tomorrow_focus: answers.tomorrow_focus,
    ai_summary: summary,
    ai_tasks_scheduled: tasksToSchedule.map(t => t.title),
  }, { onConflict: 'date' })

  // Auto-schedule tasks for tomorrow
  if (tasksToSchedule.length > 0) {
    await supabase.from('tasks').insert(
      tasksToSchedule.map(t => ({
        title: t.title,
        priority: t.priority || 'medium',
        effort: t.effort || 'M',
        status: 'todo',
        scheduled_for: tomorrow,
        description: `Auto-scheduled from evening check-in: ${t.reason}`,
      }))
    )
  }

  // Trigger evening briefing
  await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/briefing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'evening', date: today }),
  }).catch(() => {})

  return NextResponse.json({ summary, tasksScheduled: tasksToSchedule })
}
