-- Agent conversation sessions
create table if not exists agent_sessions (
  id uuid primary key default gen_random_uuid(),
  title text,                        -- auto-generated summary title
  summary text,                      -- AI-generated summary for old sessions
  message_count integer default 0,
  started_at timestamptz default now(),
  last_message_at timestamptz default now()
);

-- Individual messages within a session
create table if not exists agent_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references agent_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  tool_results jsonb,                -- array of tool call results for assistant messages
  created_at timestamptz default now()
);

-- Activity log — every task/project change
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  type text not null,                -- 'task_created' | 'task_updated' | 'task_deleted' | 'project_created' | 'project_deleted'
  entity_type text not null,         -- 'task' | 'project'
  entity_id uuid,
  entity_title text,
  meta jsonb,                        -- extra info: { priority, status, from_status, to_status, project_name, ... }
  source text default 'manual',      -- 'manual' | 'agent'
  created_at timestamptz default now()
);

-- Indexes
create index if not exists agent_messages_session_id_idx on agent_messages(session_id);
create index if not exists agent_messages_created_at_idx on agent_messages(created_at);
create index if not exists agent_sessions_started_at_idx on agent_sessions(started_at);
create index if not exists activity_log_created_at_idx on activity_log(created_at);
create index if not exists activity_log_entity_id_idx on activity_log(entity_id);

-- Disable RLS (personal app)
alter table agent_sessions disable row level security;
alter table agent_messages disable row level security;
alter table activity_log disable row level security;
