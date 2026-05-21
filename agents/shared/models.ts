// ─── Model configuration — single source of truth ────────────────────────
// Monthly budget: $3-5
// Strategy: Ollama for everything, Haiku ONLY for Paper Digester (PDF comprehension)

import type { ModelTier } from './types'

export const OLLAMA_BASE = 'http://localhost:11434'
export const DEFAULT_LOCAL_MODEL = 'deepseek-r1:7b'

// Per-agent custom models — Modelfiles bake in 16K+ context, tuned temp, and domain system prompts
// Create with: ollama create <name> -f modelfiles/Modelfile.<name>
export const AGENT_MODELS: Record<string, string> = {
  assistant:  'pa-assistant',   // deepseek-r1:7b + 16K ctx + productivity prompt
  trading:    'pa-trading',     // deprecated — veto now uses Claude Haiku via API
  research:   'pa-research',    // deepseek-r1:7b + 32K ctx + critical analysis prompt
}

// Which model tier each agent uses
export const AGENT_MODEL_TIERS: Record<string, ModelTier> = {
  orchestrator:    'local',
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
export function modelForAgent(agentId: string): string {
  return AGENT_MODELS[agentId] ?? DEFAULT_LOCAL_MODEL
}

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
      signal: AbortSignal.timeout(240_000), // 4 min max per LLM call
    })
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${res.statusText}`)
    const data = await res.json()
    return (data.message?.content as string ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Ollama unreachable (is it running?): ${msg}`)
  }
}

// Call DeepSeek V3 via API — used for structured tool-call dispatch
// Much more reliable than R1 for JSON output; costs ~$0.28/M input tokens
export async function callDeepSeekV3(
  messages: { role: string; content: string }[],
  systemPrompt: string,
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set')

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat', // V3
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: 0.0,       // zero temp for deterministic tool JSON
      max_tokens: 512,        // tool calls are short — cap spend
    }),
    signal: AbortSignal.timeout(30_000), // 30s — V3 is fast
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`DeepSeek V3 error: ${res.status} ${err}`)
  }
  const data = await res.json()
  return (data.choices?.[0]?.message?.content as string ?? '').trim()
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
