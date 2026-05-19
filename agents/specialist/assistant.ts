// ─── Personal Assistant specialist — tasks, projects & meetings ───────────
import { createClient } from '@supabase/supabase-js'
import { callOllama } from '../shared/models'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

function logActivity(type: string, entity_type: string, entity_title: string, meta?: Record<string, unknown>, entity_id?: string) {
  supabase.from('activity_log').insert({ type, entity_type, entity_id, entity_title, meta, source: 'agent' }).then(() => {})
}

async function resolveProject(name: string): Promise<string | null> {
  if (!name) return null
  const { data } = await supabase.from('projects').select('id,name').ilike('name', `%${name}%`).limit(1)
  return data?.[0]?.id || null
}

export async function executeAssistantAction(action: string, params: Record<string, unknown>) {
  try {
  switch (action) {
    case 'add_project': {
      const { data, error } = await supabase.from('projects').insert({
        name: params.name, description: params.description || '',
        color: params.color || '#0F766E', status: params.status || 'active',
      }).select().single()
      if (error) return { ok: false, message: error.message }
      logActivity('project_created', 'project', String(params.name), {}, data.id)
      return { ok: true, message: `Created project "${params.name}"`, data }
    }
    case 'add_project_with_tasks': {
      const { data: proj, error: pe } = await supabase.from('projects').insert({
        name: params.name, description: params.description || '',
        color: params.color || '#7c5cff', status: params.status || 'active',
      }).select().single()
      if (pe) return { ok: false, message: pe.message }
      const tasks = (params.tasks as Record<string, unknown>[]) || []
      if (tasks.length > 0) {
        await supabase.from('tasks').insert(tasks.map(t => ({
          project_id: proj.id, title: t.title, description: t.description || '',
          priority: t.priority || 'medium', effort: t.effort || 'M',
          deadline: t.deadline || null, scheduled_for: t.scheduled_for || null, status: 'todo',
        })))
      }
      logActivity('project_created', 'project', String(params.name), { task_count: tasks.length }, proj.id)
      return { ok: true, message: `Created project "${params.name}" with ${tasks.length} tasks`, data: proj }
    }
    case 'add_task': {
      const project_id = await resolveProject(params.project_name as string)
      if (params.project_name && !project_id) return { ok: false, message: `Project "${params.project_name}" not found.` }
      const { data, error } = await supabase.from('tasks').insert({
        title: params.title, description: params.description || '', project_id,
        priority: params.priority || 'medium', effort: params.effort || 'M',
        deadline: params.deadline || null, scheduled_for: params.scheduled_for || null, status: 'todo',
      }).select().single()
      if (error) return { ok: false, message: error.message }
      logActivity('task_created', 'task', String(params.title), { priority: params.priority }, data.id)
      return { ok: true, message: `Created task "${params.title}"`, data }
    }
    case 'bulk_add_tasks': {
      const project_id = await resolveProject(params.project_name as string)
      const tasks = (params.tasks as Record<string, unknown>[]) || []
      const { error } = await supabase.from('tasks').insert(tasks.map(t => ({
        project_id, title: t.title, description: t.description || '',
        priority: t.priority || 'medium', effort: t.effort || 'M',
        deadline: t.deadline || null, scheduled_for: t.scheduled_for || null, status: 'todo',
      })))
      if (error) return { ok: false, message: error.message }
      return { ok: true, message: `Added ${tasks.length} tasks`, data: tasks.map(t => ({ title: t.title })) }
    }
    case 'list_projects': {
      const { data } = await supabase.from('projects').select('name,status,color').order('created_at', { ascending: false })
      return { ok: true, message: `${data?.length || 0} projects`, data }
    }
    case 'list_tasks': {
      let q = supabase.from('tasks').select('title,status,priority,effort,deadline,project:projects(name)')
      if (params.project_name) { const pid = await resolveProject(params.project_name as string); if (pid) q = q.eq('project_id', pid) }
      if (params.status) q = q.eq('status', params.status as string)
      const { data } = await q.order('priority')
      return { ok: true, message: `${data?.length || 0} tasks`, data }
    }
    case 'update_task_status': {
      const { data: found } = await supabase.from('tasks').select('id,title').ilike('title', `%${params.task_title}%`).limit(1)
      if (!found?.length) return { ok: false, message: `No task matching "${params.task_title}"` }
      await supabase.from('tasks').update({ status: params.status, completed_at: params.status === 'done' ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', found[0].id)
      logActivity('task_updated', 'task', found[0].title, { status: params.status }, found[0].id)
      return { ok: true, message: `"${found[0].title}" → ${params.status}` }
    }
    case 'update_task': {
      const { data: found } = await supabase.from('tasks').select('id,title').ilike('title', `%${params.task_title}%`).limit(1)
      if (!found?.length) return { ok: false, message: `No task matching "${params.task_title}"` }
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
      for (const f of ['priority','effort','deadline','scheduled_for','description','status'] as const) {
        if (params[f] !== undefined) updates[f] = params[f]
      }
      if (updates.status === 'done') updates.completed_at = new Date().toISOString()
      await supabase.from('tasks').update(updates).eq('id', found[0].id)
      logActivity('task_updated', 'task', found[0].title, updates, found[0].id)
      return { ok: true, message: `Updated "${found[0].title}"` }
    }
    case 'delete_task': {
      const { data: found } = await supabase.from('tasks').select('id,title').ilike('title', `%${params.task_title}%`).limit(1)
      if (!found?.length) return { ok: false, message: `No task matching "${params.task_title}"` }
      await supabase.from('tasks').delete().eq('id', found[0].id)
      logActivity('task_deleted', 'task', found[0].title, {}, found[0].id)
      return { ok: true, message: `Deleted "${found[0].title}"` }
    }
    case 'delete_project': {
      const { data: proj } = await supabase.from('projects').select('id,name').ilike('name', `%${params.project_name}%`).limit(1).single()
      if (!proj) return { ok: false, message: `No project matching "${params.project_name}"` }
      await supabase.from('tasks').delete().eq('project_id', proj.id)
      await supabase.from('projects').delete().eq('id', proj.id)
      logActivity('project_deleted', 'project', proj.name, {}, proj.id)
      return { ok: true, message: `Deleted project "${proj.name}"` }
    }

    // ── Meeting management (absorbed from Meeting Agent) ───────────────────
    case 'create_meeting': {
      const { error, data } = await supabase.from('meetings').insert({
        title:     params.title,
        date:      params.date || new Date().toISOString().slice(0, 10),
        time:      params.time ?? null,
        attendees: params.attendees ?? [],
        agenda:    params.agenda ?? null,
        project_id: params.project_id
          ? await resolveProject(params.project_id as string)
          : null,
      }).select().single()
      if (error) return { ok: false, message: error.message }
      return { ok: true, message: `Meeting created: "${data.title}" on ${data.date}`, data }
    }

    case 'get_meetings': {
      const days    = (params.days as number) || 7
      const today   = new Date().toISOString().slice(0, 10)
      const endDate = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
      const { data } = await supabase
        .from('meetings')
        .select('id,title,date,time,attendees,agenda,action_items,follow_up_sent')
        .gte('date', today)
        .lte('date', endDate)
        .order('date')
      return { ok: true, message: `${data?.length || 0} meetings in next ${days} days`, data }
    }

    case 'get_past_meetings': {
      const limit = (params.limit as number) || 5
      const today = new Date().toISOString().slice(0, 10)
      const { data } = await supabase
        .from('meetings')
        .select('id,title,date,time,attendees,notes,action_items')
        .lt('date', today)
        .order('date', { ascending: false })
        .limit(limit)
      return { ok: true, message: `${data?.length || 0} past meetings`, data }
    }

    case 'capture_meeting_notes': {
      // Save raw notes — action items extracted separately
      const meetingId = params.meeting_id as string
      const notes     = params.notes as string
      if (!meetingId || !notes) return { ok: false, message: 'meeting_id and notes required' }
      const { error } = await supabase
        .from('meetings')
        .update({ notes, updated_at: new Date().toISOString() })
        .eq('id', meetingId)
      if (error) return { ok: false, message: error.message }
      return { ok: true, message: 'Meeting notes saved' }
    }

    case 'extract_action_items': {
      // Extract action items from meeting notes using Ollama, save to meeting + create tasks
      const meetingId = params.meeting_id as string
      if (!meetingId) return { ok: false, message: 'meeting_id required' }

      const { data: meeting } = await supabase
        .from('meetings')
        .select('title,notes,attendees')
        .eq('id', meetingId)
        .single()

      if (!meeting?.notes) return { ok: false, message: 'No notes found for this meeting' }

      const extractPrompt = `Extract all action items from these meeting notes.
Meeting: ${meeting.title}
Notes: ${meeting.notes}

For each action item, identify:
- What needs to be done
- Who is responsible (if mentioned)
- When it's due (if mentioned)

Respond as JSON array: [{"task":"<what>","owner":"<who or 'me'>","due":"<date or null>"}]
If no action items, respond: []`

      const raw = await callOllama(
        [{ role: 'user', content: extractPrompt }],
        'You extract action items from meeting notes. Respond only with valid JSON.'
      )

      const jsonMatch = raw.match(/\[[\s\S]*\]/)
      const items: { task: string; owner: string; due: string | null }[] =
        jsonMatch ? JSON.parse(jsonMatch[0]) : []

      // Save action items to meeting
      await supabase.from('meetings')
        .update({ action_items: items.map(i => i.task), updated_at: new Date().toISOString() })
        .eq('id', meetingId)

      // Create tasks in Supabase for items owned by 'me'
      const myItems = items.filter(i => !i.owner || i.owner.toLowerCase() === 'me')
      for (const item of myItems) {
        await supabase.from('tasks').insert({
          title:    `[${meeting.title}] ${item.task}`,
          priority: 'medium',
          deadline: item.due || null,
          status:   'todo',
        })
      }

      return {
        ok: true,
        message: `${items.length} action items extracted, ${myItems.length} added as tasks`,
        data: items,
      }
    }

    case 'prep_meeting_brief': {
      // Generate a prep brief for an upcoming meeting
      const meetingId = params.meeting_id as string
      if (!meetingId) return { ok: false, message: 'meeting_id required' }

      const { data: meeting } = await supabase
        .from('meetings')
        .select('*')
        .eq('id', meetingId)
        .single()

      if (!meeting) return { ok: false, message: 'Meeting not found' }

      // Get related tasks for context
      const { data: tasks } = await supabase
        .from('tasks')
        .select('title,status,priority')
        .neq('status', 'done')
        .limit(10)

      const taskContext = tasks?.length
        ? `Open tasks: ${tasks.map(t => `"${t.title}" [${t.status}]`).join(', ')}`
        : ''

      const briefPrompt = `Prepare a meeting brief for:
Meeting: ${meeting.title}
Date: ${meeting.date} ${meeting.time || ''}
Attendees: ${(meeting.attendees as string[])?.join(', ') || 'Not specified'}
Agenda: ${meeting.agenda || 'Not specified'}
${taskContext}

Create a concise prep brief including:
1. Meeting objective
2. Key talking points (3-5 bullets)
3. Questions to ask
4. Relevant context from open tasks`

      const brief = await callOllama(
        [{ role: 'user', content: briefPrompt }],
        'You prepare concise, actionable meeting briefs.'
      )

      return { ok: true, message: `Prep brief: "${meeting.title}"`, data: { brief, meeting } }
    }

    default:
      return { ok: false, message: `Unknown action: ${action}` }
  }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[assistant] ${action} error:`, msg)
    return { ok: false, message: `Assistant error: ${msg}` }
  }
}
