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
    let val = trimmed.slice(eq + 1).trim()
    // Strip surrounding quotes (single or double)
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1)
    if (!(key in process.env)) process.env[key] = val
  }
} catch { /* .env.local optional */ }

const APP_URL      = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const GMAIL_USER   = process.env.GMAIL_USER            // your gmail address
const GMAIL_PASS   = process.env.GMAIL_APP_PASSWORD    // gmail app password (16-char)
const NOTIFY_EMAIL = process.env.BRIEFING_NOTIFY_EMAIL || GMAIL_USER

function pad(n) { return String(n).padStart(2, '0') }

// Wait until Next.js is accepting requests before starting any scheduled tasks
async function waitForNextJs(maxWaitMs = 60_000) {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${APP_URL}/api/system/health`, { signal: AbortSignal.timeout(2000) })
      if (res.ok) { console.log('[cron] Next.js ready'); return true }
    } catch { /* not ready yet */ }
    await new Promise(r => setTimeout(r, 3000))
  }
  console.warn('[cron] Next.js did not become ready in time — proceeding anyway')
  return false
}

// Fires at an exact hour:minute each day (used for scheduler + habit digest)
function scheduleDaily(hour, minute, label, fn) {
  let firedToday = false
  let lastDate   = ''

  function tick() {
    const now  = new Date()
    const date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
    const h    = now.getHours()
    const m    = now.getMinutes()

    if (date !== lastDate) { firedToday = false; lastDate = date }

    if (h === hour && m === minute && !firedToday) {
      firedToday = true
      console.log(`[cron] ${pad(h)}:${pad(m)} — running: ${label}`)
      fn(date).catch(e => console.error(`[cron] ${label} failed:`, e))
    }

    setTimeout(tick, 30_000)
  }
  tick()
}

// Fires on the FIRST tick within a time window each day.
// Perfect for "send as soon as laptop wakes up between startHour and endHour".
// Only fires once per day no matter how many times the lid opens/closes.
function scheduleWindow(startHour, endHour, label, fn) {
  let firedToday = false
  let lastDate   = ''

  async function tick() {
    const now  = new Date()
    const date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
    const h    = now.getHours()

    // Reset at midnight
    if (date !== lastDate) { firedToday = false; lastDate = date }

    if (h >= startHour && h < endHour && !firedToday) {
      console.log(`[cron] ${pad(h)}:00 window — running: ${label}`)
      try {
        await fn(date)
        firedToday = true  // only mark done on success — retries if it fails
      } catch (e) {
        console.error(`[cron] ${label} failed (will retry next tick):`, e)
        // firedToday stays false — will retry in 30s
      }
    }

    setTimeout(tick, 30_000)
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

// ── Build HTML email — matches the UI layout exactly ─────────────────────────
function buildEmailHtml(type, date, content, priorities) {
  const isMorning = type === 'morning'
  const label     = isMorning ? 'Morning Briefing' : 'Evening Summary'
  const icon      = isMorning ? '☀️' : '🌙'
  const gradient  = isMorning
    ? 'linear-gradient(135deg,#134e4a 0%,#0d9488 100%)'   // teal — morning
    : 'linear-gradient(135deg,#1e293b 0%,#334155 100%)'   // dark slate — evening
  const priorityLabel = isMorning ? 'TOP 3 PRIORITIES TODAY' : 'TOP 3 PRIORITIES TOMORROW'

  const displayDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  // Render markdown bold/italic safely
  function renderMd(text) {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
  }

  const priorityItems = priorities.map((p, i) => `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:8px;background:#f0fdfa;border-radius:10px;">
      <tr>
        <td width="42" style="padding:12px 0 12px 14px;vertical-align:middle;">
          <table cellpadding="0" cellspacing="0" border="0"><tr><td width="26" height="26" style="width:26px;height:26px;border-radius:13px;background:#0d9488;text-align:center;vertical-align:middle;font-family:Arial,sans-serif;font-size:12px;font-weight:900;color:#ffffff;line-height:26px;">${i + 1}</td></tr></table>
        </td>
        <td style="padding:12px 14px 12px 8px;vertical-align:middle;font-family:Lato,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a;">${renderMd(p)}</td>
      </tr>
    </table>`).join('')

  const paragraphs = content
    .split('\n\n')
    .filter(p => p.trim() && !p.startsWith('PRIORITIES_JSON'))
    .map(p => `<p style="margin:0 0 14px;font-size:14px;line-height:1.75;color:#374151">${renderMd(p)}</p>`)
    .join('')

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Lato,Arial,sans-serif">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">

    <!-- Header -->
    <div style="background:${gradient};padding:28px 32px;color:#fff">
      <div style="font-size:28px;margin-bottom:8px">${icon}</div>
      <h1 style="margin:0;font-family:Raleway,Arial,sans-serif;font-size:24px;font-weight:900;letter-spacing:-0.02em">${label}</h1>
      <p style="margin:4px 0 0;font-size:13px;opacity:0.75">${displayDate}</p>
    </div>

    <div style="padding:28px 32px">

      <!-- Priorities -->
      ${priorities.length ? `
      <div style="margin-bottom:28px">
        <p style="margin:0 0 12px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8">${priorityLabel}</p>
        ${priorityItems}
      </div>` : ''}

      <!-- Divider -->
      ${priorities.length ? '<div style="border-top:1px solid #f1f5f9;margin-bottom:24px"></div>' : ''}

      <!-- Body -->
      ${paragraphs}

    </div>

    <!-- Footer -->
    <div style="padding:14px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center">
      <p style="margin:0;font-size:11px;color:#94a3b8">Personal Assistant · DeepSeek V3 · ${displayDate}</p>
    </div>
  </div>
</body></html>`
}

