import test from 'node:test'
import assert from 'node:assert/strict'

const modules: string[] = [
  // API routes
  '../app/api/activity/route.ts',
  '../app/api/agent-history/route.ts',
  '../app/api/agents/build/route.ts',
  '../app/api/agents/cascade/route.ts',
  '../app/api/agents/email/route.ts',
  '../app/api/agents/habit/route.ts',
  '../app/api/agents/import-trades/route.ts',
  '../app/api/agents/journal/route.ts',
  '../app/api/agents/launch/route.ts',
  '../app/api/agents/memory/route.ts',
  '../app/api/agents/paper-digester/route.ts',
  '../app/api/agents/reconcile/route.ts',
  '../app/api/agents/scheduler/route.ts',
  '../app/api/agents/trace/route.ts',
  '../app/api/agents/trading/route.ts',
  '../app/api/agents/trading/trades/route.ts',
  '../app/api/ai/agent/route.ts',
  '../app/api/ai/chat/route.ts',
  '../app/api/ai/schedule/route.ts',
  '../app/api/briefing/route.ts',
  '../app/api/checkin/route.ts',
  '../app/api/comments/route.ts',
  '../app/api/journal/route.ts',
  '../app/api/knowledge/route.ts',
  '../app/api/migrate/route.ts',
  '../app/api/orchestrator/route.ts',
  '../app/api/projects/route.ts',
  '../app/api/research-app/route.ts',
  '../app/api/research-app/papers/[file]/route.ts',
  '../app/api/research-app/static/[file]/route.ts',
  '../app/api/research/categories/route.ts',
  '../app/api/research/highlights/route.ts',
  '../app/api/research/papers/route.ts',
  '../app/api/research/pdfs/route.ts',
  '../app/api/research/projects/route.ts',
  '../app/api/tasks/route.ts',
  '../app/api/trading/summary/route.ts',

  // Specialists / orchestrator core
  '../agents/orchestrator/index.ts',
  '../agents/shared/context.ts',
  '../agents/specialist/assistant.ts',
  '../agents/specialist/habit-tracker.ts',
  '../agents/specialist/journal.ts',
  '../agents/specialist/knowledge.ts',
  '../agents/specialist/memory.ts',
  '../agents/specialist/research.ts',
  '../agents/specialist/scheduler.ts',
  '../agents/specialist/trading.ts',
  '../agents/specialist/email.ts',
  '../agents/specialist/paper-digester.ts',
]

test('Catalog 0: all key modules import without throwing', async () => {
  for (const m of modules) {
    // eslint-disable-next-line no-await-in-loop
    const mod = await import(m)
    assert.ok(mod, `module loaded: ${m}`)
  }
})

