import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { format } from 'date-fns'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions'

// Generate briefing via DeepSeek V3 (fast ~3-5s, cheap ~$0.001/briefing)
// Falls back to Ollama if DEEPSEEK_API_KEY is not set
async function generateBriefing(prompt: string): Promise<{ content: string; top_priorities: string[] }> {
  const apiKey = process.env.DEEPSEEK_API_KEY

  if (apiKey) {
    const res = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You are a concise, professional productivity assistant. Be direct and actionable.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 800,
      }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) throw new Error(`DeepSeek API error: ${res.status}`)
    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content ?? ''
    const jsonMatch = raw.match(/PRIORITIES_JSON:\s*(\[[\s\S]*?\])/)
    const top_priorities: string[] = jsonMatch ? JSON.parse(jsonMatch[1]) : []
    const content = raw.replace(/PRIORITIES_JSON:[\s\S]*$/, '').trim()
    return { content, top_priorities }
  }

  // Fallback: Ollama R1
  const res = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-r1:7b',
      messages: [
        { role: 'system', content: 'You are a concise, professional productivity assistant. Be direct and actionable.' },
        { role: 'user', content: prompt },
      ],
      stream: false,
    }),
    signal: AbortSignal.timeout(120000),
  })
  if (!res.ok) throw new Error('Ollama error')
  const data = await res.json()
  const raw = (data.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  const jsonMatch = raw.match(/PRIORITIES_JSON:\s*(\[[\s\S]*?\])/)
  const top_priorities: string[] = jsonMatch ? JSON.parse(jsonMatch[1]) : []
  const content = raw.replace(/PRIORITIES_JSON:[\s\S]*$/, '').trim()
  return { content, top_priorities }
}

// Wrap in SSE stream so existing client code works unchanged
async function generateAndSaveBriefing(prompt: string, date: string, type: string) {
  const result = await generateBriefing(prompt)
  const { error } = await supabase.from('daily_briefings').upsert(
    { date, type, content: result.content, top_priorities: result.top_priorities },
    { onConflict: 'date,type' }
  )
  if (error) console.error('[briefing] save error:', error.message)
  return result
}

