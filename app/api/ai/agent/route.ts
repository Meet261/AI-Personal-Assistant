import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { OllamaModel } from '@/lib/ollama'

async function ollamaChatMessages(
  messages: { role: string; content: string }[],
  model: string,
  systemPrompt: string
): Promise<string> {
  const payload = [{ role: 'system', content: systemPrompt }, ...messages]
  const res = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: payload, stream: false }),
  })
  if (!res.ok) throw new Error(`Ollama error: ${res.statusText}`)
  const data = await res.json()
  return data.message.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY!
)

const SYSTEM_PROMPT = `You are a personal productivity assistant with full read/write access to the user's projects and tasks database.

IMPORTANT: When the user asks you to create, add, update, list, or delete anything — you MUST emit one or more tool call blocks. Use your reasoning to understand natural language fully. If someone says "create a project X with these tasks: ..." — create the project AND all the tasks in one response using multiple tool blocks.

Tool call format: emit a JSON block tagged \`\`\`tool on its own lines. You can emit MULTIPLE tool blocks in one response to do bulk operations.

\`\`\`tool
{"action":"<action>","params":{...}}
\`\`\`

AVAILABLE ACTIONS:

add_project
  params: name(required), description, color(hex, pick a nice one), status(active/on_hold/completed/archived)

add_task
  params: title(required), description, project_name(use exact project name from workspace snapshot when user mentions a project), priority(urgent/high/medium/low), effort(S/M/L/XL), deadline(YYYY-MM-DD), scheduled_for(YYYY-MM-DD)
  CRITICAL: If user says "add task to [ProjectName]" — you MUST include project_name exactly as it appears in the workspace snapshot.

bulk_add_tasks
  params: project_name, tasks: [{title, description, priority, effort, deadline}]
  USE THIS when adding multiple tasks to the same project — more efficient than multiple add_task calls.

add_project_with_tasks
  params: name, description, color, status, tasks:[{title, description, priority, effort, deadline}]
  USE THIS when creating a project and its tasks together in one shot.

list_projects
  params: {} — returns all projects with status

list_tasks
  params: project_name(optional), status(optional: todo/in_progress/done/deferred)

update_task_status
  params: task_title(partial match ok), status(todo/in_progress/done/deferred)

update_task
  params: task_title(partial match), and any of: priority, effort, deadline, scheduled_for, description, status

delete_task
  params: task_title(partial match)

delete_project
  params: project_name — WARNING: also deletes all tasks in the project

RULES:
- Always use tool blocks for any data operation. Never just describe what you would do.
- For bulk creates, prefer add_project_with_tasks or bulk_add_tasks over many individual add_task calls.
- After executing tool blocks, ALWAYS write a friendly natural-language summary of the results. NEVER show raw JSON, tool syntax, or code blocks in your reply text. Describe what you found or did in plain conversational sentences.
- When listing tasks or projects, write them out as a readable bulleted list with key details (title, priority, deadline if set) — not as JSON.
- Priority mapping: P0=urgent, P1=high, P2=medium, P3=low
- For effort: S=small(30min), M=medium(2hr), L=large(half day), XL=extra large(full day+)
- If the user is chatting casually with no action needed, respond normally with no tool blocks.
- CRITICAL: Your reply text (after any tool blocks) must always be in plain English. Never expose internal tool syntax to the user.`

// ── Log activity (fire-and-forget)
function logActivity(type: string, entity_type: string, entity_title: string, meta?: Record<string, unknown>, entity_id?: string) {
  supabase.from('activity_log').insert({ type, entity_type, entity_id, entity_title, meta, source: 'agent' }).then(() => {})
}

