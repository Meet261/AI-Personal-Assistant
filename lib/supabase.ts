import { createClient } from '@supabase/supabase-js'

// This is a localhost-only personal app with no external users.
// RLS is enabled on the Supabase project so the anon key returns empty results.
// We use the service key so client pages can read/write directly.
// The key is exposed in the client bundle — acceptable for a local-only app.
// If you ever deploy this publicly, replace direct Supabase calls with API routes.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY!
)
