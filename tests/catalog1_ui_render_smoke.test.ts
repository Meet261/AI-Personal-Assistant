import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'

const pages: { name: string; path: string }[] = [
  { name: '/', path: '../app/page.tsx' },
  { name: '/agents', path: '../app/agents/page.tsx' },
  { name: '/agent', path: '../app/agent/page.tsx' },
  { name: '/tasks', path: '../app/tasks/page.tsx' },
  { name: '/projects', path: '../app/projects/page.tsx' },
  { name: '/projects/[id]', path: '../app/projects/[id]/page.tsx' },
  { name: '/journal', path: '../app/journal/page.tsx' },
  { name: '/habits', path: '../app/habits/page.tsx' },
  { name: '/checkin', path: '../app/checkin/page.tsx' },
  { name: '/briefing/morning', path: '../app/briefing/morning/page.tsx' },
  { name: '/briefing/evening', path: '../app/briefing/evening/page.tsx' },
  { name: '/timer', path: '../app/timer/page.tsx' },
  { name: '/agents/research', path: '../app/agents/research/page.tsx' },
  { name: '/agents/knowledge', path: '../app/agents/knowledge/page.tsx' },
  { name: '/agents/digester', path: '../app/agents/digester/page.tsx' },
  { name: '/agents/trading', path: '../app/agents/trading/page.tsx' },
  { name: '/agents/journal', path: '../app/agents/journal/page.tsx' },
  { name: '/agents/scheduler', path: '../app/agents/scheduler/page.tsx' },
  { name: '/agents/habit-tracker', path: '../app/agents/habit-tracker/page.tsx' },
  { name: '/agents/memory', path: '../app/agents/memory/page.tsx' },
  { name: '/agents/email', path: '../app/agents/email/page.tsx' },
  { name: '/agents/trace', path: '../app/agents/trace/page.tsx' },
]

test('Catalog 1: all UI pages server-render without crashing', async () => {
  for (const p of pages) {
    // eslint-disable-next-line no-await-in-loop
    const mod = await import(p.path)
    const Page = mod.default
    assert.equal(typeof Page, 'function', `default export is component for ${p.name}`)
    assert.doesNotThrow(() => {
      const html = renderToString(React.createElement(Page))
      assert.ok(typeof html === 'string')
    }, `renders: ${p.name}`)
  }
})

