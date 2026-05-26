import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { classifyIntent, buildAgentSystemPrompt, synthesize } from '@/agents/orchestrator'
import { buildAgentContext } from '@/agents/shared/context'
import { callDeepSeekChat, callDeepSeekV3 } from '@/agents/shared/models'
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
import { storeEpisode, retrieveSimilarEpisodes } from '@/agents/shared/episodes'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const TOOL_REGEX = /```tool\s*([\s\S]*?)```/g

// ── Per-agent tool allowlists — agents can only call their own actions ────
const AGENT_TOOL_ALLOWLIST: Record<string, string[]> = {
  assistant:      ['add_task','add_project','add_project_with_tasks','bulk_add_tasks','list_tasks','list_projects','update_task_status','update_task','delete_task','delete_project','create_meeting','get_meetings','get_past_meetings','capture_meeting_notes','extract_action_items','prep_meeting_brief'],
  trading:        ['get_risk_state','get_recent_trades','get_today_trades','get_performance_summary','get_recent_predictions'],
  journal:        ['get_today_entry','save_entry','get_energy_pattern','get_recent_entries','log_health'],
  scheduler:      ['get_week_view','get_overdue','get_alerts','dismiss_alert','dismiss_all_alerts','schedule_task','batch_schedule','get_all_tasks','get_projects','create_event'],
  'habit-tracker':['get_habits','create_habit','update_habit','delete_habit','get_grid','toggle_today','log_habit','get_streaks','get_weekly_summary','send_weekly_digest'],
  knowledge:      ['search_knowledge','embed_paper','embed_all_papers','status','reindex'],
  memory:         ['save','recall','forget','get_summary','list','debug_code','extract_from_conversation'],
  email:          ['get_unread_count','fetch_inbox','read_email','triage_inbox','summarize_email','draft_reply','send_email','send_reply','search_emails'],
  'paper-digester':['digest_one','digest_all','get_jobs','extract_arguments_for','get_undigested'],
  research:       ['list_research_projects','list_papers','search_papers','get_paper_details','list_highlights','get_reading_stats','draft_section','outline_chapter','improve_paragraph','find_citations_for','fetch_citations','get_citations','find_foundational_papers','find_contradictions','find_citation_gaps'],
}

