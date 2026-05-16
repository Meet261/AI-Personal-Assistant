-- Add agent_id to agent_sessions so sessions are namespaced per agent
-- Run in Supabase Dashboard → SQL Editor

alter table agent_sessions
  add column if not exists agent_id text not null default 'assistant';

create index if not exists agent_sessions_agent_id_idx on agent_sessions(agent_id);
