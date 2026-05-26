import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { executeSchedulerAction } from '@/agents/specialist/scheduler'
import { executeJournalAction } from '@/agents/specialist/journal'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// GET /api/agents/scheduler?action=get_week_view
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action') ?? 'get_week_view'
  const result = await executeSchedulerAction(action, {})
  return NextResponse.json(result)
}

// POST /api/agents/scheduler  { action, params }
// POST /api/agents/scheduler  { cron: true }  ← called by nightly cron
export async function POST(req: NextRequest) {
  const body = await req.json()

  // ── Nightly cron job ────────────────────────────────────────────────────
  if (body.cron === true) {
    return runNightlyCron()
  }

  const { action, params = {} } = body
  if (!action) return NextResponse.json({ ok: false, message: 'action required' }, { status: 400 })
  const result = await executeSchedulerAction(action, params)
  return NextResponse.json(result)
}

async function runNightlyCron(): Promise<NextResponse> {
  const pushed: string[] = []

  try {
    // 1. Overdue tasks → alert
    const overdue = await executeSchedulerAction('get_overdue', {})
    if (overdue.ok && Array.isArray(overdue.data) && overdue.data.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const titles = (overdue.data as any[]).map((t: { title: string; deadline: string }) =>
        `"${t.title}" (due ${t.deadline})`
      ).join(', ')
      await supabase.from('scheduler_alerts').insert({
        title: `${overdue.data.length} overdue task${overdue.data.length > 1 ? 's' : ''}`,
        body: `These tasks are past their deadline: ${titles}. Review and reschedule.`,
        priority: overdue.data.length >= 3 ? 'high' : 'medium',
        agent_id: 'scheduler',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      pushed.push(`overdue:${overdue.data.length}`)
    }

    // 2. Tasks due tomorrow → reminder alert
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    const { data: dueTomorrow } = await supabase
      .from('tasks')
      .select('title,priority')
      .neq('status', 'done')
      .eq('deadline', tomorrow)
    if (dueTomorrow && dueTomorrow.length > 0) {
      await supabase.from('scheduler_alerts').insert({
        title: `${dueTomorrow.length} task${dueTomorrow.length > 1 ? 's' : ''} due tomorrow`,
        body: dueTomorrow.map(t => `• ${t.title} [${t.priority}]`).join('\n'),
        priority: 'medium',
        agent_id: 'scheduler',
        expires_at: new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString(),
      })
      pushed.push(`due-tomorrow:${dueTomorrow.length}`)
    }

    // 3. Journal pattern detection → alert if issues found
    const patterns = await executeJournalAction('detect_patterns', { days: 14 })
    if (patterns.ok && Array.isArray(patterns.data) && patterns.data.length > 0) {
      await supabase.from('scheduler_alerts').insert({
        title: 'Health & journal patterns detected',
        body: patterns.data.join('\n'),
        priority: 'low',
        agent_id: 'journal',
        expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      })
      pushed.push(`patterns:${patterns.data.length}`)
    }

    // 4. Expire old dismissed alerts (older than 7 days)
    await supabase
      .from('scheduler_alerts')
      .delete()
      .eq('dismissed', true)
      .lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

    return NextResponse.json({ ok: true, message: 'Nightly cron complete', pushed })
  } catch (err) {
    return NextResponse.json({ ok: false, message: String(err) }, { status: 500 })
  }
}
