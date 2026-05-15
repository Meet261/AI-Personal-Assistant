import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

// Client-side: anon key only (safe to expose — RLS controls access)
// Server-side API routes use SUPABASE_SERVICE_KEY directly (never NEXT_PUBLIC_)
export const supabase = createClient(
  supabaseUrl,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
