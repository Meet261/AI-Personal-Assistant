-- Extend agent_intent_log with model and cost tracking
alter table agent_intent_log
  add column if not exists model_used text,
  add column if not exists v3_used boolean default false,
  add column if not exists estimated_cost_usd numeric(10,6);

-- Separate table for individual tool call events (one row per tool dispatch)
create table if not exists agent_tool_events (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid,
  agent_id     text not null,
  action       text not null,
  params       jsonb,
  result_ok    boolean,
  result_preview text,
  latency_ms   int,
  created_at   timestamptz not null default now()
);

create index if not exists agent_tool_events_session_idx on agent_tool_events(session_id);
create index if not exists agent_tool_events_agent_idx   on agent_tool_events(agent_id);
create index if not exists agent_tool_events_created_idx on agent_tool_events(created_at desc);
