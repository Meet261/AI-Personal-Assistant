import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

async function fetchSnapshot() {
  const today = new Date().toISOString().slice(0, 10)
  const [tasksRes, habitsRes, tradingRes] = await Promise.allSettled([
    supabase.from('tasks').select('id,status,priority,scheduled_for,deadline').neq('status','done'),
    supabase.from('habit_logs').select('habit_id,completed').eq('date', today),
    supabase.from('trades').select('pnl').gte('opened_at', today + 'T00:00:00'),
  ])

  const tasks = tasksRes.status === 'fulfilled' ? (tasksRes.value.data ?? []) : []
  const habits = habitsRes.status === 'fulfilled' ? (habitsRes.value.data ?? []) : []
  const trades = tradingRes.status === 'fulfilled' ? (tradingRes.value.data ?? []) : []

  return {
    tasks: {
      total: tasks.length,
      urgent: tasks.filter((t: {priority:string}) => t.priority === 'urgent').length,
      today: tasks.filter((t: {scheduled_for:string|null}) => t.scheduled_for === today).length,
      overdue: tasks.filter((t: {deadline:string|null}) => t.deadline && t.deadline < today).length,
    },
    habits: {
      completed: habits.filter((h: {completed:boolean}) => h.completed).length,
      total: habits.length,
    },
    trading: {
      todayPnl: trades.reduce((s: number, t: {pnl:number|null}) => s + (t.pnl ?? 0), 0),
      todayTrades: trades.length,
    },
    ts: Date.now(),
  }
}

export async function GET(req: Request) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = async () => {
        try {
          const data = await fetchSnapshot()
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch { /* ignore fetch errors */ }
      }

      await send()
      const interval = setInterval(send, 30_000)

      req.signal.addEventListener('abort', () => {
        clearInterval(interval)
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