// ── Orchestrate ──────────────────────────────────────────────────────────────
async function isServerUp() {
  try {
    const res = await fetch(`${APP_URL}/api/briefing`, { method: 'GET', signal: AbortSignal.timeout(3000) })
    return res.status < 500
  } catch { return false }
}

async function alreadySentToday(type, date) {
  // Check DB — if a briefing row exists for this date+type, we already sent it
  try {
    const res = await fetch(`${APP_URL}/api/briefing?date=${date}&type=${type}`)
    if (!res.ok) return false
    const data = await res.json()
    return !!(data?.content)
  } catch { return false }
}

async function runBriefing(type, date) {
  // Idempotency guard — don't resend if already generated today (cron restart safety)
  if (await alreadySentToday(type, date)) {
    console.log(`[cron] ${type} briefing already sent for ${date} — skipping`)
    return
  }
  console.log(`[cron] Generating ${type} briefing for ${date}…`)
  try {
    const { content, top_priorities } = await streamBriefing(type, date)
    console.log(`[cron] Saving to DB…`)
    await saveBriefing(date, type, content, top_priorities)
    const subject = type === 'morning'
      ? `☀️ Morning Briefing — ${date}`
      : `🌙 Evening Summary — ${date}`
    await sendEmail(subject, buildEmailHtml(type, date, content, top_priorities))
    console.log(`[cron] ✓ ${type} briefing complete`)
  } catch (e) {
    console.error(`[cron] ✗ ${type} briefing failed:`, e.message)
  }
}

// ── Nightly scheduler + cascade (21:00) ─────────────────────────────────────
async function runNightlyScheduler(date) {
  console.log(`[cron] Running nightly scheduler for ${date}…`)

  // 1. Scheduler: overdue tasks, due-tomorrow, journal patterns
  try {
    const res = await fetch(`${APP_URL}/api/agents/scheduler`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cron: true }),
    })
    const data = await res.json()
    if (data.ok) {
      console.log(`[cron] ✓ Scheduler complete — pushed: ${(data.pushed ?? []).join(', ') || 'none'}`)
    } else {
      console.error(`[cron] Scheduler error: ${data.message}`)
    }
  } catch (e) {
    console.error(`[cron] Scheduler failed:`, e.message)
  }

  // 2. Cascade: trading → journal → scheduler chain
  try {
    console.log(`[cron] Running trading→journal→scheduler cascade…`)
    const res = await fetch(`${APP_URL}/api/agents/cascade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await res.json()
    if (data.ok) {
      console.log(`[cron] ✓ Cascade complete — outcome: ${data.tradingOutcome}, alerts: ${(data.alertsPushed ?? []).join(', ') || 'none'}`)
    } else {
      console.error(`[cron] Cascade error:`, data)
    }
  } catch (e) {
    console.error(`[cron] Cascade failed:`, e.message)
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

// ── Weekly trading review (Sunday 19:00) ─────────────────────────────────────
async function runWeeklyTradingReview(date) {
  const day = new Date().getDay() // 0 = Sunday
  if (day !== 0) return
  console.log(`[cron] Running weekly trading review for ${date}…`)

  try {
    // Generate + store the review
    const res = await fetch(`${APP_URL}/api/trading/weekly-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weeks_ago: 1 }),
    })
    const data = await res.json()
    if (!data.ok) { console.error(`[cron] Trading review failed: ${data.message}`); return }

    const r = data.data
    if (!r) { console.log(`[cron] Trading review: ${data.message}`); return }

    console.log(`[cron] ✓ Trading review generated: ${r.total_trades} trades, ${r.win_rate}% WR, $${r.total_pnl} P&L`)
    await sendEmail(
      `📊 Weekly Trading Review — ${r.week_start} to ${r.week_end}`,
      buildTradingReviewEmail(r)
    )
  } catch (e) {
    console.error(`[cron] Weekly trading review failed:`, e.message)
  }
}

