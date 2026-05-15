import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function POST() {
  // Create task_comments table by inserting then catching — real approach is raw sql
  // Supabase JS client doesn't expose raw DDL, so we use a workaround:
  // insert a row with a fake uuid to a non-existent table — if we get table-not-found
  // we know we need to create it via the REST sql endpoint
  const { error } = await supabase.from('task_comments').select('id').limit(1)
  if (!error) return NextResponse.json({ ok: true, message: 'table already exists' })

  // Table doesn't exist — use postgres function via rpc if available
  // Fallback: return instructions
  return NextResponse.json({
    ok: false,
    message: 'Run this SQL in your Supabase dashboard → SQL Editor',
    sql: `
create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);
create index if not exists task_comments_task_id_idx on task_comments(task_id);
    `.trim()
  })
}
