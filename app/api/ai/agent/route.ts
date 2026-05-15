import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { OllamaModel } from '@/lib/ollama'
import type { AgentId } from '@/lib/agents'

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
  process.env.SUPABASE_SERVICE_KEY!
)

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

const ASSISTANT_SYSTEM = `You are a personal productivity assistant with full read/write access to the user's projects and tasks database.

IMPORTANT: When the user asks you to create, add, update, list, or delete anything — you MUST emit one or more tool call blocks. Use your reasoning to understand natural language fully.

Tool call format: emit a JSON block tagged \`\`\`tool on its own lines. You can emit MULTIPLE tool blocks in one response.

\`\`\`tool
{"action":"<action>","params":{...}}
\`\`\`

AVAILABLE ACTIONS:

add_project
  params: name(required), description, color(hex), status(active/on_hold/completed/archived)

add_task
  params: title(required), description, project_name(exact name), priority(urgent/high/medium/low), effort(S/M/L/XL), deadline(YYYY-MM-DD), scheduled_for(YYYY-MM-DD)

bulk_add_tasks
  params: project_name, tasks: [{title, description, priority, effort, deadline}]

add_project_with_tasks
  params: name, description, color, status, tasks:[{title, description, priority, effort, deadline}]

list_projects
  params: {}

list_tasks
  params: project_name(optional), status(optional: todo/in_progress/done/deferred)

update_task_status
  params: task_title(partial match ok), status(todo/in_progress/done/deferred)

update_task
  params: task_title(partial match), and any of: priority, effort, deadline, scheduled_for, description, status

delete_task
  params: task_title(partial match)

delete_project
  params: project_name

RULES:
- Always use tool blocks for any data operation.
- After tool blocks, always write a friendly plain-English summary.
- Never show raw JSON or tool syntax to the user.`

const RESEARCH_SYSTEM = `You are a research assistant with read access to the user's academic paper library. You help the user navigate, understand, and reason about their research papers, highlights, and projects.

You have access to the user's full paper library via tool calls. Use them to answer questions.

CRITICAL: Tool call format must be EXACTLY this — the tag must be "tool" not "json":
\`\`\`tool
{"action":"<action>","params":{...}}
\`\`\`

AVAILABLE ACTIONS:

list_papers
  params: project_id(optional), reading_status(optional: not-started/reading/read/important/to-review/used-presentation/used-dissertation/archived), favorite(optional: true)

search_papers
  params: query(string) — searches title, authors, abstract, summary, notes

list_highlights
  params: paper_id(optional), project_id(optional)

list_research_projects
  params: {}

RULES:
- Use tool calls to fetch real data before answering questions about papers.
- After tool results, summarise findings in plain conversational English.
- Never show raw JSON to the user.
- When discussing papers, mention authors, year, and key relevance.
- You cannot add or edit papers — direct the user to the Research Assistant app for that.`

const TRADING_SYSTEM = `You are a trading assistant with read-only access to the user's trading agent logs. You help the user understand their trading performance, risk state, and recent activity.

You have access to live trading data via tool calls.

CRITICAL: Tool call format must be EXACTLY this — the tag must be "tool" not "json":
\`\`\`tool
{"action":"<action>","params":{...}}
\`\`\`

AVAILABLE ACTIONS:

get_risk_state
  params: {} — returns current risk state for all symbols (open positions, daily PnL, trade counts)

get_recent_trades
  params: limit(optional, default 20) — returns recent closed trades from the trade ledger

get_recent_predictions
  params: symbol(optional), limit(optional, default 30) — returns recent signal predictions

RULES:
- Always use tool calls to fetch live data before answering.
- Summarise trading data in plain English — no raw CSV or JSON to the user.
- Be factual. Do not give financial advice.
- Note: you cannot modify trading parameters — this is read-only.`

// ---------------------------------------------------------------------------
// Action executors
// ---------------------------------------------------------------------------

