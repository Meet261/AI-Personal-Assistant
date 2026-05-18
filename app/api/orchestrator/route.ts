import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { classifyIntent, buildAgentSystemPrompt, synthesize } from '@/agents/orchestrator'
import { buildAgentContext } from '@/agents/shared/context'
import { callOllama, modelForAgent } from '@/agents/shared/models'
import type { AgentId } from '@/agents/shared/types'

// Specialist agent executors — imported inline to keep one API route
import { executeAssistantAction } from '@/agents/specialist/assistant'
import { executeResearchAction } from '@/agents/specialist/research'
import { executeTradingAction } from '@/agents/specialist/trading'
import { executeJournalAction } from '@/agents/specialist/journal'
import { executeSchedulerAction } from '@/agents/specialist/scheduler'
import { executeHabitAction } from '@/agents/specialist/habit-tracker'
import { executeKnowledgeAction } from '@/agents/specialist/knowledge'
import { executeMemoryAction } from '@/agents/specialist/memory'
import { executeEmailAction } from '@/agents/specialist/email'
import { executeDigesterAction } from '@/agents/specialist/paper-digester'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const TOOL_REGEX = /```tool\s*([\s\S]*?)```/g

// ── Dispatch a single tool call to the right executor ────────────────────
async function dispatchTool(agentId: AgentId, action: string, params: Record<string, unknown>) {
  switch (agentId) {
    case 'assistant':      return executeAssistantAction(action, params)
    case 'research':       return executeResearchAction(action, params)
    case 'trading':        return executeTradingAction(action, params)
    case 'journal':        return executeJournalAction(action, params)
    case 'scheduler':      return executeSchedulerAction(action, params)
    case 'habit-tracker':   return executeHabitAction(action, params)
    case 'knowledge':       return executeKnowledgeAction(action, params)
    case 'memory':          return executeMemoryAction(action, params)
    case 'email':           return executeEmailAction(action, params)
    case 'paper-digester':  return executeDigesterAction(action, params)
    default:               return { ok: false, message: `No executor for ${agentId}` }
  }
}

// ── Pre-flight: agents that ALWAYS fetch data first before calling the LLM ─
// This prevents the 7b model from hallucinating instead of using tools.
async function preflight(
  agentId: AgentId,
  userMessage: string
): Promise<{ data: unknown; summary: string } | null> {
  const m = userMessage.toLowerCase()

  if (agentId === 'memory') {
    // Always load memory summary before responding
    const result = await executeMemoryAction('get_summary', {})
    return { data: result.data, summary: result.message }
  }

  if (agentId === 'trading') {
    // Route to today's data if the question is about today/recent, otherwise all-time summary
    if (/today|this session|right now|recent|latest|just now|friday|yesterday|last session/i.test(m)) {
      const [todayResult, summaryResult] = await Promise.all([
        executeTradingAction('get_today_trades', {}),
        executeTradingAction('get_performance_summary', {}),
      ])
      return {
        data: { today: todayResult.data, overall: summaryResult.data },
        summary: `Today: ${todayResult.message}. Overall: ${summaryResult.message}`,
      }
    }
    const result = await executeTradingAction('get_performance_summary', {})
    return { data: result.data, summary: result.message }
  }

  if (agentId === 'journal') {
    if (/pattern|energy|week|trend|how (am|was|have)/i.test(m)) {
      const result = await executeJournalAction('get_energy_pattern', { days: 14 })
      return { data: result.data, summary: result.message }
    }
    const result = await executeJournalAction('get_today_entry', {})
    return { data: result.data, summary: result.message }
  }

  if (agentId === 'scheduler') {
    const [alerts, overdue] = await Promise.all([
      executeSchedulerAction('get_alerts', {}),
      executeSchedulerAction('get_overdue', {}),
    ])
    return { data: { alerts: alerts.data, overdue: overdue.data }, summary: `${alerts.message}, ${overdue.message}` }
  }

  if (agentId === 'habit-tracker') {
    // Use weekly summary — single query, much faster than get_streaks (which does N queries)
    const result = await executeHabitAction('get_weekly_summary', {})
    return { data: result.data, summary: result.message }
  }

  if (agentId === 'email' && /unread|inbox|check|how many|triage/i.test(m)) {
    const result = await executeEmailAction('get_unread_count', {})
    return { data: result.data, summary: result.message }
  }

  if (agentId === 'research') {
    type PaperRow = { id: string; title: string; authors: string; year: number; tags: string[]; summary: string | null; dissertation_relevance: number | null; reading_status: string }
    // For search queries: use semantic/keyword search for top 5 relevant papers (fast, focused)
    // Always use ChromaDB semantic search — far more powerful than keyword matching
    {
      const [searchResult, projectsResult] = await Promise.all([
        executeKnowledgeAction('search_knowledge', { query: userMessage, top_k: 5 }),
        executeResearchAction('list_research_projects', {}),
      ])
      if (searchResult.ok && searchResult.data) {
        type Hit = { title?: string; authors?: string; year?: string | number; score?: number; snippet?: string }
        const hits = (searchResult.data as unknown as Hit[]).map(h => ({
          title: h.title, authors: h.authors, year: h.year,
          score: h.score, excerpt: h.snippet?.slice(0, 150),
        }))
        return {
          data: { relevant_papers: hits, projects: projectsResult.data },
          summary: `Top ${hits.length} semantically relevant papers from your library of 34.`,
        }
      }
    }
    // For general queries: inject compact library index (title + year only, up to 15)
    const [papersResult, projectsResult] = await Promise.all([
      executeResearchAction('list_papers', {}),
      executeResearchAction('list_research_projects', {}),
    ])
    const allPapers = (papersResult.data as PaperRow[] ?? [])
    const index = allPapers.slice(0, 15).map(p => `${p.title} (${p.authors?.split(',')[0] ?? ''}, ${p.year})`)
    return {
      data: { library_index: index, total: allPapers.length, projects: projectsResult.data },
      summary: `${allPapers.length} papers in library, ${projectsResult.message}`,
    }
  }

  if (agentId === 'knowledge') {
    // Search ChromaDB — skip pre-flight embed (too slow), let the action handle it
    // Only pre-fetch if ChromaDB is up (fast heartbeat check already done in executeKnowledgeAction)
    const result = await executeKnowledgeAction('search_knowledge', { query: userMessage, top_k: 4 })
    if (!result.ok) return null // ChromaDB down — fall through to LLM-only response
    return { data: result.data, summary: result.message }
  }

  return null
}

