/**
 * Cron scheduler — run alongside Next.js via `npm run dev:all` or `npm run cron`
 * 08:00 → morning briefing generated + emailed
 * 21:00 → evening summary generated + emailed
 */

import nodemailer from 'nodemailer'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// Load .env.local (Next.js doesn't inject it into plain Node processes)
try {
  const __dir  = dirname(fileURLToPath(import.meta.url))
  const envPath = resolve(__dir, '../.env.local')
  const lines   = readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (!(key in process.env)) process.env[key] = val
  }
} catch { /* .env.local optional */ }

const APP_URL      = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const GMAIL_USER   = process.env.GMAIL_USER            // your gmail address
const GMAIL_PASS   = process.env.GMAIL_APP_PASSWORD    // gmail app password (16-char)
const NOTIFY_EMAIL = process.env.BRIEFING_NOTIFY_EMAIL || GMAIL_USER

function pad(n) { return String(n).padStart(2, '0') }

function scheduleDaily(hour, minute, label, fn) {
  let firedToday = false
  let lastDate   = ''

  function tick() {
    const now  = new Date()
    // Use local date (not UTC) so the date matches the local clock hour
    const date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
    const h    = now.getHours()
    const m    = now.getMinutes()

    // Reset fired flag at local midnight
    if (date !== lastDate) { firedToday = false; lastDate = date }

    if (h === hour && m === minute && !firedToday) {
      firedToday = true
      console.log(`[cron] ${pad(h)}:${pad(m)} — running: ${label}`)
      fn(date).catch(e => console.error(`[cron] ${label} failed:`, e))
    }

    setTimeout(tick, 30_000) // check every 30 s for ±30 s accuracy
  }
  tick()
}

// ── Consume SSE stream from /api/briefing POST ──────────────────────────────
async function streamBriefing(type, date) {
  const res = await fetch(`${APP_URL}/api/briefing`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ type, date }),
  })

  if (!res.ok) throw new Error(`POST /api/briefing failed: ${res.status}`)

  const reader  = res.body.getReader()
  const decoder = new TextDecoder()
  let   buf     = ''
  let   result  = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })

    const lines = buf.split('\n')
    buf = lines.pop() // keep incomplete last line

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const payload = JSON.parse(line.slice(6))
        if (payload.done) result = { content: payload.content, top_priorities: payload.top_priorities }
      } catch { /* skip malformed */ }
    }
  }

  if (!result) throw new Error('Stream ended without a done event')
  return result
}

// ── Save to DB via PUT /api/briefing ────────────────────────────────────────
async function saveBriefing(date, type, content, top_priorities) {
  const res = await fetch(`${APP_URL}/api/briefing`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ date, type, content, top_priorities }),
  })
  if (!res.ok) throw new Error(`PUT /api/briefing failed: ${res.status}`)
}

// ── Send Gmail ───────────────────────────────────────────────────────────────
async function sendEmail(subject, htmlBody) {
  if (!GMAIL_USER || !GMAIL_PASS) {
    console.warn('[cron] GMAIL_USER / GMAIL_APP_PASSWORD not set — skipping email')
    return
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS },
  })

  await transporter.sendMail({
    from:    `"Personal Assistant" <${GMAIL_USER}>`,
    to:      NOTIFY_EMAIL,
    subject,
    html:    htmlBody,
  })

  console.log(`[cron] Email sent → ${NOTIFY_EMAIL}`)
}