function buildTradingReviewEmail(r) {
  const pnlColor  = r.total_pnl >= 0 ? '#16a34a' : '#dc2626'
  const rrColor   = r.risk_reward >= 1 ? '#16a34a' : '#f59e0b'
  const wrColor   = r.win_rate >= 55 ? '#16a34a' : r.win_rate >= 45 ? '#f59e0b' : '#dc2626'

  const symbolRows = Object.entries(r.by_symbol ?? {})
    .sort(([, a], [, b]) => b.pnl - a.pnl)
    .map(([sym, s]) => `
      <tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:8px 0;font-weight:700;color:#1a1a1a">${sym}</td>
        <td style="padding:8px 0;text-align:center;color:#6b7280">${s.trades}</td>
        <td style="padding:8px 0;text-align:center;color:#6b7280">${s.trades ? Math.round(s.wins/s.trades*100) : 0}%</td>
        <td style="padding:8px 0;text-align:right;font-weight:700;color:${s.pnl >= 0 ? '#16a34a' : '#dc2626'}">$${s.pnl.toFixed(2)}</td>
      </tr>`).join('')

  const dayRows = Object.entries(r.by_day ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, pnl]) => `
      <tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:7px 0;color:#374151">${day}</td>
        <td style="padding:7px 0;text-align:right;font-weight:700;color:${pnl >= 0 ? '#16a34a' : '#dc2626'}">$${pnl.toFixed(2)}</td>
      </tr>`).join('')

  const setupRows = Object.entries(r.setup_breakdown ?? {})
    .sort(([, a], [, b]) => b - a)
    .map(([s, c]) => `<span style="display:inline-block;margin:3px;padding:3px 10px;border-radius:20px;background:#f0fdf4;border:1px solid #bbf7d0;font-size:12px;color:#15803d">${s} (${c})</span>`)
    .join('')

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f0fafa;font-family:Lato,sans-serif">
  <div style="max-width:620px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">

    <div style="background:linear-gradient(135deg,#134e4a 0%,#0d9488 100%);padding:28px 32px;color:#fff">
      <h1 style="margin:0;font-family:Raleway,sans-serif;font-size:22px;font-weight:900">📊 Weekly Trading Review</h1>
      <p style="margin:4px 0 0;font-size:13px;opacity:.8">${r.week_start} → ${r.week_end}</p>
    </div>

    <!-- Key metrics -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0;border-bottom:1px solid #e5e7eb">
      ${[
        { label: 'Total P&L',    value: `$${r.total_pnl >= 0 ? '+' : ''}${r.total_pnl.toFixed(2)}`, color: pnlColor },
        { label: 'Win Rate',     value: `${r.win_rate}%`,   color: wrColor },
        { label: 'Trades',       value: `${r.wins}W / ${r.losses}L`, color: '#374151' },
        { label: 'Risk:Reward',  value: `1:${r.risk_reward}`, color: rrColor },
      ].map(m => `
        <div style="padding:20px 16px;text-align:center;border-right:1px solid #e5e7eb">
          <div style="font-size:20px;font-weight:900;color:${m.color};font-family:Raleway,sans-serif">${m.value}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:4px;text-transform:uppercase;letter-spacing:.05em">${m.label}</div>
        </div>`).join('')}
    </div>

    <div style="padding:24px 32px">

      <!-- By symbol -->
      <p style="margin:0 0 10px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#6b7280">By Symbol</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr style="border-bottom:2px solid #e5e7eb">
          <th style="padding:6px 0;text-align:left;font-size:11px;color:#9ca3af;text-transform:uppercase">Symbol</th>
          <th style="padding:6px 0;text-align:center;font-size:11px;color:#9ca3af;text-transform:uppercase">Trades</th>
          <th style="padding:6px 0;text-align:center;font-size:11px;color:#9ca3af;text-transform:uppercase">WR</th>
          <th style="padding:6px 0;text-align:right;font-size:11px;color:#9ca3af;text-transform:uppercase">P&L</th>
        </tr>
        ${symbolRows}
      </table>

      <!-- Daily P&L -->
      <p style="margin:0 0 10px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#6b7280">Daily P&L</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        ${dayRows}
      </table>

      <!-- Best / Worst -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px">
        <div style="background:#f0fdf4;border-radius:10px;padding:14px 16px;border:1px solid #bbf7d0">
          <p style="margin:0 0 6px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#15803d">Best Trade</p>
          <p style="margin:0;font-size:18px;font-weight:900;color:#16a34a">+$${r.best_trade?.profit?.toFixed(2)}</p>
          <p style="margin:4px 0 0;font-size:12px;color:#374151">${r.best_trade?.symbol} ${r.best_trade?.action} · ${r.best_trade?.time?.slice(0,10)}</p>
        </div>
        <div style="background:#fef2f2;border-radius:10px;padding:14px 16px;border:1px solid #fecaca">
          <p style="margin:0 0 6px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#b91c1c">Worst Trade</p>
          <p style="margin:0;font-size:18px;font-weight:900;color:#dc2626">$${r.worst_trade?.profit?.toFixed(2)}</p>
          <p style="margin:4px 0 0;font-size:12px;color:#374151">${r.worst_trade?.symbol} ${r.worst_trade?.action} · ${r.worst_trade?.time?.slice(0,10)}</p>
        </div>
      </div>

      <!-- Avg win/loss -->
      <div style="background:#f9fafb;border-radius:10px;padding:14px 16px;margin-bottom:24px;display:flex;gap:32px">
        <div><p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase">Avg Win</p><p style="margin:4px 0 0;font-size:16px;font-weight:900;color:#16a34a">+$${r.avg_win?.toFixed(2)}</p></div>
        <div><p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase">Avg Loss</p><p style="margin:4px 0 0;font-size:16px;font-weight:900;color:#dc2626">$${r.avg_loss?.toFixed(2)}</p></div>
        <div><p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase">R:R Ratio</p><p style="margin:4px 0 0;font-size:16px;font-weight:900;color:${rrColor}">1:${r.risk_reward}</p></div>
      </div>

      <!-- Setup breakdown -->
      ${setupRows ? `
      <p style="margin:0 0 8px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#6b7280">Setup Types</p>
      <div style="margin-bottom:8px">${setupRows}</div>` : ''}

    </div>

    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center">
      <p style="margin:0;font-size:11px;color:#9ca3af">Generated by your Personal Assistant · Weekly Trading Review</p>
    </div>
  </div>
</body></html>`
}

// ── Start ────────────────────────────────────────────────────────────────────
console.log('[cron] Scheduler started')
console.log('[cron]   Morning briefing:          first open 06:00–12:00')
console.log('[cron]   Evening summary:           first open after 18:00')
console.log('[cron]   Nightly scheduler cron:    21:00 daily')
console.log('[cron]   Weekly habit digest:       20:00 Sunday')
console.log('[cron]   Weekly trading review:     19:00 Sunday')

// Wait for Next.js before starting any scheduled tasks
waitForNextJs().then(() => {
  scheduleWindow(6,  12, 'Morning Briefing',            date => runBriefing('morning', date))
  scheduleWindow(18, 24, 'Evening Summary',             date => runBriefing('evening', date))
  scheduleDaily(21,  0,  'Nightly Scheduler + Cascade', date => runNightlyScheduler(date))
  scheduleDaily(20,  0,  'Weekly Habit Digest',         date => runHabitDigest(date))
  scheduleDaily(19,  0,  'Weekly Trading Review',       date => runWeeklyTradingReview(date))
})