async function runAgent(
  agentId: AgentId,
  messages: { role: string; content: string }[],
  ctx: Awaited<ReturnType<typeof buildAgentContext>>
): Promise<{ reply: string; toolResults: unknown[] }> {
  const userMessage = messages[messages.length - 1]?.content ?? ''
  const systemPrompt = buildAgentSystemPrompt(agentId, ctx)
  const toolResults: unknown[] = []

  // 0. Intent shortcuts — handle unambiguous memory writes/reads without LLM
  if (agentId === 'memory') {
    const rememberMatch = userMessage.match(/^remember[:\s]+(.+)/i)
    if (rememberMatch) {
      const fact = rememberMatch[1].trim()
      // Auto-derive a key from the first few words
      const key = fact.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).slice(0, 4).join('_')
      const result = await executeMemoryAction('save', { key, value: fact, agent_id: 'memory' })
      return { reply: `Remembered: "${fact}"`, toolResults: [result] }
    }
    const forgetMatch = userMessage.match(/^forget[:\s]+(.+)/i)
    if (forgetMatch) {
      const key = forgetMatch[1].trim().toLowerCase().replace(/\s+/g, '_')
      const result = await executeMemoryAction('forget', { key, agent_id: 'memory' })
      return { reply: result.message, toolResults: [result] }
    }
  }

  // 1. Pre-flight: fetch data before asking the LLM (prevents hallucination)
  const pre = await preflight(agentId, userMessage)

  let augmentedMessages = messages
  let activeSystemPrompt = systemPrompt
  if (pre) {
    toolResults.push(pre.data)
    // Data already fetched — simplified prompt so model doesn't try to call tools again
    activeSystemPrompt = `You are a helpful ${agentId} assistant. The data below has already been fetched — do NOT emit tool blocks. Answer the user's question directly and concisely using only this data.`
    const dataContext = `[Live data from ${agentId}]\n${JSON.stringify(pre.data, null, 2)}\n\nSummary: ${pre.summary}`
    augmentedMessages = [
      ...messages.slice(0, -1),
      { role: 'user', content: `${userMessage}\n\n${dataContext}` },
    ]
  }

  // 2. LLM call — use per-agent custom model (baked-in context window + domain prompt)
  const agentModel = modelForAgent(agentId)
  const raw = await callOllama(augmentedMessages, activeSystemPrompt, agentModel)

  // 3. Parse any tool blocks (only ```tool fences — not json/code fences)
  let match
  const regex = new RegExp(TOOL_REGEX.source, 'g')
  while ((match = regex.exec(raw)) !== null) {
    try {
      const jsonStr = match[1].trim()
        .replace(/\\n/g, ' ')      // unescape \n inside strings
        .replace(/[\x00-\x1f\x7f]/g, ' ') // strip control chars
      const { action, params } = JSON.parse(jsonStr)
      if (!action) continue
      const result = await dispatchTool(agentId, action, params ?? {})
      toolResults.push(result)
    } catch {
      // Silently skip malformed tool blocks — don't surface parse errors to user
    }
  }

  // Strip only ```tool blocks from reply (leave ```json/code for display)
  const replyText = raw.replace(/```tool[\s\S]*?```/g, '').trim()
  return { reply: replyText, toolResults }
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  const body = await req.json()
  const { messages, model = 'deepseek-r1:7b', agentId: forcedAgent } = body
  // Accept both session_id (what client sends) and sessionId (legacy)
  const sessionId: string | undefined = body.sessionId ?? body.session_id
  const userMessage = messages[messages.length - 1]?.content ?? ''

  // 1. Build shared context once (cheap DB reads + file reads)
  const ctx = await buildAgentContext()

  // 2. Classify intent (local Ollama, ~500 tokens)
  const intent = forcedAgent
    ? { primaryAgent: forcedAgent as AgentId, secondaryAgents: [] as AgentId[], confidence: 1, reason: 'forced' }
    : await classifyIntent(userMessage, ctx)

  // 3. Run primary agent
  const agentIds = [intent.primaryAgent, ...intent.secondaryAgents]
  const responses = await Promise.all(
    agentIds.map(id => runAgent(id, messages, ctx).then(r => ({ agentId: id, ...r })))
  )

  // 4. Synthesize if multiple agents responded
  const finalReply = agentIds.length > 1
    ? await synthesize(responses.map(r => ({ agentId: r.agentId, reply: r.reply })), userMessage)
    : responses[0].reply

  const allToolResults = responses.flatMap(r => r.toolResults)

  const durationMs = Date.now() - startedAt

  // 5. Persist to Supabase — awaited so inserts complete before response returns
  const toolActions = allToolResults.map(r => {
    const res = r as { ok?: boolean; message?: string }
    return res.ok !== undefined ? `${res.ok ? '✓' : '✗'} ${res.message?.slice(0, 60)}` : String(r).slice(0, 60)
  })

  const persistOps = [
    supabase.from('agent_intent_log').insert({
      user_message: userMessage.slice(0, 500),
      primary_agent: intent.primaryAgent,
      secondary_agents: intent.secondaryAgents,
      confidence: intent.confidence,
      reason: intent.reason,
      session_id: sessionId ?? null,
      tool_actions: toolActions,
      tool_results_ok: allToolResults.map(r => (r as { ok?: boolean }).ok ?? true),
      reply_length: finalReply.length,
      duration_ms: durationMs,
    }).then(() => {}),
  ]

  // Persist messages sequentially (user then assistant) to guarantee correct order in DB
  const sessionPersist = sessionId ? (async () => {
    const lastUser = messages[messages.length - 1]
    await supabase.from('agent_messages').insert({ session_id: sessionId, role: lastUser.role, content: lastUser.content })
    await supabase.from('agent_messages').insert({ session_id: sessionId, role: 'assistant', content: finalReply, tool_results: allToolResults.length ? allToolResults : null })
    await supabase.from('agent_sessions').update({ last_message_at: new Date().toISOString(), agent_id: intent.primaryAgent }).eq('id', sessionId)
  })() : Promise.resolve()

  await Promise.all([...persistOps, sessionPersist])

  // 6. Auto-extract memories every 4 user messages (fire-and-forget)
  const userMsgCount = messages.filter((m: { role: string }) => m.role === 'user').length
  if (userMsgCount > 0 && userMsgCount % 4 === 0) {
    executeMemoryAction('extract_from_conversation', {
      messages: messages.slice(-8),
      agent_id: intent.primaryAgent,
    }).catch(() => {})
  }

  return NextResponse.json({
    reply: finalReply,
    toolResults: allToolResults,
    toolResult: allToolResults[0] ?? null,
    intent: {
      primaryAgent: intent.primaryAgent,
      secondaryAgents: intent.secondaryAgents,
      confidence: intent.confidence,
      reason: intent.reason,
    },
  })
}