// ── Build HTML email ─────────────────────────────────────────────────────────
function buildEmailHtml(type, date, content, priorities) {
  const label    = type === 'morning' ? 'Morning Briefing' : 'Evening Summary'
  const gradient = type === 'morning'
    ? 'linear-gradient(135deg,#92400E 0%,#D97706 100%)'
    : 'linear-gradient(135deg,#1e3a5f 0%,#2563EB 100%)'

  const priorityRows = priorities.map((p, i) => `
    <tr>
      <td style="padding:8px 0;vertical-align:top;width:38px">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:#0d9488;color:#fff;font-weight:900;font-size:12px">${i + 1}</span>
      </td>
      <td style="padding:8px 0 8px 10px;font-size:14px;line-height:1.5;color:#1a1a1a">${p}</td>
    </tr>`).join('')

  const paragraphs = content
    .split('\n\n')
    .filter(Boolean)
    .map(p => `<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#333">${p}</p>`)
    .join('')

  const displayDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0fafa;font-family:Lato,sans-serif">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
    <div style="background:${gradient};padding:28px 32px;color:#fff">
      <h1 style="margin:0;font-family:Raleway,sans-serif;font-size:22px;font-weight:900">${label}</h1>
      <p style="margin:4px 0 0;font-size:13px;opacity:.8">${displayDate}</p>
    </div>
    <div style="padding:28px 32px">
      ${priorities.length ? `
      <div style="background:#f0fdf4;border-radius:12px;padding:20px 24px;margin-bottom:24px">
        <p style="margin:0 0 14px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#6b7280">
          ${type === 'morning' ? 'Top 3 Priorities Today' : 'Top 3 Priorities Tomorrow'}
        </p>
        <table style="border-collapse:collapse;width:100%">${priorityRows}</table>
      </div>` : ''}
      <p style="margin:0 0 14px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#6b7280">Full Briefing</p>
      ${paragraphs}
    </div>
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center">
      <p style="margin:0;font-size:11px;color:#9ca3af">Generated by your Personal Assistant · DeepSeek R1 7b</p>
    </div>
  </div>
</body></html>`
}

// ── Orchestrate ──────────────────────────────────────────────────────────────
async function runBriefing(type, date) {
  console.log(`[cron] Generating ${type} briefing for ${date}…`)
  const { content, top_priorities } = await streamBriefing(type, date)

  console.log(`[cron] Saving to DB…`)
  await saveBriefing(date, type, content, top_priorities)

  const subject = type === 'morning'
    ? `☀️ Morning Briefing — ${date}`
    : `🌙 Evening Summary — ${date}`

  await sendEmail(subject, buildEmailHtml(type, date, content, top_priorities))
  console.log(`[cron] ✓ ${type} briefing complete`)
}

// ── Nightly scheduler cron (22:00) ──────────────────────────────────────────
async function runNightlyScheduler(date) {
  console.log(`[cron] Running nightly scheduler for ${date}…`)
  const res = await fetch(`${APP_URL}/api/agents/scheduler`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cron: true }),
  })
  const data = await res.json()
  if (data.ok) {
    console.log(`[cron] ✓ Nightly scheduler complete — pushed: ${(data.pushed ?? []).join(', ') || 'none'}`)
  } else {
    console.error(`[cron] Nightly scheduler error: ${data.message}`)
  }
}

// ── Habit weekly digest (Sunday 20:00) ───────────────────────────────────────
async function runHabitDigest(date) {
  const day = new Date().getDay() // 0 = Sunday
  if (day !== 0) return           // only fire on Sundays
  console.log(`[cron] Running weekly habit digest for ${date}…`)
  const res = await fetch(`${APP_URL}/api/agents/habit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'send_weekly_digest', params: { date } }),
  })
  const data = await res.json()
  console.log(`[cron] Habit digest: ${data.message}`)
}

// ── Start ────────────────────────────────────────────────────────────────────
console.log('[cron] Scheduler started')
console.log('[cron]   Morning briefing:        08:00 daily')
console.log('[cron]   Evening summary:         21:00 daily')
console.log('[cron]   Nightly scheduler cron:  21:00 daily')
console.log('[cron]   Weekly habit digest:     20:00 Sunday')

scheduleDaily(8,  0, 'Morning Briefing',      date => runBriefing('morning', date))
scheduleDaily(21, 0, 'Evening Summary',        date => runBriefing('evening', date))
scheduleDaily(21, 0, 'Nightly Scheduler Cron', date => runNightlyScheduler(date))
scheduleDaily(20, 0, 'Weekly Habit Digest',    date => runHabitDigest(date))
