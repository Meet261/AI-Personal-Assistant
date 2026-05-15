// ─── Model configuration — single source of truth ────────────────────────
// Monthly budget: $3-5
// Strategy: Ollama for everything, Haiku ONLY for Paper Digester (PDF comprehension)

import type { ModelTier } from './types'

export const OLLAMA_BASE = 'http://localhost:11434'
export const DEFAULT_LOCAL_MODEL = 'deepseek-r1:7b'

// Which model tier each agent uses
export const AGENT_MODEL_TIERS: Record<string, ModelTier> = {
  orchestrator:    'local',   // routing only
  assistant:       'local',   // tasks, projects, meetings
  research:        'local',   // papers, writing
  trading:         'local',   // CSV reads, risk state, finance
  journal:         'local',   // mood, energy, health logs
  scheduler:       'local',   // week view, cron alerts, calendar
  knowledge:       'local',   // RAG with nomic-embed-text + deepseek
  'paper-digester':'haiku',   // PDF deep comprehension — only API spend
  'habit-tracker': 'local',   // streaks, email digest
  memory:          'local',   // cross-agent memory, code debug
  email:           'local',   // Gmail IMAP/SMTP via Ollama triage
}

// Estimated tokens per call (for budget tracking)
export const AGENT_TOKEN_ESTIMATE: Record<string, { input: number; output: number }> = {
  orchestrator:    { input: 500,   output: 100  },
  assistant:       { input: 2000,  output: 500  },
  research:        { input: 2000,  output: 800  },
  trading:         { input: 1500,  output: 400  },
  journal:         { input: 1500,  output: 600  },
  scheduler:       { input: 1000,  output: 300  },
  'paper-digester':{ input: 15000, output: 1000 },  // PDF = large input
  'habit-tracker': { input: 800,   output: 300  },
}

// Haiku pricing (per million tokens, as of 2026)
export const HAIKU_COST_PER_M = { input: 0.25, output: 1.25 }

export function estimateCost(agentId: string, calls: number): number {
  const tier = AGENT_MODEL_TIERS[agentId]
  if (tier !== 'haiku') return 0
  const est = AGENT_TOKEN_ESTIMATE[agentId] ?? { input: 2000, output: 500 }
  return calls * (
    (est.input / 1_000_000) * HAIKU_COST_PER_M.input +
    (est.output / 1_000_000) * HAIKU_COST_PER_M.output
  )
}

// Call local Ollama
export async function callOllama(
  messages: { role: string; content: string }[],
  systemPrompt: string,
  model = DEFAULT_LOCAL_MODEL
): Promise<string> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        stream: false,
      }),
    })
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${res.statusText}`)
    const data = await res.json()
    return (data.message?.content as string ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Ollama unreachable (is it running?): ${msg}`)
  }
}

// Call Claude Haiku (API)
export async function callHaiku(
  messages: { role: string; content: string }[],
  systemPrompt: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set — needed for Paper Digester')

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      }),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Haiku API unreachable: ${msg}`)
  }
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Haiku error: ${res.status} ${err}`)
  }
  const data = await res.json()
  return data.content?.[0]?.text ?? ''
}
