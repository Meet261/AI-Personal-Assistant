// Test bootstrap: keep imports deterministic and prevent accidental external calls.

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost:54321'
process.env.SUPABASE_SERVICE_KEY ||= 'test-service-key'
process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY ||= 'test-public-service-key'
process.env.NEXT_PUBLIC_APP_URL ||= 'http://localhost:3000'

// Avoid noisy experimental warnings in test output (Node TypeScript stripping).
process.removeAllListeners('warning')

