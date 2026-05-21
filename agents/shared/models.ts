// ─── Model configuration — single source of truth ────────────────────────
// LLM routing:
//   Chat agents     → DeepSeek V3  ($0.27/M in · $1.10/M out)
//   Research agent  → DeepSeek R1  ($0.55/M in · $2.19/M out) — better academic reasoning
//   Paper Digester  → Claude Haiku ($0.25/M in · $1.25/M out) — cheapest for large PDF input
//   Embeddings      → Jina AI      (free up to 1M tokens/month)
// Ollama fully removed — all calls go to cloud APIs.

import type { ModelTier } from './types'

// Which model tier each agent uses (for cost tracking + routing)
export const AGENT_MODEL_TIERS: Record<string, ModelTier> = {
  orchestrator:    'local',   // 'local' = DeepSeek V3 in this context
  assistant:       'local',
  research:        'local',
  trading:         'local',
  journal:         'local',
  scheduler:       'local',
  knowledge:       'local',
  'paper-digester':'haiku',
  'habit-tracker': 'local',
  memory:          'local',
  email:           'local',
}

// Token estimates for cost tracking
export const AGENT_TOKEN_ESTIMATE: Record<string, { input: number; output: number }> = {
  orchestrator:    { input: 1500,  output: 500  },
  assistant:       { input: 1500,  output: 500  },
  research:        { input: 3000,  output: 1000 },
  trading:         { input: 1500,  output: 400  },
  journal:         { input: 1500,  output: 600  },
  scheduler:       { input: 1000,  output: 300  },
  'paper-digester':{ input: 15000, output: 1000 },
  'habit-tracker': { input: 800,   output: 300  },
}

export const HAIKU_COST_PER_M  = { input: 0.25,  output: 1.25  }
export const V3_COST_PER_M     = { input: 0.27,  output: 1.10  }
export const R1_COST_PER_M     = { input: 0.55,  output: 2.19  }

export function estimateCost(agentId: string, calls: number): number {
  const tier = AGENT_MODEL_TIERS[agentId]
  if (tier !== 'haiku') return 0
  const est = AGENT_TOKEN_ESTIMATE[agentId] ?? { input: 2000, output: 500 }
  return calls * (
    (est.input  / 1_000_000) * HAIKU_COST_PER_M.input +
    (est.output / 1_000_000) * HAIKU_COST_PER_M.output
  )
}

// ── Shared DeepSeek request helper ───────────────────────────────────────────
async function deepSeekRequest(
  model: 'deepseek-chat' | 'deepseek-reasoner',
  messages: { role: string; content: string }[],
  systemPrompt: string,
  options: { temperature?: number; max_tokens?: number; timeout?: number } = {}
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set')

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: options.temperature ?? 0.0,
      max_tokens:  options.max_tokens  ?? 1024,
    }),
    signal: AbortSignal.timeout(options.timeout ?? 30_000),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`DeepSeek ${model} error: ${res.status} ${err}`)
  }
  const data = await res.json()
  return (data.choices?.[0]?.message?.content as string ?? '').trim()
}

// V3 — structured JSON tool dispatch (deterministic, short output)
export async function callDeepSeekV3(
  messages: { role: string; content: string }[],
  systemPrompt: string,
): Promise<string> {
  return deepSeekRequest('deepseek-chat', messages, systemPrompt, { temperature: 0.0, max_tokens: 512 })
}

// V3 — conversational agent responses (drop-in for the old callOllama)
export async function callDeepSeekChat(
  messages: { role: string; content: string }[],
  systemPrompt: string,
): Promise<string> {
  return deepSeekRequest('deepseek-chat', messages, systemPrompt, { temperature: 0.3, max_tokens: 1500 })
}

// R1 — deep reasoning for research analysis, contradiction detection
export async function callDeepSeekR1(
  messages: { role: string; content: string }[],
  systemPrompt: string,
): Promise<string> {
  return deepSeekRequest('deepseek-reasoner', messages, systemPrompt, { temperature: 0.6, max_tokens: 2000, timeout: 60_000 })
}

// ── Jina AI embeddings (free, 768-dim — matches existing ChromaDB collection) ─
// Free tier: 1M tokens/month. After that: $0.02/1M tokens.
// Model: jina-embeddings-v2-base-en  Dimensions: 768
export async function callJinaEmbed(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.JINA_API_KEY // optional — works without key on free tier
  const res = await fetch('https://api.jina.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: 'jina-embeddings-v2-base-en',
      input: texts,
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Jina embed error: ${res.status} ${err}`)
  }
  const data = await res.json()
  return (data.data as { embedding: number[] }[]).map(d => d.embedding)
}

// ── Claude Haiku — Paper Digester only ───────────────────────────────────────
export async function callHaiku(
  messages: { role: string; content: string }[],
  systemPrompt: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set — needed for Paper Digester')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
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
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Haiku error: ${res.status} ${err}`)
  }
  const data = await res.json()
  return data.content?.[0]?.text ?? ''
}