// ── Dispatch a single tool call to the right executor ────────────────────
async function dispatchTool(agentId: AgentId, action: string, params: Record<string, unknown>) {
  // Allowlist check — agent can only call its own actions
  const allowed = AGENT_TOOL_ALLOWLIST[agentId]
  if (allowed && !allowed.includes(action)) {
    console.warn(`[tool-governance] ${agentId} attempted disallowed action: ${action}`)
    return { ok: false, message: `Action "${action}" is not permitted for ${agentId} agent` }
  }
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
  try {
  const m = userMessage.toLowerCase()

  // Episodes run in parallel with agent-specific data fetching
  const episodePromise = retrieveSimilarEpisodes({ query: userMessage, agentId, topK: 3 })

  let agentData: { data: unknown; summary: string } | null = null

  if (agentId === 'memory') {
    const result = await executeMemoryAction('get_summary', {})
    agentData = { data: result.data, summary: result.message }
  }

  else if (agentId === 'trading') {
    if (/today|this session|right now|recent|latest|just now|friday|yesterday|last session/i.test(m)) {
      const [todayResult, summaryResult] = await Promise.all([
        executeTradingAction('get_today_trades', {}),
        executeTradingAction('get_performance_summary', {}),
      ])
      agentData = {
        data: { today: todayResult.data, overall: summaryResult.data },
        summary: `Today: ${todayResult.message}. Overall: ${summaryResult.message}`,
      }
    } else {
      const result = await executeTradingAction('get_performance_summary', {})
      agentData = { data: result.data, summary: result.message }
    }
  }

  else if (agentId === 'journal') {
    if (/pattern|energy|week|trend|how (am|was|have)/i.test(m)) {
      const result = await executeJournalAction('get_energy_pattern', { days: 14 })
      agentData = { data: result.data, summary: result.message }
    } else {
      const result = await executeJournalAction('get_today_entry', {})
      agentData = { data: result.data, summary: result.message }
    }
  }

  else if (agentId === 'scheduler') {
    const [alerts, overdue, allTasks, projects] = await Promise.all([
      executeSchedulerAction('get_alerts', {}),
      executeSchedulerAction('get_overdue', {}),
      executeSchedulerAction('get_all_tasks', {}),
      executeSchedulerAction('get_projects', {}),
    ])
    agentData = {
      data: {
        alerts: alerts.data,
        overdue: overdue.data,
        // Inject ALL real tasks so the model cannot hallucinate task names
        all_tasks: allTasks.data,
        projects: projects.data,
      },
      summary: `${alerts.message} · ${overdue.message} · ${allTasks.message} · ${projects.message}`,
    }
  }

  else if (agentId === 'habit-tracker') {
    const result = await executeHabitAction('get_weekly_summary', {})
    agentData = { data: result.data, summary: result.message }
  }

  else if (agentId === 'email') {
    if (/summar|latest|recent|last email|read.*email|what.*email|show.*email/i.test(m)) {
      // Fetch latest email UID then summarize (summary is cached per UID)
      const inboxResult = await executeEmailAction('fetch_inbox', { limit: 1, unread_only: false })
      if (!inboxResult.ok) {
        agentData = { data: null, summary: `Failed to fetch email: ${inboxResult.message}` }
      } else if (Array.isArray(inboxResult.data) && inboxResult.data.length > 0) {
        const latest = inboxResult.data[0] as { uid: number }
        const summaryResult = await executeEmailAction('summarize_email', { uid: latest.uid })
        agentData = { data: summaryResult.ok ? summaryResult.data : null, summary: summaryResult.ok ? summaryResult.message : `Failed: ${summaryResult.message}` }
      } else {
        agentData = { data: null, summary: 'No emails found in inbox' }
      }
    } else if (/triage|priorit/i.test(m)) {
      const result = await executeEmailAction('triage_inbox', { limit: 15 })
      agentData = { data: result.data, summary: result.message }
    } else if (/unread|inbox|check|how many/i.test(m)) {
      const result = await executeEmailAction('get_unread_count', {})
      agentData = { data: result.data, summary: result.message }
    } else {
      // Default: fetch recent inbox
      const result = await executeEmailAction('fetch_inbox', { limit: 10, unread_only: false })
      agentData = { data: result.data, summary: result.message }
    }
  }

  else if (agentId === 'research') {
    type PaperRow = { id: string; title: string; authors: string; year: number; tags: string[]; summary: string | null; dissertation_relevance: number | null; reading_status: string }

    // Contradiction detector
    if (/contradict|conflict|disagree|opposing|tension between|papers disagree/i.test(m)) {
      const result = await executeResearchAction('find_contradictions', {})
      agentData = { data: result.data, summary: result.message }
    }

    // Citation gap finder
    else if (/citation gap|missing paper|not in (my )?library|foundational.*missing|gap.*citat/i.test(m)) {
      const result = await executeResearchAction('find_citation_gaps', {})
      agentData = { data: result.data, summary: result.message }
    }

    // For questions about a specific paper's details/methodology/arguments: fetch full paper record
    else if (/methodology|main.?claim|argument|limitation|finding|contribution|from the .+paper|paper.{0,30}(watts|dakos|romero|baumgartner|velickovic|milo|lazer|dorogovtsev)/i.test(m)) {
      const detailResult = await executeResearchAction('get_paper_details', { query: userMessage })
      if (detailResult.ok && detailResult.data) {
        agentData = {
          data: { paper: detailResult.data },
          summary: `Full details for: ${detailResult.message}`,
        }
      }
    }

    if (!agentData) {
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
        agentData = {
          data: { relevant_papers: hits, projects: projectsResult.data },
          summary: `Top ${hits.length} semantically relevant papers from your library.`,
        }
      } else {
        const [papersResult, projectsResult2] = await Promise.all([
          executeResearchAction('list_papers', {}),
          executeResearchAction('list_research_projects', {}),
        ])
        const allPapers = (papersResult.data as PaperRow[] ?? [])
        const index = allPapers.slice(0, 15).map(p => `${p.title} (${p.authors?.split(',')[0] ?? ''}, ${p.year})`)
        agentData = {
          data: { library_index: index, total: allPapers.length, projects: projectsResult2.data },
          summary: `${allPapers.length} papers in library, ${projectsResult2.message}`,
        }
      }
    }
  }

  else if (agentId === 'knowledge') {
    const result = await executeKnowledgeAction('search_knowledge', { query: userMessage, top_k: 4 })
    if (result.ok) agentData = { data: result.data, summary: result.message }
  }

  else if (agentId === 'paper-digester') {
    // If user asks about a specific paper's content, look it up by author name or keyword
    if (/methodology|claim|finding|limitation|argument|summary|from the|about the/i.test(m)) {
      // Extract the most useful search term: prefer author surnames or quoted titles
      const authorMatch = m.match(/\b(watts|dakos|romero|baumgartner|velickovic|milo|lazer|dorogovtsev|[a-z]{4,})\s+\d{4}\b/)
      const keyword = authorMatch?.[1] ?? userMessage.replace(/give me|what is|the|from|paper|\d{4}/gi, '').trim().split(/\s+/)[0]
      if (keyword) {
        const detailResult = await executeResearchAction('get_paper_details', { query: keyword })
        if (detailResult.ok && detailResult.data) {
          agentData = { data: { paper: detailResult.data }, summary: detailResult.message }
        }
      }
    }
  }

  // Merge episodes into result
  const episodes = await episodePromise
  if (!agentData && !episodes.length) return null

  if (!agentData) {
    return { data: { past_episodes: episodes }, summary: `${episodes.length} similar past conversations retrieved` }
  }

  if (episodes.length) {
    agentData = {
      data: { ...(agentData.data as object), past_episodes: episodes },
      summary: agentData.summary,
    }
  }

  return agentData
  } catch (err) {
    console.error('[preflight]', agentId, err instanceof Error ? err.message : err)
    return null
  }
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
  // Agents that need pre-loaded data but also need to emit write tool blocks
  const WRITE_CAPABLE_AGENTS = new Set(['scheduler', 'assistant', 'habit-tracker'])

  if (pre) {
    toolResults.push(pre.data)
    const dataContext = `[Live data — already fetched, do NOT call read tools again]\n${JSON.stringify(pre.data, null, 2)}\n\nSummary: ${pre.summary}`

    if (WRITE_CAPABLE_AGENTS.has(agentId)) {
      // Keep the full system prompt (with tool rules) but inject data into the user turn
      // so the model can still emit write tool blocks (batch_schedule, add_task, etc.)
      augmentedMessages = [
        ...messages.slice(0, -1),
        { role: 'user', content: `${userMessage}\n\n${dataContext}` },
      ]
    } else {
      // Read-only agents: no tool blocks needed, override with simple prompt
      activeSystemPrompt = `You are a helpful ${agentId} assistant. The data below has already been fetched — do NOT emit tool blocks. Answer the user's question directly and concisely using only this data.`
      augmentedMessages = [
        ...messages.slice(0, -1),
        { role: 'user', content: `${userMessage}\n\n${dataContext}` },
      ]
    }
  }

  // 2. Choose model based on task:
  //    - Pre-flight path (data already injected): R1 for reasoning — no tool calls needed
  //    - No pre-flight (write ops, open-ended): V3 for reliable tool-call JSON, then R1 for final reply
  const hasDeepSeekKey = !!process.env.DEEPSEEK_API_KEY
  const agentModel = "deepseek-chat"

  let raw: string
  if (pre && !WRITE_CAPABLE_AGENTS.has(agentId)) {
    // Read-only pre-flight — pure reasoning, no tool calls needed
    raw = await callDeepSeekChat(augmentedMessages, activeSystemPrompt)
  } else if (hasDeepSeekKey) {
    // Detect confirmation on write-capable agents (user says "yes/go ahead/schedule it")
    const isConfirmation = WRITE_CAPABLE_AGENTS.has(agentId) &&
      /^(yes|yeah|yep|go ahead|schedule it|do it|confirm|ok|sure|execute|apply|write it|save it|lock it in|sounds good|looks good)/i.test(userMessage.trim())

    // Step A: V3 generates the tool block (fast, reliable JSON)
    const toolInstruction = isConfirmation
      ? `CRITICAL: The user has confirmed. You MUST now emit the appropriate write tool block to execute the action. Output ONLY the tool block — no text before or after:
\`\`\`tool
{"action":"<write_action>","params":{...}}
\`\`\``
      : `IMPORTANT: If you need data or want to take an action, emit exactly ONE tool block:
\`\`\`tool
{"action":"<action>","params":{}}
\`\`\`
If no tool is needed, answer directly in plain English.`

    const toolSystemPrompt = `${activeSystemPrompt}\n\n${toolInstruction}`
    const v3Raw = await callDeepSeekV3(augmentedMessages, toolSystemPrompt)

    // Check if V3 emitted a tool block
    TOOL_REGEX.lastIndex = 0
    const toolMatch = TOOL_REGEX.exec(v3Raw)

    if (toolMatch) {
      // Execute the tool call from V3
      try {
        const jsonStr = toolMatch[1].trim().replace(/[\x00-\x1f\x7f]/g, ' ')
        const { action, params } = JSON.parse(jsonStr)
        if (action) {
          const result = await dispatchTool(agentId, action, params ?? {})
          toolResults.push(result)
          // Step B: R1 generates the final human reply using tool result
          const resultContext = `Tool result: ${JSON.stringify(result)}`
          const finalMessages = [
            ...augmentedMessages.slice(0, -1),
            { role: 'user', content: `${userMessage}\n\n${resultContext}` },
          ]
          const finalSystemPrompt = `You are a helpful ${agentId} assistant. A tool was already called and returned the data above. Answer the user's question naturally using this data. Do NOT emit tool blocks.`
          raw = await callDeepSeekChat(finalMessages, finalSystemPrompt)
        } else {
          raw = v3Raw.replace(/```tool[\s\S]*?```/g, '').trim()
        }
      } catch {
        raw = v3Raw.replace(/```tool[\s\S]*?```/g, '').trim()
      }
    } else {
      // V3 answered directly — use its response
      raw = v3Raw
    }
  } else {
    // No DeepSeek key — fall back to R1 for everything
    raw = await callDeepSeekChat(augmentedMessages, activeSystemPrompt)
  }

  // 3. Parse any remaining tool blocks from R1 (write operations not caught above)
  let match
  const regex = new RegExp(TOOL_REGEX.source, 'g')
  while ((match = regex.exec(raw)) !== null) {
    try {
      const jsonStr = match[1].trim()
        .replace(/\\n/g, ' ')
        .replace(/[\x00-\x1f\x7f]/g, ' ')
      const { action, params } = JSON.parse(jsonStr)
      if (!action) continue
      const result = await dispatchTool(agentId, action, params ?? {})
      toolResults.push(result)
    } catch {
      // Silently skip malformed tool blocks
    }
  }

  const replyText = raw.replace(/```tool[\s\S]*?```/g, '').trim()
  return { reply: replyText, toolResults }
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { messages, model = 'deepseek-r1:7b', agentId: forcedAgent } = body
  // Accept both session_id (what client sends) and sessionId (legacy)
  const sessionId: string | undefined = body.sessionId ?? body.session_id
  const userMessage = messages[messages.length - 1]?.content ?? ''

  try {
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

  // Estimate V3 cost: ~1050 input + 80 output tokens per tool call at $0.27/$1.10 per M
  const v3Used = !!process.env.DEEPSEEK_API_KEY && allToolResults.length > 0
  const estimatedCostUsd = v3Used
    ? Number(((1050 * 0.27 + 80 * 1.10) / 1_000_000 * allToolResults.length).toFixed(6))
    : 0

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
      model_used: "deepseek-chat",
      v3_used: v3Used,
      estimated_cost_usd: estimatedCostUsd,
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

  // 7. Store episode — awaited so the row exists before response returns (embedding backfills async)
  const thinkMatch = finalReply.match(/<think>([\s\S]*?)<\/think>/i)
  await storeEpisode({
    sessionId:   sessionId ?? null,
    agentId:     intent.primaryAgent,
    userMessage,
    agentReply:  finalReply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim(),
    toolActions,
    reasoning:   thinkMatch?.[1]?.trim(),
  }).catch(() => {})

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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[orchestrator]', msg)
    return NextResponse.json({ error: msg, reply: '⚠️ Something went wrong. Please try again.', toolResults: [] }, { status: 500 })
  }
}
