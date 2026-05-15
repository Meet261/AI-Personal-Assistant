import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { classifyIntent, buildAgentSystemPrompt, synthesize } from '@/agents/orchestrator'
import { buildAgentContext } from '@/agents/shared/context'
import { callOllama } from '@/agents/shared/models'
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const TOOL_REGEX = /```(?:tool|json)\s*([\s\S]*?)```/g

// ── Dispatch a single tool call to the right executor ────────────────────
async function dispatchTool(agentId: AgentId, action: string, params: Record<string, unknown>) {
  switch (agentId) {
    case 'assistant':      return executeAssistantAction(action, params)
    case 'research':       return executeResearchAction(action, params)
    case 'trading':        return executeTradingAction(action, params)
    case 'journal':        return executeJournalAction(action, params)
    case 'scheduler':      return executeSchedulerAction(action, params)
    case 'habit-tracker':  return executeHabitAction(action, params)
    case 'knowledge':      return executeKnowledgeAction(action, params)
    case 'memory':         return executeMemoryAction(action, params)
    case 'email':          return executeEmailAction(action, params)
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
    const result = executeTradingAction('get_performance_summary', {})
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
    const result = await executeHabitAction('get_streaks', {})
    return { data: result.data, summary: result.message }
  }

  if (agentId === 'email' && /unread|inbox|check|how many|triage/i.test(m)) {
    const result = await executeEmailAction('get_unread_count', {})
    return { data: result.data, summary: result.message }
  }

  if (agentId === 'knowledge') {
    // Extract search query and hit ChromaDB directly
    const result = await executeKnowledgeAction('search_knowledge', { query: userMessage, top_k: 5 })
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
  if (pre) {
    toolResults.push(pre.data)
    // Inject fetched data as a system context message before the LLM call
    const dataContext = `[Data fetched from your ${agentId} database]\n${JSON.stringify(pre.data, null, 2)}\n\nSummary: ${pre.summary}\n\nNow answer the user's question using only this data. Be concise and natural.`
    augmentedMessages = [
      ...messages.slice(0, -1),
      { role: 'user', content: `${userMessage}\n\n${dataContext}` },
    ]
  }

  // 2. LLM call — may still emit tool blocks for write operations
  const raw = await callOllama(augmentedMessages, systemPrompt)

  // 3. Parse any additional tool blocks (write operations like save, send, etc.)
  let match
  const regex = new RegExp(TOOL_REGEX.source, 'g')
  while ((match = regex.exec(raw)) !== null) {
    try {
      const { action, params } = JSON.parse(match[1].trim())
      const result = await dispatchTool(agentId, action, params ?? {})
      toolResults.push(result)
    } catch (e) {
      toolResults.push({ ok: false, message: `Parse error: ${String(e)}` })
    }
  }

  const replyText = raw.replace(/```(?:tool|json)[\s\S]*?```/g, '').trim()
  return { reply: replyText, toolResults }
}

export async function POST(req: NextRequest) {
  const { messages, sessionId, model = 'deepseek-r1:7b', agentId: forcedAgent } = await req.json()
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

  // 5. Persist to Supabase
  if (sessionId) {
    const lastUser = messages[messages.length - 1]
    Promise.all([
      supabase.from('agent_messages').insert({ session_id: sessionId, role: lastUser.role, content: lastUser.content }),
      supabase.from('agent_messages').insert({ session_id: sessionId, role: 'assistant', content: finalReply, tool_results: allToolResults.length ? allToolResults : null }),
      supabase.from('agent_sessions').update({ last_message_at: new Date().toISOString(), agent_id: intent.primaryAgent }).eq('id', sessionId),
    ]).then(() => {})
  }

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
