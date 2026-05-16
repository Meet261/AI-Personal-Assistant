-- Agent memory table — stores key facts extracted from conversations
-- Run in Supabase Dashboard → SQL Editor

create table if not exists agent_memory (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null default 'assistant',
  key text not null,
  value text not null,
  source_session_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(agent_id, key)
);

create index if not exists agent_memory_agent_id_idx on agent_memory(agent_id);