// ── Execute a single action against Supabase
async function executeAction(action: string, params: Record<string, unknown>): Promise<{ ok: boolean; message: string; data?: unknown }> {

  // Helper: resolve project name → id
  async function resolveProject(name: string): Promise<string | null> {
    if (!name) return null
    const { data } = await supabase.from('projects').select('id,name').ilike('name', `%${name}%`).limit(1)
    return data?.[0]?.id || null
  }

  switch (action) {

    case 'add_project': {
      const { data, error } = await supabase.from('projects').insert({
        name: params.name,
        description: params.description || '',
        color: params.color || '#0F766E',
        status: params.status || 'active',
      }).select().single()
      if (error) return { ok: false, message: error.message }
      logActivity('project_created', 'project', String(params.name), { status: params.status || 'active' }, data.id)
      return { ok: true, message: `Created project "${params.name}"`, data }
    }

    case 'add_project_with_tasks': {
      // Create project first
      const { data: proj, error: pe } = await supabase.from('projects').insert({
        name: params.name,
        description: params.description || '',
        color: params.color || '#7c5cff',
        status: params.status || 'active',
      }).select().single()
      if (pe) return { ok: false, message: pe.message }

      const tasks = (params.tasks as Record<string, unknown>[]) || []
      if (tasks.length > 0) {
        await supabase.from('tasks').insert(
          tasks.map(t => ({
            project_id: proj.id,
            title: t.title,
            description: t.description || '',
            priority: t.priority || 'medium',
            effort: t.effort || 'M',
            deadline: t.deadline || null,
            scheduled_for: t.scheduled_for || null,
            status: 'todo',
          }))
        )
      }
      logActivity('project_created', 'project', String(params.name), { task_count: tasks.length }, proj.id)
      tasks.forEach(t => logActivity('task_created', 'task', String(t.title), { project: params.name, priority: t.priority }, undefined))
      return { ok: true, message: `Created project "${params.name}" with ${tasks.length} tasks`, data: proj }
    }

    case 'add_task': {
      const project_id = await resolveProject(params.project_name as string)
      if (params.project_name && !project_id) {
        return { ok: false, message: `Project "${params.project_name}" not found. Use list_projects to see available projects.` }
      }
      const { data, error } = await supabase.from('tasks').insert({
        title: params.title,
        description: params.description || '',
        project_id,
        priority: params.priority || 'medium',
        effort: params.effort || 'M',
        deadline: params.deadline || null,
        scheduled_for: params.scheduled_for || null,
        status: 'todo',
      }).select().single()
      if (error) return { ok: false, message: error.message }
      logActivity('task_created', 'task', String(params.title), { priority: params.priority || 'medium', project: params.project_name }, data.id)
      return { ok: true, message: `Created task "${params.title}"${project_id ? ` in "${params.project_name}"` : ''}`, data }
    }

    case 'bulk_add_tasks': {
      const project_id = await resolveProject(params.project_name as string)
      const tasks = (params.tasks as Record<string, unknown>[]) || []
      const { error } = await supabase.from('tasks').insert(
        tasks.map(t => ({
          project_id,
          title: t.title,
          description: t.description || '',
          priority: t.priority || 'medium',
          effort: t.effort || 'M',
          deadline: t.deadline || null,
          scheduled_for: t.scheduled_for || null,
          status: 'todo',
        }))
      )
      if (error) return { ok: false, message: error.message }
      tasks.forEach(t => logActivity('task_created', 'task', String(t.title), { priority: t.priority, project: params.project_name }))
      return { ok: true, message: `Added ${tasks.length} tasks${params.project_name ? ` to "${params.project_name}"` : ''}`, data: tasks.map(t => ({ title: t.title, priority: t.priority })) }
    }

    case 'list_projects': {
      const { data } = await supabase.from('projects').select('name,status,color').order('created_at', { ascending: false })
      return { ok: true, message: `${data?.length || 0} projects`, data }
    }

    case 'list_tasks': {
      let q = supabase.from('tasks').select('title,status,priority,effort,deadline,project:projects(name)')
      if (params.project_name) {
        const pid = await resolveProject(params.project_name as string)
        if (pid) q = q.eq('project_id', pid)
      }
      if (params.status) q = q.eq('status', params.status as string)
      const { data } = await q.order('priority')
      return { ok: true, message: `${data?.length || 0} tasks`, data }
    }

    case 'update_task_status': {
      const { data: found } = await supabase.from('tasks').select('id,title').ilike('title', `%${params.task_title}%`).limit(1)
      if (!found?.length) return { ok: false, message: `No task matching "${params.task_title}"` }
      await supabase.from('tasks').update({
        status: params.status,
        completed_at: params.status === 'done' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq('id', found[0].id)
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
      logActivity('task_updated', 'task', found[0].title, updates as Record<string, unknown>, found[0].id)
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
      return { ok: true, message: `Deleted project "${proj.name}" and all its tasks` }
    }

    default:
      return { ok: false, message: `Unknown action: ${action}` }
  }
}

const PRESET_SUFFIXES: Record<string, string> = {
  'Deep Thinker': '\nApproach every question thoughtfully and thoroughly. Consider multiple angles before responding.',
  'Code Helper': '\nFocus on software engineering. Provide code examples, explain technical tradeoffs, and be precise.',
}

export async function POST(req: NextRequest) {
  const { messages, model = 'deepseek-r1:7b', systemPreset = 'Personal Assistant', session_id } = await req.json()

  // Fetch live context + past summaries for memory
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const [{ data: projects }, { data: tasks }, { data: oldSummaries }] = await Promise.all([
    supabase.from('projects').select('name,status').order('created_at', { ascending: false }),
    supabase.from('tasks').select('title,status,priority').neq('status','done').limit(30),
    supabase.from('agent_sessions').select('title,summary,started_at').lt('started_at', sevenDaysAgo).not('summary', 'is', null).order('started_at', { ascending: false }).limit(5),
  ])

  const memorySummary = oldSummaries?.length
    ? '\nPast conversation summaries (for context):\n' + oldSummaries.map(s => `- [${s.started_at?.slice(0,10)}] ${s.title || 'Session'}: ${s.summary}`).join('\n')
    : ''

  const context = `
Workspace snapshot (${new Date().toISOString().slice(0,10)}):
Projects (use EXACT names when adding tasks): ${projects?.map(p => `"${p.name}"(${p.status})`).join(', ') || 'none'}
Open tasks sample: ${tasks?.map(t => `"${t.title}"[${t.priority}]`).slice(0,15).join(', ') || 'none'}
IMPORTANT: When adding a task to a project, always set project_name to the exact project name from the list above.
${memorySummary}`

  const systemPromptFull = SYSTEM_PROMPT + (PRESET_SUFFIXES[systemPreset] || '') + '\n' + context

  let raw = ''
  try {
    raw = await ollamaChatMessages(
      messages,
      model as OllamaModel,
      systemPromptFull
    )
  } catch {
    return NextResponse.json({ error: 'Ollama not reachable. Make sure it is running on localhost:11434.' }, { status: 502 })
  }

  // Extract ALL tool blocks
  const toolRegex = /```tool\s*([\s\S]*?)```/g
  const toolResults: Array<{ ok: boolean; message: string; data?: unknown }> = []
  let match

  while ((match = toolRegex.exec(raw)) !== null) {
    try {
      const { action, params } = JSON.parse(match[1].trim())
      const result = await executeAction(action, params || {})
      toolResults.push(result)
    } catch (e) {
      toolResults.push({ ok: false, message: `Parse error: ${String(e)}` })
    }
  }

  const replyText = raw.replace(/```tool[\s\S]*?```/g, '').trim()

  // Persist messages to Supabase (fire-and-forget)
  if (session_id) {
    const lastUser = messages[messages.length - 1]
    Promise.all([
      supabase.from('agent_messages').insert({ session_id, role: lastUser.role, content: lastUser.content }),
      supabase.from('agent_messages').insert({ session_id, role: 'assistant', content: replyText, tool_results: toolResults.length ? toolResults : null }),
      supabase.from('agent_sessions').update({ last_message_at: new Date().toISOString() }).eq('id', session_id),
    ]).then(() => {})
  }

  return NextResponse.json({
    reply: replyText,
    toolResults,
    toolResult: toolResults[0] || null,
  })
}
