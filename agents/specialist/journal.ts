// ─── Journal specialist — mood, energy, reflection + health logs ──────────
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function executeJournalAction(action: string, params: Record<string, unknown>) {
  const today = new Date().toISOString().slice(0, 10)

  switch (action) {

    // ── Journal entries ────────────────────────────────────────────────────
    case 'get_today_entry': {
      const { data } = await supabase.from('journal_entries').select('*').eq('date', today).limit(1)
      const entry = data?.[0] ?? null
      return { ok: true, message: entry ? "Today's journal entry" : 'No entry today yet', data: entry }
    }

    case 'get_recent_entries': {
      const limit = (params.limit as number) || 7
      const { data } = await supabase.from('journal_entries').select('*').order('date', { ascending: false }).limit(limit)
      return { ok: true, message: `${data?.length || 0} recent entries`, data }
    }

    case 'get_energy_pattern': {
      const days = (params.days as number) || 14
      const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
      const { data } = await supabase
        .from('journal_entries')
        .select('date,energy_level')
        .gte('date', since)
        .order('date')
      const entries = data ?? []
      const avg = entries.length
        ? (entries.reduce((s, e) => s + (e.energy_level || 0), 0) / entries.length).toFixed(1)
        : null
      const trend = entries.length >= 3
        ? (entries[entries.length - 1].energy_level ?? 0) - (entries[0].energy_level ?? 0)
        : 0
      return {
        ok: true,
        message: `Energy pattern over ${days} days`,
        data: { entries, avg, trend: trend > 0 ? 'improving' : trend < 0 ? 'declining' : 'stable' },
      }
    }

    case 'get_checkin_stats': {
      const days = (params.days as number) || 30
      const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
      const { data } = await supabase
        .from('journal_entries')
        .select('date,energy_level,completed_today,blocked_or_pushed,tomorrow_focus')
        .gte('date', since)
        .order('date', { ascending: false })
      return { ok: true, message: `${data?.length || 0} check-ins in last ${days} days`, data }
    }

    case 'save_entry': {
      const { error } = await supabase.from('journal_entries').upsert({
        date: today,
        energy_level: params.energy_level,
        completed_today: params.completed_today,
        blocked_or_pushed: params.blocked_or_pushed,
        tomorrow_focus: params.tomorrow_focus,
      }, { onConflict: 'date' })
      if (error) return { ok: false, message: error.message }
      return { ok: true, message: 'Journal entry saved' }
    }

    // ── Health logs (absorbed from Health Agent) ───────────────────────────
    case 'log_workout': {
      // params: type (string), duration_min (number), notes? (string), date? (string)
      const logDate = (params.date as string) || today
      const { error } = await supabase.from('health_logs').insert({
        date: logDate,
        log_type: 'workout',
        data: {
          type: params.type ?? 'general',
          duration_min: params.duration_min ?? null,
          notes: params.notes ?? null,
        },
      })
      if (error) return { ok: false, message: error.message }
      return { ok: true, message: `Workout logged: ${params.type ?? 'workout'} ${params.duration_min ? `(${params.duration_min} min)` : ''}` }
    }

    case 'log_sleep': {
      // params: hours (number), quality? (1-5), notes? (string), date? (string)
      const logDate = (params.date as string) || today
      const { error } = await supabase.from('health_logs').insert({
        date: logDate,
        log_type: 'sleep',
        data: {
          hours: params.hours ?? null,
          quality: params.quality ?? null,
          notes: params.notes ?? null,
        },
      })
      if (error) return { ok: false, message: error.message }
      return { ok: true, message: `Sleep logged: ${params.hours ?? '?'}h${params.quality ? `, quality ${params.quality}/5` : ''}` }
    }

    case 'log_meal': {
      // params: meal (breakfast/lunch/dinner/snack), description (string), date? (string)
      const logDate = (params.date as string) || today
      const { error } = await supabase.from('health_logs').insert({
        date: logDate,
        log_type: 'meal',
        data: {
          meal: params.meal ?? 'general',
          description: params.description ?? null,
          notes: params.notes ?? null,
        },
      })
      if (error) return { ok: false, message: error.message }
      return { ok: true, message: `Meal logged: ${params.meal ?? 'meal'} — ${params.description ?? ''}` }
    }

    case 'get_health_logs': {
      const days = (params.days as number) || 7
      const logType = params.log_type as string | undefined
      const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
      let query = supabase.from('health_logs').select('*').gte('date', since).order('date', { ascending: false })
      if (logType) query = query.eq('log_type', logType)
      const { data } = await query
      return { ok: true, message: `${data?.length || 0} health logs in last ${days} days`, data }
    }

    case 'get_health_summary': {
      // Returns aggregated health snapshot: avg sleep, workouts this week, energy vs sleep correlation
      const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
      const [{ data: healthData }, { data: journalData }] = await Promise.all([
        supabase.from('health_logs').select('*').gte('date', since),
        supabase.from('journal_entries').select('date,energy_level').gte('date', since),
      ])
      const workouts = healthData?.filter(l => l.log_type === 'workout') ?? []
      const sleepLogs = healthData?.filter(l => l.log_type === 'sleep') ?? []
      const avgSleep = sleepLogs.length
        ? (sleepLogs.reduce((s, l) => s + (l.data?.hours ?? 0), 0) / sleepLogs.length).toFixed(1)
        : null
      const avgEnergy = journalData?.length
        ? (journalData.reduce((s, e) => s + (e.energy_level ?? 0), 0) / journalData.length).toFixed(1)
        : null
      return {
        ok: true,
        message: 'Health summary (last 7 days)',
        data: {
          workouts_count: workouts.length,
          avg_sleep_hours: avgSleep,
          avg_energy: avgEnergy,
          workout_types: [...new Set(workouts.map(w => w.data?.type).filter(Boolean))],
        },
      }
    }

    // ── Pattern detection (used by nightly cron) ───────────────────────────
    case 'detect_patterns': {
      const days = (params.days as number) || 14
      const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
      const [{ data: journal }, { data: health }] = await Promise.all([
        supabase.from('journal_entries').select('date,energy_level,completed_today,blocked_or_pushed').gte('date', since).order('date'),
        supabase.from('health_logs').select('date,log_type,data').gte('date', since),
      ])
      const patterns: string[] = []

      // Low energy streak
      const recentEnergy = (journal ?? []).slice(-5)
      if (recentEnergy.length >= 3) {
        const avgRecent = recentEnergy.reduce((s, e) => s + (e.energy_level ?? 3), 0) / recentEnergy.length
        if (avgRecent < 2.5) patterns.push(`Low energy streak: avg ${avgRecent.toFixed(1)}/5 over last ${recentEnergy.length} days`)
      }

      // Missing check-ins
      const checkinDays = new Set((journal ?? []).map(e => e.date))
      const missedDays = []
      for (let i = 1; i <= 3; i++) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
        if (!checkinDays.has(d)) missedDays.push(d)
      }
      if (missedDays.length > 0) patterns.push(`Missed check-ins: ${missedDays.join(', ')}`)

      // No workouts this week
      const workoutsThisWeek = (health ?? []).filter(l =>
        l.log_type === 'workout' && l.date >= new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
      )
      if (workoutsThisWeek.length === 0) patterns.push('No workouts logged this week')

      return { ok: true, message: `${patterns.length} patterns detected`, data: patterns }
    }

    default:
      return { ok: false, message: `Unknown journal action: ${action}` }
  }
}