function logActivity(type: string, entity_type: string, entity_title: string, meta?: Record<string, unknown>, entity_id?: string) {
  supabase.from('activity_log').insert({ type, entity_type, entity_id, entity_title, meta, source: 'agent' }).then(() => {})
}

async function executeAssistantAction(action: string, params: Record<string, unknown>) {
  async function resolveProject(name: string): Promise<string | null> {
    if (!name) return null
    const { data } = await supabase.from('projects').select('id,name').ilike('name', `%${name}%`).limit(1)
    return data?.[0]?.id || null
  }

  switch (action) {
    case 'add_project': {
      const { data, error } = await supabase.from('projects').insert({
        name: params.name, description: params.description || '',
        color: params.color || '#0F766E', status: params.status || 'active',
      }).select().single()
      if (error) return { ok: false, message: error.message }
      logActivity('project_created', 'project', String(params.name), { status: params.status || 'active' }, data.id)
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
      logActivity('task_created', 'task', String(params.title), { priority: params.priority, project: params.project_name }, data.id)
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
      tasks.forEach(t => logActivity('task_created', 'task', String(t.title), { project: params.project_name }))
      return { ok: true, message: `Added ${tasks.length} tasks`, data: tasks.map(t => ({ title: t.title, priority: t.priority })) }
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
    default:
      return { ok: false, message: `Unknown action: ${action}` }
  }
}

async function executeResearchAction(action: string, params: Record<string, unknown>) {
  switch (action) {
    case 'list_research_projects': {
      const { data } = await supabase.from('research_projects').select('id,name,description,color').order('created_at', { ascending: false })
      return { ok: true, message: `${data?.length || 0} research projects`, data }
    }
    case 'list_papers': {
      let q = supabase.from('research_papers').select('id,title,authors,year,journal,reading_status,favorite,summary,dissertation_relevance,tags').order('created_at', { ascending: false }).limit(50)
      if (params.project_id) q = q.eq('project_id', params.project_id as string)
      if (params.reading_status) q = q.eq('reading_status', params.reading_status as string)
      if (params.favorite === true) q = q.eq('favorite', true)
      const { data } = await q
      return { ok: true, message: `${data?.length || 0} papers`, data }
    }
    case 'search_papers': {
      const query = String(params.query || '').toLowerCase()
      const { data } = await supabase.from('research_papers').select('id,title,authors,year,journal,reading_status,summary,tags').limit(100)
      const filtered = data?.filter(p =>
        p.title?.toLowerCase().includes(query) ||
        p.authors?.toLowerCase().includes(query) ||
        p.summary?.toLowerCase().includes(query) ||
        p.tags?.some((t: string) => t.toLowerCase().includes(query))
      ).slice(0, 15)
      return { ok: true, message: `${filtered?.length || 0} matching papers`, data: filtered }
    }
    case 'list_highlights': {
      let q = supabase.from('research_highlights').select('id,selected_text,note,color,paper_id').order('created_at', { ascending: false }).limit(30)
      if (params.paper_id) q = q.eq('paper_id', params.paper_id as string)
      if (params.project_id) q = q.eq('project_id', params.project_id as string)
      const { data } = await q
      return { ok: true, message: `${data?.length || 0} highlights`, data }
    }
    default:
      return { ok: false, message: `Unknown action: ${action}` }
  }
}

function executeTradingAction(action: string, params: Record<string, unknown>) {
  const tradingBase = join(process.cwd(), '..', 'Trading Agent', 'trading_agent')

  switch (action) {
    case 'get_risk_state': {
      try {
        const raw = readFileSync(join(tradingBase, 'logs', 'risk_state.json'), 'utf-8')
        const state = JSON.parse(raw)
        return { ok: true, message: 'Current risk state', data: state }
      } catch {
        return { ok: false, message: 'Could not read risk state file' }
      }
    }
    case 'get_recent_trades': {
      try {
        const limit = (params.limit as number) || 20
        const raw = readFileSync(join(tradingBase, 'logs', 'trades.csv'), 'utf-8')
        const lines = raw.trim().split('\n')
        const headers = lines[0].split(',')
        const rows = lines.slice(1).slice(-limit).map(line => {
          const vals = line.split(',')
          return Object.fromEntries(headers.map((h, i) => [h, vals[i]]))
        })
        return { ok: true, message: `${rows.length} recent trades`, data: rows }
      } catch {
        return { ok: false, message: 'Could not read trades file' }
      }
    }
    case 'get_recent_predictions': {
      try {
        const limit = (params.limit as number) || 30
        const symbol = params.symbol as string | undefined
        const raw = readFileSync(join(tradingBase, 'logs', 'predictions.csv'), 'utf-8')
        const lines = raw.trim().split('\n')
        const headers = lines[0].split(',')
        let rows = lines.slice(1).map(line => {
          const vals = line.split(',')
          return Object.fromEntries(headers.map((h, i) => [h, vals[i]]))
        })
        if (symbol) rows = rows.filter(r => r.symbol === symbol)
        rows = rows.slice(-limit)
        return { ok: true, message: `${rows.length} recent predictions`, data: rows }
      } catch {
        return { ok: false, message: 'Could not read predictions file' }
      }
    }
    default:
      return { ok: false, message: `Unknown action: ${action}` }
  }
}

async function executeAction(agentId: AgentId, action: string, params: Record<string, unknown>) {
  if (agentId === 'research') return executeResearchAction(action, params)
  if (agentId === 'trading') return executeTradingAction(action, params)
  return executeAssistantAction(action, params)
}

// ---------------------------------------------------------------------------
// Build system prompt with live context per agent
// ---------------------------------------------------------------------------

async function buildSystemPrompt(agentId: AgentId): Promise<string> {
  const date = new Date().toISOString().slice(0, 10)
  const tradingBase = join(process.cwd(), '..', 'Trading Agent', 'trading_agent')

  // Shared cross-agent context helpers
  function getTradingSnapshot(): string {
    try {
      const state = JSON.parse(readFileSync(join(tradingBase, 'logs', 'risk_state.json'), 'utf-8'))
      const lines = readFileSync(join(tradingBase, 'logs', 'trades.csv'), 'utf-8').trim().split('\n')
      const today = date.replace(/-/g, '.')
      const todayTrades = lines.slice(1).filter(l => l.includes(today))
      const profits = todayTrades.map(l => parseFloat(l.split(',')[11])).filter(p => !isNaN(p))
      const pnl = profits.reduce((a, b) => a + b, 0)
      const wins = profits.filter(p => p > 0).length
      const openSyms = Object.entries(state.open_positions || {}).filter(([, v]) => v).map(([k]) => k)
      return `Trading today (${date}): ${profits.length} trades, ${wins}W/${profits.length - wins}L, P&L $${pnl.toFixed(2)}${openSyms.length ? `, open: ${openSyms.join('+')}` : ''}`
    } catch { return '' }
  }

  if (agentId === 'assistant') {
    const [{ data: projects }, { data: tasks }, { data: researchProjects }, { data: readingPapers }] = await Promise.all([
      supabase.from('projects').select('name,status').order('created_at', { ascending: false }),
      supabase.from('tasks').select('title,status,priority').neq('status', 'done').limit(30),
      supabase.from('research_projects').select('name').order('created_at', { ascending: false }),
      supabase.from('research_papers').select('title').eq('reading_status', 'reading').limit(3),
    ])
    const tradingSnap = getTradingSnapshot()
    const context = `\nWorkspace snapshot (${date}):
Projects: ${projects?.map(p => `"${p.name}"(${p.status})`).join(', ') || 'none'}
Open tasks: ${tasks?.map(t => `"${t.title}"[${t.priority}]`).slice(0, 15).join(', ') || 'none'}
Research projects: ${researchProjects?.map(p => p.name).join(', ') || 'none'}
${readingPapers?.length ? `Currently reading: ${readingPapers.map(p => p.title).join(', ')}` : ''}
${tradingSnap}`
    return ASSISTANT_SYSTEM + context
  }

  if (agentId === 'research') {
    const [{ data: rProjects }, { data: papers }, { data: paProjects }, { data: urgentTasks }] = await Promise.all([
      supabase.from('research_projects').select('id,name').order('created_at', { ascending: false }),
      supabase.from('research_papers').select('title,reading_status,favorite').order('updated_at', { ascending: false }).limit(10),
      supabase.from('projects').select('name').eq('status', 'active').limit(5),
      supabase.from('tasks').select('title,priority').eq('priority', 'urgent').neq('status', 'done').limit(5),
    ])
    const context = `\nResearch snapshot (${date}):
Research projects: ${rProjects?.map(p => `"${p.name}"(id:${p.id})`).join(', ') || 'none'}
Recently active papers: ${papers?.map(p => `"${p.title}"[${p.reading_status}]`).join(', ') || 'none'}
PA projects (for context): ${paProjects?.map(p => p.name).join(', ') || 'none'}
${urgentTasks?.length ? `Urgent PA tasks: ${urgentTasks.map(t => t.title).join(', ')}` : ''}`
    return RESEARCH_SYSTEM + context
  }

  if (agentId === 'trading') {
    const [{ data: urgentTasks }, { data: paProjects }] = await Promise.all([
      supabase.from('tasks').select('title').eq('priority', 'urgent').neq('status', 'done').limit(3),
      supabase.from('projects').select('name').eq('status', 'active').limit(3),
    ])
    let riskSummary = 'unavailable'
    let tradePerfSummary = ''
    try {
      const raw = readFileSync(join(tradingBase, 'logs', 'risk_state.json'), 'utf-8')
      const state = JSON.parse(raw)
      const symbols = Object.keys(state.states || {})
      riskSummary = symbols.map(sym => {
        const s = state.states[sym]
        return `${sym}: ${s.trades_today} trades, PnL ${(s.pnl_pct_today * 100).toFixed(3)}%, open=${state.open_positions?.[sym] ?? false}`
      }).join(' | ')
    } catch {}
    try {
      const lines = readFileSync(join(tradingBase, 'logs', 'trades.csv'), 'utf-8').trim().split('\n')
      const today = date.replace(/-/g, '.')
      const todayLines = lines.slice(1).filter(l => l.includes(today))
      const profits = todayLines.map(l => parseFloat(l.split(',')[11])).filter(p => !isNaN(p))
      if (profits.length > 0) {
        const wins = profits.filter(p => p > 0).length
        tradePerfSummary = `Today's closed trades: ${profits.length} total, ${wins}W/${profits.length - wins}L, P&L $${profits.reduce((a, b) => a + b, 0).toFixed(2)}`
      }
    } catch {}
    const context = `\nTrading snapshot (${date}):
Risk state: ${riskSummary}
${tradePerfSummary}
${urgentTasks?.length ? `User's urgent PA tasks today: ${urgentTasks.map(t => t.title).join(', ')}` : ''}
${paProjects?.length ? `Active projects: ${paProjects.map(p => p.name).join(', ')}` : ''}`
    return TRADING_SYSTEM + context
  }

  return ASSISTANT_SYSTEM
}

// ---------------------------------------------------------------------------
// Memory helpers
// ---------------------------------------------------------------------------

async function loadMemory(agentId: AgentId): Promise<string> {
  const { data } = await supabase
    .from('agent_memory')
    .select('key, value')
    .eq('agent_id', agentId)
    .order('updated_at', { ascending: false })
    .limit(20)
  if (!data || data.length === 0) return ''
  return '\n\nWhat you remember about the user:\n' +
    data.map((m: { key: string; value: string }) => `- ${m.key}: ${m.value}`).join('\n')
}

async function extractAndSaveMemory(
  agentId: AgentId,
  model: string,
  conversation: { role: string; content: string }[],
  sessionId: string
): Promise<void> {
  // Only extract every 4 user messages to avoid too many LLM calls
  const userMsgs = conversation.filter(m => m.role === 'user')
  if (userMsgs.length === 0 || userMsgs.length % 4 !== 0) return

  const extractPrompt = `You are a memory extractor. Given this conversation, extract 1-5 key facts worth remembering about the user for future conversations.

Focus on: preferences, goals, ongoing projects, important decisions, things they mentioned wanting to track.
Do NOT extract: transient info, questions already answered, task details better tracked elsewhere.

Conversation:
${conversation.slice(-8).map(m => `${m.role}: ${m.content.slice(0, 200)}`).join('\n')}

Respond with ONLY a JSON array of {key, value} pairs. Keys should be short snake_case. Max 5 items.
Example: [{"key":"preferred_model","value":"deepseek-r1:7b for local work"}]
If nothing worth remembering, respond with: []`

  try {
    const raw = await ollamaChatMessages(
      [{ role: 'user', content: extractPrompt }],
      model,
      'You extract memory facts from conversations. Respond only with valid JSON.'
    )
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return
    const facts: { key: string; value: string }[] = JSON.parse(jsonMatch[0])
    if (!Array.isArray(facts) || facts.length === 0) return

    for (const fact of facts) {
      if (!fact.key || !fact.value) continue
      await supabase.from('agent_memory').upsert({
        agent_id: agentId,
        key: fact.key.toLowerCase().replace(/\s+/g, '_').slice(0, 100),
        value: String(fact.value).slice(0, 500),
        source_session_id: sessionId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'agent_id,key' })
    }
  } catch {}
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const { messages, model = 'deepseek-r1:7b', agentId = 'assistant', session_id } = await req.json()
  const agent = agentId as AgentId

  const [systemPrompt, memory] = await Promise.all([
    buildSystemPrompt(agent),
    loadMemory(agent),
  ])
  const systemPromptWithMemory = systemPrompt + memory

  let raw = ''
  try {
    raw = await ollamaChatMessages(messages, model as OllamaModel, systemPromptWithMemory)
  } catch {
    return NextResponse.json({ error: 'Ollama not reachable. Make sure it is running on localhost:11434.' }, { status: 502 })
  }

  // Extract tool blocks — accept ```tool or ```json (model sometimes uses wrong tag)
  const toolRegex = /```(?:tool|json)\s*([\s\S]*?)```/g
  const toolResults: Array<{ ok: boolean; message: string; data?: unknown }> = []
  let match

  while ((match = toolRegex.exec(raw)) !== null) {
    try {
      const { action, params } = JSON.parse(match[1].trim())
      const result = await executeAction(agent, action, params || {})
      toolResults.push(result)
    } catch (e) {
      toolResults.push({ ok: false, message: `Parse error: ${String(e)}` })
    }
  }

  const replyText = raw.replace(/```tool[\s\S]*?```/g, '').trim()

  // Persist messages + extract memory (fire and forget)
  if (session_id) {
    const lastUser = messages[messages.length - 1]
    const fullConversation = [...messages, { role: 'assistant', content: replyText }]
    Promise.all([
      supabase.from('agent_messages').insert({ session_id, role: lastUser.role, content: lastUser.content }),
      supabase.from('agent_messages').insert({ session_id, role: 'assistant', content: replyText, tool_results: toolResults.length ? toolResults : null }),
      supabase.from('agent_sessions').update({ last_message_at: new Date().toISOString() }).eq('id', session_id),
      extractAndSaveMemory(agent, model as string, fullConversation, session_id),
    ]).then(() => {})
  }

  return NextResponse.json({ reply: replyText, toolResults, toolResult: toolResults[0] || null })
}
