-- ============================================================
-- Agent Ecosystem Tables
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- Token usage tracking (budget monitoring)
create table if not exists agent_token_usage (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(10, 6) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists agent_token_usage_agent_id_idx on agent_token_usage(agent_id);
create index if not exists agent_token_usage_created_at_idx on agent_token_usage(created_at);

-- Scheduler alerts (proactive nudges from scheduler agent)
create table if not exists scheduler_alerts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  priority text not null default 'medium',  -- low/medium/high/urgent
  agent_id text not null default 'scheduler',
  dismissed boolean not null default false,
  action_url text,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
create index if not exists scheduler_alerts_dismissed_idx on scheduler_alerts(dismissed);

-- Habits (for habit tracker agent)
create table if not exists habits (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  frequency text not null default 'daily',  -- daily/weekly
  target_days text[] default '{}',           -- e.g. ['mon','tue','wed','thu','fri']
  color text not null default '#0F766E',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Habit completion logs
create table if not exists habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references habits(id) on delete cascade,
  date date not null,
  completed boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  unique(habit_id, date)
);
create index if not exists habit_logs_habit_id_date_idx on habit_logs(habit_id, date);

-- Agent intent log (for debugging + improving routing)
create table if not exists agent_intent_log (
  id uuid primary key default gen_random_uuid(),
  user_message text not null,
  primary_agent text not null,
  secondary_agents text[] default '{}',
  confidence numeric(3,2),
  reason text,
  session_id uuid,
  created_at timestamptz not null default now()
);