function streamBriefing(content: string, top_priorities: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      try {
        const words = content.split(' ')
        for (let i = 0; i < words.length; i++) {
          const token = (i === 0 ? '' : ' ') + words[i]
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`))
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, content, top_priorities })}\n\n`))
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`))
      }
      controller.close()
    },
  })
}

// ── P2-C: Derive energy peak window from last 14 days of journal entries ──
function buildEnergyContext(entries: { date: string; energy_level: number | null }[]): string {
  if (!entries.length) return ''
  const avg = entries.reduce((s, e) => s + (e.energy_level ?? 3), 0) / entries.length
  const trend = entries.length >= 3
    ? (entries.slice(-3).reduce((s, e) => s + (e.energy_level ?? 3), 0) / 3) - avg
    : 0
  const last = entries[entries.length - 1]?.energy_level ?? avg
  // Map energy level to suggested schedule
  let peakWindow = '9–11 AM'
  let avoidWindow = '2–4 PM'
  if (avg >= 4) { peakWindow = '8–11 AM'; avoidWindow = '3–5 PM' }
  else if (avg < 2.5) { peakWindow = '10 AM–12 PM'; avoidWindow = '1–4 PM' }
  const trendNote = trend > 0.3 ? 'Energy trending up lately.' : trend < -0.3 ? 'Energy trending down — protect your schedule.' : ''
  return `Energy pattern (14-day avg ${avg.toFixed(1)}/5, yesterday ${last}/5): Peak focus window is ${peakWindow}. Save deep work for then. Avoid draining meetings in ${avoidWindow}. ${trendNote}`.trim()
}

// ── P2-D: Compute project momentum — flag stalled projects ────────────────
function buildMomentumContext(
  projects: { id: string; name: string; updated_at: string }[],
  tasks: { project_id?: string; updated_at?: string; status: string }[],
  targetDate: string
): string {
  if (!projects.length) return ''
  const now = new Date(targetDate)
  const lines: string[] = []

  for (const proj of projects) {
    const projTasks = tasks.filter(t => t.project_id === proj.id && t.status !== 'done')
    if (!projTasks.length) continue

    // Most recent task activity for this project
    const lastActivity = projTasks
      .map(t => t.updated_at ? new Date(t.updated_at) : new Date(0))
      .sort((a, b) => b.getTime() - a.getTime())[0]

    const daysSince = Math.floor((now.getTime() - lastActivity.getTime()) / 86_400_000)

    if (daysSince >= 7) {
      lines.push(`⚠️ ${proj.name}: no activity for ${daysSince} days — at risk of stalling`)
    } else if (daysSince >= 4) {
      lines.push(`⚡ ${proj.name}: ${daysSince} days since last task update`)
    }
  }

  return lines.length ? `Project momentum:\n${lines.join('\n')}` : ''
}

export async function POST(req: NextRequest) {
  const { type, date } = await req.json()
  const targetDate = date || format(new Date(), 'yyyy-MM-dd')

  // P2-C: fetch 14-day energy history alongside existing queries
  const since14 = format(new Date(Date.now() - 14 * 86_400_000), 'yyyy-MM-dd')

  const [tasksRes, projectsRes, journalRes, researchRes, energyRes] = await Promise.all([
    supabase.from('tasks').select('id,title,priority,effort,deadline,scheduled_for,status,updated_at,project_id,project:projects(name)').neq('status', 'done').order('priority'),
    supabase.from('projects').select('id,name,updated_at').eq('status', 'active'),
    supabase.from('journal_entries').select('*').eq('date', targetDate).single(),
    supabase.from('research_papers').select('title,reading_status').eq('reading_status', 'reading').limit(5),
    supabase.from('journal_entries').select('date,energy_level').gte('date', since14).order('date'),
  ])

  const tasks = tasksRes.data || []
  const projects = projectsRes.data || []
  const journal = journalRes.data
  const readingNow = researchRes.data || []
  const energyHistory = energyRes.data || []

  // P2-C: energy-aware scheduling context
  const energyContext = buildEnergyContext(energyHistory)

  // P2-D: project momentum radar
  const momentumContext = buildMomentumContext(projects, tasks, targetDate)

  // Trading context from CSV + risk state
  let tradingContext = ''
  try {
    const tradingBase = join(process.cwd(), '..', 'Trading Agent', 'trading_agent', 'logs')
    if (existsSync(join(tradingBase, 'trades.csv'))) {
      const lines = readFileSync(join(tradingBase, 'trades.csv'), 'utf-8').trim().split('\n')
      const today = targetDate.replace(/-/g, '.')
      const todayTrades = lines.slice(1).filter(l => l.includes(today))
      const profits = todayTrades.map(l => parseFloat(l.split(',')[11])).filter(p => !isNaN(p))
      const totalPnl = profits.reduce((a, b) => a + b, 0)
      const wins = profits.filter(p => p > 0).length
      if (profits.length > 0) {
        tradingContext = `\nTrading (${type === 'morning' ? 'yesterday' : 'today'}): ${profits.length} trades, ${wins}W/${profits.length - wins}L, P&L: $${totalPnl.toFixed(2)}`
      }
    }
    if (existsSync(join(tradingBase, 'risk_state.json'))) {
      const state = JSON.parse(readFileSync(join(tradingBase, 'risk_state.json'), 'utf-8'))
      const openSyms = Object.entries(state.open_positions || {}).filter(([, v]) => v).map(([k]) => k)
      if (openSyms.length > 0) tradingContext += ` | Open positions: ${openSyms.join(', ')}`
    }
  } catch {}

  const overdue = tasks.filter((t: { deadline?: string }) => t.deadline && t.deadline < targetDate)
  const urgent = tasks.filter((t: { priority: string }) => t.priority === 'urgent')
  const todayTasks = tasks.filter((t: { scheduled_for?: string }) => t.scheduled_for === targetDate)

  let prompt = ''

  if (type === 'morning') {
    prompt = `You are a personal productivity assistant. Generate a focused morning briefing that covers ALL active areas of the user's work.

Today: ${targetDate}
Active projects: ${projects.map((p: { name: string }) => p.name).join(', ')}

Tasks scheduled for today (${todayTasks.length}):
${todayTasks.map((t: { priority: string; title: string; effort: string }) => `- [${t.priority}] ${t.title} (${t.effort})`).join('\n') || 'None scheduled'}

Urgent tasks (${urgent.length}):
${urgent.map((t: { title: string; deadline?: string }) => `- ${t.title} (deadline: ${t.deadline || 'none'})`).join('\n') || 'None'}

Overdue (${overdue.length}):
${overdue.map((t: { title: string; deadline?: string }) => `- ${t.title} (was due: ${t.deadline})`).join('\n') || 'None'}
${tradingContext ? `\nTrading Agent: ${tradingContext}` : ''}
${readingNow.length > 0 ? `\nCurrently reading: ${readingNow.map((p: { title: string }) => p.title).join(', ')}` : ''}
${energyContext ? `\n${energyContext}` : ''}
${momentumContext ? `\n${momentumContext}` : ''}

Write a focused morning briefing in 2-3 short paragraphs. Mention the energy peak window and suggest scheduling deep work there. Call out any stalling projects. Be direct and actionable — no fluff.

Do NOT list the priorities inside the paragraphs. After the paragraphs, output this line exactly once:
PRIORITIES_JSON: ["priority 1", "priority 2", "priority 3"]`
  } else {
    prompt = `You are a personal productivity assistant. Generate a concise evening summary covering all active areas.

Today: ${targetDate}
${journal ? `Evening check-in:
- Completed: ${journal.completed_today}
- Blocked/pushed: ${journal.blocked_or_pushed}
- Energy: ${journal.energy_level}/5
- Tomorrow focus: ${journal.tomorrow_focus}` : 'No check-in completed yet.'}

Open tasks: ${tasks.length} remaining. Urgent: ${urgent.map((t: { title: string }) => t.title).join(', ') || 'none'}
${tradingContext ? `Trading today: ${tradingContext}` : ''}
${readingNow.length > 0 ? `Research in progress: ${readingNow.map((p: { title: string }) => p.title).join(', ')}` : ''}
${energyContext ? `\n${energyContext}` : ''}
${momentumContext ? `\n${momentumContext}` : ''}

Write a brief encouraging evening summary in 2 short paragraphs. Note any stalling projects and suggest tomorrow's energy window for deep work. Be direct and actionable — no fluff.

Do NOT list the priorities inside the paragraphs. After the paragraphs, output this line exactly once:
PRIORITIES_JSON: ["priority 1", "priority 2", "priority 3"]`
  }

  const { content, top_priorities } = await generateAndSaveBriefing(prompt, targetDate, type)
  const stream = streamBriefing(content, top_priorities)

  // After streaming completes we need to save to DB — we do this by wrapping the stream
  // and intercepting the done event on the client side via a separate save call.
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

// Save endpoint — called by client after stream completes
export async function PUT(req: NextRequest) {
  const { date, type, content, top_priorities } = await req.json()
  await supabase.from('daily_briefings').upsert(
    { date, type, content, top_priorities },
    { onConflict: 'date,type' }
  )
  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') || format(new Date(), 'yyyy-MM-dd')
  const type = searchParams.get('type') || 'morning'

  const { data } = await supabase
    .from('daily_briefings')
    .select('*')
    .eq('date', date)
    .eq('type', type)
    .single()

  return NextResponse.json(data)
}
