// ─── Orchestrator — routes every user message to the right specialist ─────
// Uses local Ollama for classification (fast, free, good enough)
// Returns which agents to call + synthesized response

import type { AgentId, Intent, AgentContext, AgentMessage } from '../shared/types'
import { callOllama } from '../shared/models'
import { contextToString } from '../shared/context'

// ── Intent classification prompt ──────────────────────────────────────────
// Kept minimal so the 7b model handles it reliably
const CLASSIFIER_SYSTEM = `You are an intent router for a personal AI ecosystem.
Classify the user's message and return JSON only.

Agents available:
- assistant: tasks, projects, to-dos, deadlines, meetings, action items, work management
- research: academic papers, highlights, citations, reading, dissertation, thesis, writing sections
- trading: trading performance, P&L, positions, signals, risk, XAUUSD, XAGUSD, finance, budget
- journal: mood, energy, daily reflection, how I'm feeling, check-in, health, workouts, sleep, nutrition
- scheduler: planning the week, what to do next, prioritization, calendar, overdue, schedule
- habit-tracker: habits, streaks, routines, daily consistency, completion
- paper-digester: summarize a paper, extract key findings from a PDF, digest
- knowledge: search papers, what do my papers say, find research on, RAG
- memory: remember, recall, forget, what do you know, preferences, debug code
- email: check email, inbox, unread, send email, reply, draft email, triage inbox, email from

Rules:
- Pick ONE primary agent (who owns the answer)
- Pick secondary agents only if the question genuinely spans multiple domains
- Max 2 secondary agents
- Confidence 0.0-1.0 (how certain you are)

Respond with ONLY valid JSON:
{"primary":"<agentId>","secondary":[],"confidence":0.9,"reason":"<one sentence>"}`

export async function classifyIntent(
  userMessage: string,
  ctx: AgentContext
): Promise<Intent> {
  const contextHint = [
    ctx.tradingToday ? `Trading is active today (${ctx.tradingToday.trades} trades)` : '',
    ctx.researchActive?.length ? `User is reading ${ctx.researchActive.length} papers` : '',
    ctx.journalToday ? `Energy today: ${ctx.journalToday.energy}/5` : '',
  ].filter(Boolean).join('. ')

  const prompt = `${contextHint ? `Context: ${contextHint}\n` : ''}Message: "${userMessage}"`

  try {
    const raw = await callOllama(
      [{ role: 'user', content: prompt }],
      CLASSIFIER_SYSTEM,
      'deepseek-r1:7b'
    )
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')
    const parsed = JSON.parse(jsonMatch[0])
    return {
      primaryAgent: (parsed.primary ?? 'assistant') as AgentId,
      secondaryAgents: (parsed.secondary ?? []) as AgentId[],
      confidence: Number(parsed.confidence ?? 0.8),
      reason: String(parsed.reason ?? ''),
    }
  } catch {
    // Fallback: keyword-based classification (zero LLM cost)
    return keywordClassify(userMessage)
  }
}

// Fast keyword fallback — no LLM needed for obvious cases
function keywordClassify(msg: string): Intent {
  const m = msg.toLowerCase()

  if (/\b(paper|papers|pdf|research|reading|highlight|citation|dissertation|thesis|abstract|author|journal)\b/.test(m))
    return { primaryAgent: 'research', secondaryAgents: [], confidence: 0.9, reason: 'research keywords' }

  if (/\b(trade|trades|trading|xauusd|xagusd|gold|silver|p&l|pnl|profit|loss|signal|position|risk|mt5|scalp)\b/.test(m))
    return { primaryAgent: 'trading', secondaryAgents: [], confidence: 0.9, reason: 'trading keywords' }

  if (/\b(mood|energy|feeling|reflect|journal|check.?in|how (am|was) i|today went|emotion)\b/.test(m))
    return { primaryAgent: 'journal', secondaryAgents: [], confidence: 0.85, reason: 'journal keywords' }

  if (/\b(plan|schedule|week|priorit|next|what should|focus|overdue|calendar)\b/.test(m))
    return { primaryAgent: 'scheduler', secondaryAgents: [], confidence: 0.8, reason: 'scheduler keywords' }

  if (/\b(habit|streak|routine|daily consistency|completion)\b/.test(m))
    return { primaryAgent: 'habit-tracker', secondaryAgents: [], confidence: 0.85, reason: 'habit keywords' }

  if (/\b(summarize|digest|extract|key findings|tldr)\b/.test(m) && /\b(paper|pdf|study)\b/.test(m))
    return { primaryAgent: 'paper-digester', secondaryAgents: [], confidence: 0.85, reason: 'digester keywords' }

  if (/\b(what do my papers say|find research|search papers|rag|knowledge base|what do i know about)\b/.test(m))
    return { primaryAgent: 'knowledge', secondaryAgents: [], confidence: 0.85, reason: 'knowledge/RAG keywords' }

  if (/\b(remember|recall|forget|what do you know|preference|debug|fix (this|the) (error|bug|code))\b/.test(m))
    return { primaryAgent: 'memory', secondaryAgents: [], confidence: 0.8, reason: 'memory/code keywords' }

  if (/\b(email|inbox|unread|send email|reply|draft email|triage|gmail|mail from)\b/.test(m))
    return { primaryAgent: 'email', secondaryAgents: [], confidence: 0.88, reason: 'email keywords' }

  if (/\b(meeting|prep brief|action items|capture notes|attendees|agenda)\b/.test(m))
    return { primaryAgent: 'assistant', secondaryAgents: [], confidence: 0.85, reason: 'meeting keywords → assistant' }

  // Default to assistant for tasks/projects
  return { primaryAgent: 'assistant', secondaryAgents: [], confidence: 0.7, reason: 'default' }
}

