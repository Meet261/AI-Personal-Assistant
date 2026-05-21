// Episodic memory: store + retrieve past agent sessions by semantic similarity
// Episodes are embedded (Jina AI, 768-dim) and stored in agent_episodes table.
// Retrieval uses pgvector cosine similarity so the LLM can reference past conversations.

import { createClient } from '@supabase/supabase-js'
import { callJinaEmbed } from './models'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

async function embedText(text: string): Promise<number[] | null> {
  try {
    const embeddings = await callJinaEmbed([text])
    return embeddings[0] ?? null
  } catch {
    return null
  }
}

// ── Store an episode (called after each orchestrator turn) ────────────────
// Insert episode immediately (no embedding), then backfill embedding in a separate update.
// This avoids losing the episode if Next.js kills background work after the response is sent.
export async function storeEpisode(opts: {
  sessionId:   string | null
  agentId:     string
  userMessage: string
  agentReply:  string
  toolActions: string[]
  reasoning?:  string
}): Promise<void> {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const sessionId = opts.sessionId && UUID_RE.test(opts.sessionId) ? opts.sessionId : null

  const { data, error } = await supabase.from('agent_episodes').insert({
    session_id:   sessionId,
    agent_id:     opts.agentId,
    user_message: opts.userMessage.slice(0, 1000),
    agent_reply:  opts.agentReply.slice(0, 2000),
    tool_actions: opts.toolActions,
    reasoning:    opts.reasoning?.slice(0, 500) ?? null,
    embedding:    null,
  }).select('id').single()

  if (error) { console.error('[episodes] insert error:', error.message); return }
  if (!data?.id) { console.error('[episodes] insert returned no id'); return }

  // Backfill embedding asynchronously — if Next.js kills this, the row still exists
  embedText(opts.userMessage).then(embedding => {
    if (embedding) {
      supabase.from('agent_episodes').update({ embedding }).eq('id', data.id).then(() => {})
    }
  }).catch(() => {})
}

// ── Retrieve similar past episodes for a query ────────────────────────────
export async function retrieveSimilarEpisodes(opts: {
  query:   string
  agentId: string
  topK?:   number
}): Promise<{ userMessage: string; agentReply: string; createdAt: string }[]> {
  const topK = opts.topK ?? 3
  const embedding = await embedText(opts.query)
  if (!embedding) return []

  // pgvector cosine similarity via RPC
  const { data, error } = await supabase.rpc('match_episodes', {
    query_embedding: embedding,
    agent_filter:    opts.agentId,
    match_count:     topK,
  })

  if (error || !data?.length) return []

  return data.map((e: { user_message: string; agent_reply: string; created_at: string }) => ({
    userMessage: e.user_message,
    agentReply:  e.agent_reply.slice(0, 400),
    createdAt:   e.created_at.slice(0, 10),
  }))
}
