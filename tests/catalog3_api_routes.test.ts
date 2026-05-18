import test from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { __resetSupabaseStore, __seed, __table } from '@supabase/supabase-js'

import * as tasksRoute from '../app/api/tasks/route.ts'
import * as projectsRoute from '../app/api/projects/route.ts'
import * as commentsRoute from '../app/api/comments/route.ts'
import * as researchProjectsRoute from '../app/api/research/projects/route.ts'
import * as researchPapersRoute from '../app/api/research/papers/route.ts'
import * as researchHighlightsRoute from '../app/api/research/highlights/route.ts'
import * as researchCategoriesRoute from '../app/api/research/categories/route.ts'
import * as researchAppStaticRoute from '../app/api/research-app/static/[file]/route.ts'
import * as researchAppPapersRoute from '../app/api/research-app/papers/[file]/route.ts'
import * as habitRoute from '../app/api/agents/habit/route.ts'
import * as schedulerRoute from '../app/api/agents/scheduler/route.ts'
import * as cascadeRoute from '../app/api/agents/cascade/route.ts'
import * as briefingRoute from '../app/api/briefing/route.ts'

function req(url: string, init?: RequestInit) {
  return new NextRequest(url, init)
}

async function readTextBody(r: Response) {
  const buf = await r.arrayBuffer()
  return Buffer.from(buf).toString('utf8')
}

test('Catalog 3: /api/tasks CRUD', async () => {
  __resetSupabaseStore()
  __seed('projects', [{ id: 'p1', name: 'Alpha', status: 'active' }])
  __seed('tasks', [{ id: 't1', title: 'A', status: 'todo', priority: 'high', project_id: 'p1' }])

  {
    const res = await tasksRoute.GET(req('http://localhost:3000/api/tasks'))
    const data = await res.json()
    assert.equal(Array.isArray(data), true)
    assert.equal(data.length, 1)
  }

  {
    const res = await tasksRoute.POST(req('http://localhost:3000/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'B', status: 'todo', priority: 'low' }),
    }))
    const data = await res.json()
    assert.equal(data.title, 'B')
    assert.equal(__table('tasks').length, 2)
  }

  {
    const res = await tasksRoute.PATCH(req('http://localhost:3000/api/tasks', {
      method: 'PATCH',
      body: JSON.stringify({ id: 't1', status: 'done' }),
    }))
    const data = await res.json()
    assert.equal(data.status, 'done')
  }

  {
    const res = await tasksRoute.DELETE(req('http://localhost:3000/api/tasks?id=t1', { method: 'DELETE' }))
    const data = await res.json()
    assert.equal(data.success, true)
    assert.equal(__table('tasks').length, 1)
  }
})

test('Catalog 3: /api/projects CRUD', async () => {
  __resetSupabaseStore()
  __seed('projects', [{ id: 'p1', name: 'Alpha', status: 'active', created_at: '2026-01-01' }])

  const list = await (await projectsRoute.GET()).json()
  assert.equal(list.length, 1)

  const created = await (await projectsRoute.POST(req('http://localhost:3000/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name: 'Beta', status: 'active' }),
  }))).json()
  assert.equal(created.name, 'Beta')

  const updated = await (await projectsRoute.PATCH(req('http://localhost:3000/api/projects', {
    method: 'PATCH',
    body: JSON.stringify({ id: created.id, status: 'archived' }),
  }))).json()
  assert.equal(updated.status, 'archived')

  const del = await (await projectsRoute.DELETE(req(`http://localhost:3000/api/projects?id=${created.id}`, { method: 'DELETE' }))).json()
  assert.equal(del.success, true)
})

test('Catalog 3: /api/comments CRUD (basic)', async () => {
  __resetSupabaseStore()
  __seed('task_comments', [{ id: 'c1', task_id: 't1', body: 'hello', created_at: '2026-01-01' }])

  const list = await (await commentsRoute.GET(req('http://localhost:3000/api/comments?task_id=t1'))).json()
  assert.equal(list.length, 1)

  const created = await (await commentsRoute.POST(req('http://localhost:3000/api/comments', {
    method: 'POST',
    body: JSON.stringify({ task_id: 't1', body: 'world' }),
  }))).json()
  assert.equal(created.body, 'world')

  const del = await (await commentsRoute.DELETE(req(`http://localhost:3000/api/comments?id=${created.id}`, { method: 'DELETE' }))).json()
  assert.equal(del.success, true)
})

