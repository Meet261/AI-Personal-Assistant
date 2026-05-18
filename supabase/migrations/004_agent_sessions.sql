-- Agent conversation sessions and messages
create table if not exists agent_sessions (
  id            uuid primary key default gen_random_uuid(),
  agent_id      text not null default 'assistant',
  title         text,
  summary       text,
  message_count int not null default 0,
  started_at    timestamptz not null default now(),
  last_message_at timestamptz
);

create index if not exists agent_sessions_agent_id_idx on agent_sessions(agent_id);
create index if not exists agent_sessions_started_at_idx on agent_sessions(started_at desc);

create table if not exists agent_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references agent_sessions(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  tool_results jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists agent_messages_session_id_idx on agent_messages(session_id);
create index if not exists agent_messages_created_at_idx on agent_messages(created_at);