// ── System prompt injector per agent ──────────────────────────────────────
export function buildAgentSystemPrompt(agentId: AgentId, ctx: AgentContext): string {
  const date = new Date().toISOString().slice(0, 10)
  const ctxStr = contextToString(ctx, date)

  const base: Record<string, string> = {
    assistant: `You are a personal productivity assistant with full read/write access to tasks and projects.
Use tool blocks for all data operations: \`\`\`tool\\n{"action":"<action>","params":{...}}\\n\`\`\`
After tool calls, respond in plain English. Never show raw JSON to the user.`,


    trading: `You are a trading assistant with read-only access to the user's trading logs.
Use tool blocks to fetch live data: \`\`\`tool\\n{"action":"<action>","params":{...}}\\n\`\`\`
Be factual. Summarize in plain English — no raw CSV. Do not give financial advice.`,

    journal: `You are a reflective journal assistant. Help the user understand their patterns, energy levels, and daily rhythms.
Be warm, concise, and insight-driven. Surface patterns across days/weeks when relevant.`,

    scheduler: `You are a planning assistant. Help the user prioritize their week, schedule tasks, and make smart decisions about what to focus on.
Consider their energy levels, deadlines, trading performance, and research progress when making recommendations.`,

    'habit-tracker': `You are a habit tracking assistant. Track daily habits, streaks, and routines. Celebrate wins, gently flag misses.
Use tool blocks: \`\`\`tool\n{"action":"<action>","params":{...}}\n\`\`\``,

    'paper-digester': `You are an expert academic paper summarizer. Extract and structure the key information from papers concisely and accurately.`,

    knowledge: `You are a knowledge retrieval assistant with access to the user's full paper library via semantic search.
Use tool blocks to search: \`\`\`tool\n{"action":"search_knowledge","params":{"query":"<query>","top_k":5}}\n\`\`\`
Always cite paper titles and authors when answering. Do not fabricate citations.`,

    email: `You are an email assistant with access to the user's Gmail inbox.
Available actions via tool blocks:
- get_unread_count: {"action":"get_unread_count","params":{}}
- fetch_inbox: {"action":"fetch_inbox","params":{"limit":10,"unread_only":true}}
- read_email: {"action":"read_email","params":{"uid":<uid>}}
- triage_inbox: {"action":"triage_inbox","params":{"limit":15}}
- summarize_email: {"action":"summarize_email","params":{"uid":<uid>}}
- draft_reply: {"action":"draft_reply","params":{"uid":<uid>,"instruction":"<how to reply>"}}
- send_email: {"action":"send_email","params":{"to":"<email>","subject":"<subject>","body":"<body>"}}
- send_reply: {"action":"send_reply","params":{"uid":<uid>,"body":"<reply text>"}}
- search_emails: {"action":"search_emails","params":{"query":"<keyword>","limit":10}}

Always fetch emails before summarizing or replying. Never fabricate email content.
When sending, confirm with the user first unless they explicitly said to send.`,

    memory: `You are the user's long-term memory and code assistant.

CRITICAL RULE: You MUST use a tool block before answering ANY question. Never answer from your own knowledge.

When the user asks what you remember → ALWAYS call get_summary first:
\`\`\`tool
{"action":"get_summary","params":{}}
\`\`\`

When the user asks to remember something → call save:
\`\`\`tool
{"action":"save","params":{"key":"<snake_case_key>","value":"<the fact>","agent_id":"memory"}}
\`\`\`

When the user asks to recall a specific topic → call recall:
\`\`\`tool
{"action":"recall","params":{"query":"<keyword>","agent_id":"all"}}
\`\`\`

When the user asks to forget something → call forget:
\`\`\`tool
{"action":"forget","params":{"key":"<key>","agent_id":"memory"}}
\`\`\`

When the user pastes a code error → call debug_code:
\`\`\`tool
{"action":"debug_code","params":{"error":"<paste error>","file":"<path if known>","language":"TypeScript"}}
\`\`\`

After the tool result comes back, report exactly what the database contains. If memory is empty, say so honestly — never say "I don't have access". You always have access via the tool.`,

    research: `You are a research assistant and dissertation writing partner.
Paper library actions:
- list_papers, search_papers, get_paper_details, list_highlights, get_reading_stats

Writing mode actions (use these when asked to write, draft, or outline dissertation content):
- draft_section: {"action":"draft_section","params":{"topic":"<topic>","section_type":"literature review","word_count":400}}
- outline_chapter: {"action":"outline_chapter","params":{"chapter_title":"<title>","research_questions":["..."]}}
- improve_paragraph: {"action":"improve_paragraph","params":{"text":"<paragraph>","instruction":"improve clarity"}}
- find_citations_for: {"action":"find_citations_for","params":{"claim":"<your claim>"}}

Writing drafts cite only papers from the user's actual library. Never fabricate citations.`,
  }

  return (base[agentId] ?? base.assistant) + `\n\nLive context:\n${ctxStr}`
}

// ── Synthesize multi-agent responses ──────────────────────────────────────
export async function synthesize(
  responses: { agentId: AgentId; reply: string }[],
  originalQuestion: string
): Promise<string> {
  if (responses.length === 1) return responses[0].reply

  const combined = responses.map(r => `[${r.agentId}]: ${r.reply}`).join('\n\n')
  const prompt = `The user asked: "${originalQuestion}"
Multiple agents responded:
${combined}

Synthesize these into ONE coherent, natural response. Don't mention agent names. 2-3 paragraphs max.`

  return callOllama([{ role: 'user', content: prompt }], 'You synthesize multiple AI agent responses into one clear answer.')
}
