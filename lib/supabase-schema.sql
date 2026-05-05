-- Projects
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  status text default 'active' check (status in ('active','on_hold','completed','archived')),
  color text default '#6366f1',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tasks
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete set null,
  title text not null,
  description text default '',
  priority text default 'medium' check (priority in ('urgent','high','medium','low')),
  status text default 'todo' check (status in ('todo','in_progress','done','deferred')),
  effort text default 'M' check (effort in ('S','M','L','XL')),
  deadline date,
  scheduled_for date,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Journal entries
create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  completed_today text default '',
  blocked_or_pushed text default '',
  new_tasks text default '',
  energy_level integer default 3 check (energy_level between 1 and 5),
  tomorrow_focus text default '',
  ai_summary text default '',
  ai_tasks_scheduled jsonb default '[]',
  created_at timestamptz default now()
);

-- Daily briefings
create table if not exists daily_briefings (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  type text not null check (type in ('morning','evening')),
  content text default '',
  top_priorities jsonb default '[]',
  created_at timestamptz default now(),
  unique(date, type)
);

-- Task comments
create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists tasks_project_id_idx on tasks(project_id);
create index if not exists tasks_status_idx on tasks(status);
create index if not exists tasks_scheduled_for_idx on tasks(scheduled_for);
create index if not exists journal_entries_date_idx on journal_entries(date);
create index if not exists daily_briefings_date_idx on daily_briefings(date);
