import test from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { __resetSupabaseStore, __seed, __table } from '@supabase/supabase-js'

import { POST as orchestratorPOST } from '../app/api/orchestrator/route.ts'

test('Catalog 2: orchestrator accepts session_id and executes tool blocks', async () => {
  __resetSupabaseStore()
  __seed('projects', [{ id: 'p1', name: 'Alpha', status: 'active' }])

  ;(globalThis as any).__TEST_OLLAMA_RESULT__ = [
    'Sure — I will add that.',
    '```tool',
    JSON.stringify({ action: 'add_task', params: { title: 'Test task', project_name: 'Alpha', priority: 'high' } }),
    '```',
    'Done.',
  ].join('\n')

  const req = new NextRequest('http://localhost:3000/api/orchestrator', {
    method: 'POST',
    body: JSON.stringify({
      agentId: 'assistant',
      session_id: 's1',
      messages: [{ role: 'user', content: 'Add a task: Test task for Alpha' }],
    }),
  })

  const res = await orchestratorPOST(req)
  assert.equal(res.status, 200)
  const body = await res.json()

  assert.ok(typeof body.reply === 'string')
  assert.ok(!body.reply.includes('```tool'), 'tool block stripped from reply')
  assert.ok(Array.isArray(body.toolResults))
  assert.equal(body.intent.primaryAgent, 'assistant')

  // Allow microtasks for fire-and-forget supabase writes to settle.
  await Promise.resolve()
  await Promise.resolve()

  const tasks = __table('tasks')
  assert.equal(tasks.length, 1)
  assert.equal(tasks[0].title, 'Test task')

  const msgs = __table('agent_messages')
  assert.equal(msgs.length, 2, 'user + assistant messages persisted')
  assert.equal(msgs[0].session_id, 's1')
})

test('Catalog 2: orchestrator also accepts legacy sessionId field', async () => {
  __resetSupabaseStore()
  ;(globalThis as any).__TEST_OLLAMA_RESULT__ = 'Hello.'

  const req = new NextRequest('http://localhost:3000/api/orchestrator', {
    method: 'POST',
    body: JSON.stringify({
      agentId: 'assistant',
      sessionId: 'legacy',
      messages: [{ role: 'user', content: 'hi' }],
    }),
  })

  const res = await orchestratorPOST(req)
  assert.equal(res.status, 200)

  await Promise.resolve()
  const msgs = __table('agent_messages')
  assert.equal(msgs.length, 2)
  assert.equal(msgs[0].session_id, 'legacy')
})

