import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('Catalog 4: cron schedules nightly cascade and weekly habit digest', () => {
  const src = readFileSync(new URL('../scripts/cron.mjs', import.meta.url), 'utf8')

  // Nightly scheduler + cascade at 21:00.
  assert.ok(src.includes("scheduleDaily(21,  0,  'Nightly Scheduler + Cascade'"), 'nightly schedule exists')
  assert.ok(src.includes('/api/agents/cascade'), 'cascade endpoint called')

  // Weekly digest at 20:00, Sunday check enforced.
  assert.ok(src.includes("scheduleDaily(20,  0,  'Weekly Habit Digest'"), 'weekly digest schedule exists')
  assert.ok(src.includes('getDay() // 0 = Sunday'), 'Sunday guard exists')
})