test('Catalog 3: Research CRUD (projects, papers, categories, highlights)', async () => {
  __resetSupabaseStore()

  const cat = await (await researchCategoriesRoute.POST(req('http://localhost:3000/api/research/categories', {
    method: 'POST',
    body: JSON.stringify({ name: 'ML' }),
  }))).json()
  assert.equal(cat.name, 'ML')

  const proj = await (await researchProjectsRoute.POST(req('http://localhost:3000/api/research/projects', {
    method: 'POST',
    body: JSON.stringify({ name: 'Thesis', status: 'active' }),
  }))).json()
  assert.equal(proj.name, 'Thesis')

  const paper = await (await researchPapersRoute.POST(req('http://localhost:3000/api/research/papers', {
    method: 'POST',
    body: JSON.stringify({ title: 'Paper A', reading_status: 'reading', project_id: proj.id }),
  }))).json()
  assert.equal(paper.title, 'Paper A')

  const hl = await (await researchHighlightsRoute.POST(req('http://localhost:3000/api/research/highlights', {
    method: 'POST',
    body: JSON.stringify({ paper_id: paper.id, selected_text: 'Important', page_number: 1 }),
  }))).json()
  assert.equal(hl.selected_text, 'Important')

  const hls = await (await researchHighlightsRoute.GET(req(`http://localhost:3000/api/research/highlights?paper_id=${paper.id}`))).json()
  assert.equal(hls.length, 1)
})

test('Catalog 3: Research-app static + paper serving rejects traversal and serves fixtures', async () => {
  const okStatic = await researchAppStaticRoute.GET(
    req('http://localhost:3000/api/research-app/static/pdf-manifest.json'),
    { params: Promise.resolve({ file: 'pdf-manifest.json' }) }
  )
  assert.equal(okStatic.status, 200)
  assert.equal(okStatic.headers.get('content-type'), 'application/json')

  const badPaper = await researchAppPapersRoute.GET(
    req('http://localhost:3000/api/research-app/papers/../../secret'),
    { params: Promise.resolve({ file: '../secret.pdf' }) }
  )
  assert.equal(badPaper.status, 400)

  const okPaper = await researchAppPapersRoute.GET(
    req('http://localhost:3000/api/research-app/papers/example.pdf'),
    { params: Promise.resolve({ file: 'example.pdf' }) }
  )
  assert.equal(okPaper.status, 200)
  assert.equal(okPaper.headers.get('content-type'), 'application/pdf')
})

test('Catalog 3: Habit agent endpoints', async () => {
  __resetSupabaseStore()
  __seed('habits', [{ id: 'h1', name: 'Walk', active: true, created_at: '2026-01-01' }])

  const res = await habitRoute.GET(req('http://localhost:3000/api/agents/habit?action=get_habits'))
  const data = await res.json()
  assert.equal(data.ok, true)
  assert.equal(data.data.length, 1)

  const toggle = await (await habitRoute.POST(req('http://localhost:3000/api/agents/habit', {
    method: 'POST',
    body: JSON.stringify({ action: 'toggle_today', params: { habit_id: 'h1' } }),
  }))).json()
  assert.equal(toggle.ok, true)
})

test('Catalog 3: Scheduler and cascade endpoints return stable shape', async () => {
  __resetSupabaseStore()
  __seed('tasks', [{ id: 't1', title: 'Overdue', status: 'todo', deadline: '2000-01-01' }])

  const sch = await (await schedulerRoute.POST(req('http://localhost:3000/api/agents/scheduler', {
    method: 'POST',
    body: JSON.stringify({ cron: true }),
  }))).json()
  assert.equal(typeof sch.ok, 'boolean')

  const cas = await (await cascadeRoute.POST()).json()
  assert.equal(typeof cas.ok, 'boolean')
  assert.ok('tradingOutcome' in cas)
})

test('Catalog 3: Briefing POST streams SSE done event; PUT/GET persist', async () => {
  __resetSupabaseStore()
  __seed('projects', [{ id: 'p1', name: 'Alpha', status: 'active' }])
  __seed('tasks', [{ id: 't1', title: 'Task', status: 'todo', priority: 'high', effort: 'M' }])

  // Mock Ollama streaming endpoint called by briefing route.
  const prevFetch = globalThis.fetch
  globalThis.fetch = async (url: any) => {
    const u = String(url)
    if (u.includes('http://localhost:11434/api/chat')) {
      const chunks = [
        JSON.stringify({ message: { content: 'Hello ' } }) + '\n',
        JSON.stringify({ message: { content: 'World\nPRIORITIES_JSON: [\"A\",\"B\",\"C\"]' } }) + '\n',
      ]
      const stream = new ReadableStream({
        start(controller) {
          for (const c of chunks) controller.enqueue(new TextEncoder().encode(c))
          controller.close()
        }
      })
      return new Response(stream, { status: 200 })
    }
    return prevFetch(url)
  }

  const res = await briefingRoute.POST(req('http://localhost:3000/api/briefing', {
    method: 'POST',
    body: JSON.stringify({ type: 'morning', date: '2026-05-18' }),
  }))
  assert.equal(res.headers.get('content-type'), 'text/event-stream')
  const text = await readTextBody(res)
  assert.ok(text.includes('"done":true'), 'done event emitted')

  // Persist via PUT and then GET it back.
  await briefingRoute.PUT(req('http://localhost:3000/api/briefing', {
    method: 'PUT',
    body: JSON.stringify({ date: '2026-05-18', type: 'morning', content: 'Saved', top_priorities: ['A','B','C'] }),
  }))
  const got = await (await briefingRoute.GET(req('http://localhost:3000/api/briefing?date=2026-05-18&type=morning'))).json()
  assert.equal(got.content, 'Saved')

  globalThis.fetch = prevFetch
})
