-- ============================================================
-- Digest job queue + extended intent log
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- Async digest job queue
create table if not exists digest_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending','running','done','failed')),
  total_papers int not null default 0,
  processed int not null default 0,
  failed int not null default 0,
  current_paper text,          -- title of paper currently being digested
  error text,
  force boolean not null default false,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Extend agent_intent_log with tool call details
alter table agent_intent_log
  add column if not exists tool_actions text[] default '{}',
  add column if not exists tool_results_ok boolean[] default '{}',
  add column if not exists reply_length int,
  add column if not exists duration_ms int;
