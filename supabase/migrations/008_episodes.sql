create extension if not exists vector;

-- Episodic memory: one row per agent session turn with reasoning trace
create table if not exists agent_episodes (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid,
  agent_id      text not null,
  user_message  text not null,
  agent_reply   text not null,
  tool_actions  text[],
  reasoning     text,           -- extracted <think>…</think> trace if present
  embedding     vector(768),    -- nomic-embed-text embedding of user_message
  created_at    timestamptz not null default now()
);

create index if not exists agent_episodes_agent_idx    on agent_episodes(agent_id);
create index if not exists agent_episodes_session_idx  on agent_episodes(session_id);
create index if not exists agent_episodes_created_idx  on agent_episodes(created_at desc);
-- pgvector cosine similarity index for episode retrieval
create index if not exists agent_episodes_embed_idx    on agent_episodes using ivfflat (embedding vector_cosine_ops) with (lists = 10);

-- RPC for semantic episode retrieval
create or replace function match_episodes(
  query_embedding vector(768),
  agent_filter    text,
  match_count     int default 3
)
returns table (
  id            uuid,
  user_message  text,
  agent_reply   text,
  tool_actions  text[],
  created_at    timestamptz,
  similarity    float
)
language sql stable
as $$
  select
    id,
    user_message,
    agent_reply,
    tool_actions,
    created_at,
    1 - (embedding <=> query_embedding) as similarity
  from agent_episodes
  where agent_id = agent_filter
    and embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;
