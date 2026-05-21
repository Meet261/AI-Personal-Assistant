-- Email inbox cache — avoids repeated IMAP round-trips
create table if not exists email_cache (
  id          text primary key,          -- 'inbox:{gmail_user}' or 'email:{uid}'
  data        jsonb        not null,
  cached_at   timestamptz  not null default now(),
  expires_at  timestamptz  not null
);

create index if not exists email_cache_expires_idx on email_cache (expires_at);
