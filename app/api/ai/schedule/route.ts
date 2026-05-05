import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { format, addDays, subDays, parseISO } from 'date-fns'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY!
)

export async function POST(req: NextRequest) {
  const { task_id } = await req.json()

  const { data: task } = await supabase
    .from('tasks')
    .select('*, project:projects(name)')
    .eq('id', task_id)
    .single()

  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const today = format(new Date(), 'yyyy-MM-dd')
  let scheduledFor: string

  // If deadline exists, schedule 2 days before (or tomorrow if deadline is too close)
  if (task.deadline) {
    const twoBefore = format(subDays(parseISO(task.deadline), 2), 'yyyy-MM-dd')
    scheduledFor = twoBefore > today ? twoBefore : format(addDays(new Date(), 1), 'yyyy-MM-dd')
  } else {
    // No deadline — schedule based on priority + effort using deterministic rules (instant)
    const priorityDays: Record<string, number> = { urgent: 0, high: 1, medium: 3, low: 5 }
    const effortExtra: Record<string, number> = { S: 0, M: 0, L: 1, XL: 2 }
    const days = (priorityDays[task.priority] ?? 2) + (effortExtra[task.effort] ?? 0)
    scheduledFor = format(addDays(new Date(), days), 'yyyy-MM-dd')
  }

  // Update the task
  const { data: updated } = await supabase
    .from('tasks')
    .update({ scheduled_for: scheduledFor, updated_at: new Date().toISOString() })
    .eq('id', task_id)
    .select()
    .single()

  return NextResponse.json({ scheduled_for: scheduledFor, task: updated })
}
