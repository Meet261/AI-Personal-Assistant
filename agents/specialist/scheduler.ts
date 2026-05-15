// ─── Scheduler specialist — planning, prioritization, week view ───────────
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function executeSchedulerAction(action: string, params: Record<string, unknown>) {
  const today = new Date().toISOString().slice(0, 10)

  switch (action) {
    case 'get_week_view': {
      const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
      const { data: tasks } = await supabase.from('tasks')
        .select('title,priority,effort,deadline,scheduled_for,status,project:projects(name)')
        .neq('status', 'done')
        .or(`deadline.lte.${weekEnd},scheduled_for.lte.${weekEnd}`)
        .order('deadline')
      return { ok: true, message: `Week view`, data: tasks }
    }
    case 'get_overdue': {
      const { data } = await supabase.from('tasks')
        .select('title,priority,deadline,project:projects(name)')
        .neq('status', 'done')
        .lt('deadline', today)
        .order('deadline')
      return { ok: true, message: `${data?.length || 0} overdue tasks`, data }
    }
    case 'get_alerts': {
      // Get tasks due today or overdue
      const { data: urgent } = await supabase.from('tasks')
        .select('title,priority,deadline,scheduled_for')
        .neq('status', 'done')
        .or(`deadline.lte.${today},scheduled_for.eq.${today}`)
        .order('priority')
      const alerts = urgent?.map(t => {
        if (t.deadline && t.deadline < today) return `⚠️ OVERDUE: "${t.title}" (was due ${t.deadline})`
        if (t.deadline === today) return `📅 DUE TODAY: "${t.title}"`
        if (t.scheduled_for === today) return `📌 SCHEDULED: "${t.title}"`
        return null
      }).filter(Boolean) ?? []
      return { ok: true, message: `${alerts.length} alerts`, data: alerts }
    }
    case 'schedule_task': {
      const { data: found } = await supabase.from('tasks').select('id,title').ilike('title', `%${params.task_title}%`).limit(1)
      if (!found?.length) return { ok: false, message: `No task matching "${params.task_title}"` }
      await supabase.from('tasks').update({ scheduled_for: params.date, updated_at: new Date().toISOString() }).eq('id', found[0].id)
      return { ok: true, message: `Scheduled "${found[0].title}" for ${params.date}` }
    }
    case 'reschedule_overdue': {
      // Move all overdue tasks to today (or specified date)
      const targetDate = (params.date as string) || today
      const { data: overdue } = await supabase.from('tasks')
        .select('id,title').neq('status', 'done').lt('deadline', today).not('deadline', 'is', null)
      if (!overdue?.length) return { ok: true, message: 'No overdue tasks to reschedule' }
      await supabase.from('tasks').update({ scheduled_for: targetDate, updated_at: new Date().toISOString() }).in('id', overdue.map(t => t.id))
      return { ok: true, message: `Rescheduled ${overdue.length} overdue tasks to ${targetDate}`, data: overdue.map(t => t.title) }
    }
    default:
      return { ok: false, message: `Unknown action: ${action}` }
  }
}
