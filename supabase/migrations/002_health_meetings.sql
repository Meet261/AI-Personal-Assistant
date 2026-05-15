-- ============================================================
-- Phase 2: Health logs + Meetings tables
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- Health logs (workout, sleep, meal — stored as JSONB for flexibility)
create table if not exists health_logs (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  log_type text not null check (log_type in ('workout', 'sleep', 'meal', 'other')),
  data jsonb not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists health_logs_date_idx on health_logs(date);
create index if not exists health_logs_type_idx on health_logs(log_type);

-- Meetings (for Assistant agent — prep, notes, action items)
create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  time text,                             -- e.g. "14:00"
  attendees text[] default '{}',
  agenda text,
  notes text,                            -- captured during/after meeting
  action_items text[] default '{}',      -- auto-extracted action items
  follow_up_sent boolean default false,
  project_id uuid references projects(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meetings_date_idx on meetings(date);
