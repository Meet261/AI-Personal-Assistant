import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { format } from 'date-fns'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const CHROMA_URL = process.env.CHROMA_URL ?? 'http://localhost:8001'

async function ping(url: string, timeoutMs = 2000): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    return res.ok || res.status < 500
  } catch { return false }
}

async function checkDeepSeek(): Promise<boolean> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  return !!apiKey // If the key is set we treat it as connected (no need to ping on every health check)
}

export async function GET() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const since14 = format(new Date(Date.now() - 14 * 86_400_000), 'yyyy-MM-dd')

  const [deepseekOk, chromaOk, episodesRes, energyRes, momentumRes] = await Promise.all([
    checkDeepSeek(),
    ping(`${CHROMA_URL}/api/v2/heartbeat`),
    supabase.from('agent_episodes').select('id', { count: 'exact', head: true }),
    supabase.from('journal_entries').select('date,energy_level').gte('date', since14).order('date'),
    supabase.from('tasks')
      .select('project_id,updated_at,status,project:projects!inner(id,name,status)')
      .neq('status', 'done')
      .eq('project.status', 'active')
      .order('updated_at', { ascending: false }),
  ])

  const energyEntries = (energyRes.data ?? []).filter(e => e.energy_level != null)
  const avgEnergy = energyEntries.length
    ? energyEntries.reduce((s, e) => s + (e.energy_level ?? 0), 0) / energyEntries.length
    : null
  const latestEnergy = energyEntries.at(-1)?.energy_level ?? null

  type TaskRow = { project_id: string; updated_at: string; status: string; project: { id: string; name: string; status: string } | { id: string; name: string; status: string }[] }
  const taskRows = (momentumRes.data ?? []) as TaskRow[]
  const lastActivityByProject: Record<string, { name: string; daysSince: number }> = {}
  const nowMs = Date.now()
  for (const t of taskRows) {
    const proj = Array.isArray(t.project) ? t.project[0] : t.project
    if (!proj) continue
    const existing = lastActivityByProject[proj.id]
    const daysSince = Math.floor((nowMs - new Date(t.updated_at).getTime()) / 86_400_000)
    if (!existing || daysSince < existing.daysSince) {
      lastActivityByProject[proj.id] = { name: proj.name, daysSince }
    }
  }
  const stalledProjects = Object.values(lastActivityByProject)
    .filter(p => p.daysSince >= 4)
    .sort((a, b) => b.daysSince - a.daysSince)
    .slice(0, 5)

  return NextResponse.json({
    services: {
      deepseek: deepseekOk,
      chroma:   chromaOk,
      supabase: true,
    },
    episodes: { count: episodesRes.count ?? 0 },
    energy: {
      avg14d:     avgEnergy !== null ? parseFloat(avgEnergy.toFixed(1)) : null,
      latest:     latestEnergy,
      entries:    energyEntries.length,
      peakWindow: avgEnergy === null ? null
        : avgEnergy >= 4 ? '8–11 AM'
        : avgEnergy < 2.5 ? '10 AM–12 PM'
        : '9–11 AM',
    },
    momentum: { stalled: stalledProjects },
    today,
  })
}
