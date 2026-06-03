// ─── Scheduler specialist — planning, prioritization, week view ───────────
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function executeSchedulerAction(action: string, params: Record<string, unknown>) {
  const today = new Date().toISOString().slice(0, 10)
  try {
  switch (action) {

    // ── Cross-agent: read same task data as personal assistant ────────────
    case 'get_all_tasks': {
      const { data: tasks } = await supabase.from('tasks')
        .select('id,title,description,priority,effort,status,deadline,scheduled_for,project:projects(id,name,color)')
        .neq('status', 'done')
        .order('priority')
      return {
        ok: true,
        message: `${tasks?.length ?? 0} pending tasks`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: tasks?.map((t: any) => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          effort: t.effort,
          deadline: t.deadline,
          scheduled_for: t.scheduled_for,
          project: t.project?.name ?? 'No project',
        }))
      }
    }

    case 'get_projects': {
      const { data: projects } = await supabase.from('projects')
        .select('id,name,color')
        .eq('status', 'active')
        .order('name')
      return { ok: true, message: `${projects?.length ?? 0} active projects`, data: projects }
    }

    // ── Batch-schedule: apply a full week plan at once ────────────────────
    // params.assignments = [{ task_id, date, time_slot? }]
    case 'batch_schedule': {
      const assignments = params.assignments as { task_id: string; date: string; time_slot?: string }[]
      if (!Array.isArray(assignments) || assignments.length === 0)
        return { ok: false, message: 'assignments array required' }

      const results: string[] = []
      const errors: string[] = []

      for (const a of assignments) {
        const update: Record<string, string> = {
          scheduled_for: a.date,
          updated_at: new Date().toISOString(),
        }
        // Store time slot in description suffix if provided
        if (a.time_slot) {
          const { data: task } = await supabase.from('tasks').select('description').eq('id', a.task_id).single()
          const base = (task?.description ?? '').replace(/\s*\[🕐[^\]]+\]$/, '')
          update.description = `${base}${base ? ' ' : ''}[🕐 ${a.time_slot}]`.trim()
        }
        const { error } = await supabase.from('tasks').update(update).eq('id', a.task_id)
        if (error) errors.push(`${a.task_id}: ${error.message}`)
        else results.push(a.task_id)
      }

      return {
        ok: errors.length === 0,
        message: `Scheduled ${results.length}/${assignments.length} tasks${errors.length ? ` (${errors.length} failed)` : ''}`,
        data: { scheduled: results.length, failed: errors },
      }
    }

    // ── Schedule by ID (reliable) or fuzzy title (fallback) ───────────────
    case 'schedule_task': {
      const timeSlot = params.time_slot as string | undefined
      let taskId = params.task_id as string | undefined

      if (!taskId && params.task_title) {
        const { data: found } = await supabase.from('tasks')
          .select('id,title').ilike('title', `%${params.task_title}%`).limit(1)
        if (!found?.length) return { ok: false, message: `No task matching "${params.task_title}"` }
        taskId = found[0].id
      }
      if (!taskId) return { ok: false, message: 'task_id or task_title required' }

      const update: Record<string, string> = {
        scheduled_for: params.date as string,
        updated_at: new Date().toISOString(),
      }
      if (timeSlot) {
        const { data: task } = await supabase.from('tasks').select('title,description').eq('id', taskId).single()
        const base = (task?.description ?? '').replace(/\s*\[🕐[^\]]+\]$/, '')
        update.description = `${base}${base ? ' ' : ''}[🕐 ${timeSlot}]`.trim()
        const { error: updateErr } = await supabase.from('tasks').update(update).eq('id', taskId)
        if (updateErr) return { ok: false, message: updateErr.message }
        return { ok: true, message: `Scheduled "${task?.title}" for ${params.date} at ${timeSlot}` }
      }
      await supabase.from('tasks').update(update).eq('id', taskId)
      return { ok: true, message: `Scheduled task for ${params.date}` }
    }
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
    case 'reschedule_overdue': {
      // Move all overdue tasks to today (or specified date)
      const targetDate = (params.date as string) || today
      const { data: overdue } = await supabase.from('tasks')
        .select('id,title').neq('status', 'done').lt('deadline', today).not('deadline', 'is', null)
      if (!overdue?.length) return { ok: true, message: 'No overdue tasks to reschedule' }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await supabase.from('tasks').update({ scheduled_for: targetDate, updated_at: new Date().toISOString() }).in('id', overdue.map((t: any) => t.id))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { ok: true, message: `Rescheduled ${overdue.length} overdue tasks to ${targetDate}`, data: overdue.map((t: any) => t.title) }
    }
    case 'dismiss_alert': {
      const id = params.id as string
      if (!id) return { ok: false, message: 'id required' }
      const { error } = await supabase.from('scheduler_alerts').update({ dismissed: true }).eq('id', id)
      if (error) return { ok: false, message: error.message }
      return { ok: true, message: 'Alert dismissed' }
    }

    case 'dismiss_all_alerts': {
      const { error } = await supabase.from('scheduler_alerts').update({ dismissed: true }).eq('dismissed', false)
      if (error) return { ok: false, message: error.message }
      return { ok: true, message: 'All alerts dismissed' }
    }

    default:
      return { ok: false, message: `Unknown action: ${action}` }
  }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[scheduler] ${action} error:`, msg)
    return { ok: false, message: `Scheduler error: ${msg}` }
  }
}
