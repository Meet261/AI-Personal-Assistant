import { createClient } from '@supabase/supabase-js'

// localhost-only app — service key used client-side intentionally (no RLS, no public deployment).
// NEXT_PUBLIC_ prefix required so Next.js bundles it for client components.
// If ever deployed publicly: move all DB calls to API routes and use the anon key here.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  (process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY)!
)
