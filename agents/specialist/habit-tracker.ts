// ─── Habit Tracker specialist — streaks, routines, consistency ────────────
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function executeHabitAction(action: string, params: Record<string, unknown>) {
  switch (action) {
    case 'get_habits': {
      const { data } = await supabase.from('habits').select('*').eq('active', true).order('created_at')
      return { ok: true, message: `${data?.length || 0} habits`, data }
    }

    case 'create_habit': {
      const { error, data } = await supabase.from('habits').insert({
        name:        params.name,
        description: params.description ?? null,
        frequency:   params.frequency ?? 'daily',
        target_days: params.target_days ?? [],
        color:       params.color ?? '#0F766E',
      }).select().single()
      if (error) return { ok: false, message: error.message }
      return { ok: true, message: `Habit "${data.name}" created`, data }
    }

    case 'update_habit': {
      const { error } = await supabase.from('habits').update({
        name:        params.name,
        description: params.description,
        color:       params.color,
        active:      params.active,
      }).eq('id', params.id)
      if (error) return { ok: false, message: error.message }
      return { ok: true, message: 'Habit updated' }
    }

    case 'delete_habit': {
      const { error } = await supabase.from('habits').delete().eq('id', params.id)
      if (error) return { ok: false, message: error.message }
      return { ok: true, message: 'Habit deleted' }
    }

    case 'get_grid': {
      // Returns 28-day completion grid for all active habits
      const since = new Date(Date.now() - 27 * 86400000).toISOString().slice(0, 10)
      const { data: habits } = await supabase.from('habits').select('id,name,color').eq('active', true).order('created_at')
      if (!habits?.length) return { ok: true, message: 'No habits', data: [] }
      const { data: logs } = await supabase.from('habit_logs')
        .select('habit_id,date,completed').gte('date', since)
      const logSet = new Set((logs ?? []).filter(l => l.completed).map(l => `${l.habit_id}:${l.date}`))
      const days: string[] = []
      for (let i = 27; i >= 0; i--) {
        days.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10))
      }
      const grid = habits.map(h => ({
        ...h,
        days: days.map(d => ({ date: d, done: logSet.has(`${h.id}:${d}`) })),
        doneCount: days.filter(d => logSet.has(`${h.id}:${d}`)).length,
      }))
      return { ok: true, message: `Grid for ${habits.length} habits`, data: { grid, days } }
    }

    case 'toggle_today': {
      // Toggle completion for today
      const today = new Date().toISOString().slice(0, 10)
      const { data: existing } = await supabase.from('habit_logs')
        .select('id,completed').eq('habit_id', params.habit_id).eq('date', today).single()
      const newCompleted = existing ? !existing.completed : true
      const { error } = await supabase.from('habit_logs').upsert({
        habit_id: params.habit_id, date: today, completed: newCompleted,
      }, { onConflict: 'habit_id,date' })
      if (error) return { ok: false, message: error.message }
      return { ok: true, message: newCompleted ? 'Marked complete ✓' : 'Unmarked', data: { completed: newCompleted } }
    }

    case 'log_habit': {
      const today = new Date().toISOString().slice(0, 10)
      const { error } = await supabase.from('habit_logs').upsert({
        habit_id: params.habit_id,
        date: today,
        completed: params.completed ?? true,
        notes: params.notes ?? null,
      }, { onConflict: 'habit_id,date' })
      if (error) return { ok: false, message: error.message }
      return { ok: true, message: 'Habit logged' }
    }
    case 'get_streaks': {
      const { data: habits } = await supabase.from('habits').select('id,name')
      if (!habits?.length) return { ok: true, message: 'No habits tracked', data: [] }
      const streaks = await Promise.all(habits.map(async h => {
        const { data: logs } = await supabase.from('habit_logs')
          .select('date,completed').eq('habit_id', h.id).eq('completed', true)
          .order('date', { ascending: false }).limit(60)
        // Calculate current streak
        let streak = 0
        const dates = logs?.map(l => l.date) ?? []
        let check = new Date()
        while (dates.includes(check.toISOString().slice(0, 10))) {
          streak++
          check = new Date(check.getTime() - 86400000)
        }
        return { habit: h.name, streak, total: logs?.length ?? 0 }
      }))
      return { ok: true, message: 'Current streaks', data: streaks }
    }
    case 'get_weekly_summary': {
      const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
      const { data } = await supabase.from('habit_logs')
        .select('date,completed,habit:habits(name)').gte('date', since).order('date')
      return { ok: true, message: 'Weekly habit summary', data }
    }

    case 'send_weekly_digest': {
      // Build and email the weekly habit summary
      const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
      const { data: habits } = await supabase.from('habits').select('id,name').eq('active', true)
      if (!habits?.length) return { ok: true, message: 'No active habits — skipping digest' }

      const { data: logs } = await supabase.from('habit_logs')
        .select('habit_id,date,completed').gte('date', since)
      const logMap = new Map<string, Set<string>>()
      for (const l of logs ?? []) {
        if (!logMap.has(l.habit_id)) logMap.set(l.habit_id, new Set())
        if (l.completed) logMap.get(l.habit_id)!.add(l.date)
      }

      const rows = habits.map(h => {
        const done = logMap.get(h.id)?.size ?? 0
        return { name: h.name, done, total: 7, pct: Math.round((done / 7) * 100) }
      })
      const overall = Math.round(rows.reduce((s, r) => s + r.pct, 0) / rows.length)

      // Send via Gmail using nodemailer — reuse env vars
      const gmailUser = process.env.GMAIL_USER
      const gmailPass = process.env.GMAIL_APP_PASSWORD
      const toEmail   = process.env.BRIEFING_NOTIFY_EMAIL || gmailUser
      if (!gmailUser || !gmailPass || !toEmail) {
        return { ok: false, message: 'Gmail not configured — GMAIL_USER / GMAIL_APP_PASSWORD missing' }
      }

      const nodemailer = await import('nodemailer')
      const transporter = nodemailer.default.createTransport({
        service: 'gmail', auth: { user: gmailUser, pass: gmailPass },
      })

      const tableRows = rows.map(r =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${r.name}</td>
         <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${r.done}/7</td>
         <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:${r.pct >= 70 ? '#059669' : r.pct >= 40 ? '#d97706' : '#dc2626'}">${r.pct}%</td></tr>`
      ).join('')

      const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#0f766e">Weekly Habit Report</h2>
        <p>Week of ${since} — Overall: <strong>${overall}%</strong></p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px">
          <thead><tr style="background:#f9fafb">
            <th style="padding:8px 12px;text-align:left">Habit</th>
            <th style="padding:8px 12px">Days Done</th>
            <th style="padding:8px 12px">Rate</th>
          </tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
        <p style="color:#6b7280;font-size:12px;margin-top:24px">Sent by your Personal Assistant</p>
      </div>`

      try {
        await transporter.sendMail({
          from: `"Personal Assistant" <${gmailUser}>`,
          to: toEmail,
          subject: `✅ Weekly Habit Report — ${overall}% overall`,
          html,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, message: `Failed to send habit digest email: ${msg}` }
      }
      return { ok: true, message: `Weekly habit digest emailed to ${toEmail} (${overall}% overall)` }
    }

    default:
      return { ok: false, message: `Unknown action: ${action}` }
  }
}
