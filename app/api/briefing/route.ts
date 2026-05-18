import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { format } from 'date-fns'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const OLLAMA_BASE = 'http://localhost:11434'

// Stream from Ollama and pipe tokens to a ReadableStream
function streamBriefing(prompt: string, model: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()

  return new ReadableStream({
    async start(controller) {
      let full = ''
      let thinkBuf = ''
      let inThink = false

      try {
        const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: 'You are a concise, professional productivity assistant. Be direct and actionable.' },
              { role: 'user', content: prompt },
            ],
            stream: true,
          }),
        })

        if (!res.ok) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Ollama error' })}\n\n`))
          controller.close()
          return
        }

        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let streamBuf = ''  // buffer for incomplete JSON lines

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          streamBuf += decoder.decode(value, { stream: true })
          const rawLines = streamBuf.split('\n')
          streamBuf = rawLines.pop() ?? '' // keep incomplete last line
          const lines = rawLines.filter(Boolean)
          for (const line of lines) {
            try {
              const json = JSON.parse(line)
              const chunk: string = json.message?.content || ''
              if (!chunk) continue

              full += chunk

              // Filter out <think>...</think> before streaming to client
              let visible = ''
              for (const char of chunk) {
                if (inThink) {
                  thinkBuf += char
                  if (thinkBuf.endsWith('</think>')) { inThink = false; thinkBuf = '' }
                } else {
                  if ((thinkBuf + char).includes('<think>')) {
                    inThink = true
                    thinkBuf += char
                  } else {
                    visible += char
                  }
                }
              }

              if (visible) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: visible })}\n\n`))
              }
            } catch { /* skip malformed JSON */ }
          }
        }

        // Extract priorities from full response and send as final event
        const clean = full.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
        const jsonMatch = clean.match(/PRIORITIES_JSON:\s*(\[[\s\S]*?\])/)
        const top_priorities: string[] = jsonMatch ? JSON.parse(jsonMatch[1]) : []
        const content = clean.replace(/PRIORITIES_JSON:[\s\S]*$/, '').trim()

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, content, top_priorities })}\n\n`))

      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`))
      }

      controller.close()
    },
  })
}

export async function POST(req: NextRequest) {
  const { type, date } = await req.json()
  const targetDate = date || format(new Date(), 'yyyy-MM-dd')

  const [tasksRes, projectsRes, journalRes, researchRes] = await Promise.all([
    supabase.from('tasks').select('title,priority,effort,deadline,scheduled_for,project:projects(name)').neq('status', 'done').order('priority'),
    supabase.from('projects').select('name').eq('status', 'active'),
    supabase.from('journal_entries').select('*').eq('date', targetDate).single(),
    supabase.from('research_papers').select('title,reading_status').eq('reading_status', 'reading').limit(5),
  ])

  const tasks = tasksRes.data || []
  const projects = projectsRes.data || []
  const journal = journalRes.data
  const readingNow = researchRes.data || []

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

Write a brief, motivating morning briefing in 2-3 paragraphs covering tasks, research, and trading. Then list exactly 3 top priorities for today:
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

Write a brief encouraging evening summary (2 paragraphs) covering tasks, research progress, and trading. Then list 3 top priorities for tomorrow:
PRIORITIES_JSON: ["priority 1", "priority 2", "priority 3"]`
  }

  // Use 7b — 4-5x faster than 32b with streaming, quality is sufficient for briefings
  const model = 'deepseek-r1:7b'

  const stream = streamBriefing(prompt, model)

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
