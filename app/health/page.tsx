'use client'
import { useState, useEffect } from 'react'
import { RefreshCw, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, Minus, Clock, Zap } from 'lucide-react'
import Link from 'next/link'

interface Task {
  id: string; title: string; status: string; priority: string
  created_at?: string; completed_at?: string
  project?: { id: string; name: string; color: string } | null
}
interface Project { id: string; name: string; color: string; description?: string }

interface ProjectHealth {
  id: string; name: string; color: string
  total: number; done: number; open: number; inProgress: number
  completionPct: number
  stale: number          // todo tasks idle 7+ days
  urgent: number         // urgent open tasks
  doneThisWeek: number   // tasks completed in last 7 days
  openedThisWeek: number // tasks created in last 7 days
  velocity: number       // doneThisWeek - openedThisWeek (positive = closing debt)
  health: 'healthy' | 'warning' | 'stalled'
}

function healthLabel(h: ProjectHealth): { label: string; color: string; icon: React.ElementType } {
  if (h.health === 'healthy')  return { label: 'Healthy',  color: '#22c55e', icon: CheckCircle2 }
  if (h.health === 'warning')  return { label: 'Warning',  color: '#f97316', icon: AlertTriangle }
  return                               { label: 'Stalled',  color: '#ef4444', icon: TrendingDown }
}

function computeHealth(p: ProjectHealth): 'healthy' | 'warning' | 'stalled' {
  if (p.open === 0) return 'healthy'
  // Stalled: has open tasks, nothing done in 7 days, and stale rate > 60%
  if (p.doneThisWeek === 0 && p.open > 0 && p.stale / p.open > 0.6) return 'stalled'
  // Warning: few things moving, lots stale or lots urgent
  if (p.stale > 5 || p.urgent > 3 || (p.doneThisWeek === 0 && p.open > 3)) return 'warning'
  return 'healthy'
}

export default function ProjectHealthPage() {
  const [projects, setProjects] = useState<ProjectHealth[]>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<'health' | 'velocity' | 'stale' | 'completion'>('health')

  async function load() {
    setLoading(true)
    const [projRes, taskRes] = await Promise.all([
      fetch('/api/projects').then(r => r.json()),
      fetch('/api/tasks').then(r => r.json()),
    ])

    const projectMap = new Map<string, Project>()
    for (const p of (projRes as Project[])) projectMap.set(p.id, p)

    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
    const stats = new Map<string, Omit<ProjectHealth, 'health'>>()

    for (const p of (projRes as Project[])) {
      stats.set(p.id, {
        id: p.id, name: p.name, color: p.color,
        total: 0, done: 0, open: 0, inProgress: 0,
        completionPct: 0, stale: 0, urgent: 0,
        doneThisWeek: 0, openedThisWeek: 0, velocity: 0,
      })
    }

    for (const t of (taskRes as Task[])) {
      const proj = t.project
      if (!proj) continue
      const s = stats.get(proj.id)
      if (!s) continue

      s.total++
      if (t.status === 'done') {
        s.done++
        if ((t.completed_at || '').slice(0, 10) >= weekAgo) s.doneThisWeek++
      } else {
        s.open++
        if (t.status === 'in_progress') s.inProgress++
        if (t.priority === 'urgent') s.urgent++
        if ((t.created_at || '').slice(0, 10) < weekAgo) s.stale++
      }
      if ((t.created_at || '').slice(0, 10) >= weekAgo) s.openedThisWeek++
    }

    const result: ProjectHealth[] = []
    for (const [, s] of stats) {
      if (s.total === 0) continue
      s.completionPct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0
      s.velocity = s.doneThisWeek - s.openedThisWeek
      const h = { ...s, health: computeHealth(s as ProjectHealth) }
      result.push(h as ProjectHealth)
    }

    const sortFn: Record<string, (a: ProjectHealth, b: ProjectHealth) => number> = {
      health:      (a, b) => (['stalled','warning','healthy'].indexOf(a.health)) - (['stalled','warning','healthy'].indexOf(b.health)),
      velocity:    (a, b) => a.velocity - b.velocity,
      stale:       (a, b) => b.stale - a.stale,
      completion:  (a, b) => a.completionPct - b.completionPct,
    }
    result.sort(sortFn[sort])
    setProjects(result)
    setLoading(false)
  }

  useEffect(() => { load() }, [sort])

  const stalled  = projects.filter(p => p.health === 'stalled').length
  const warning  = projects.filter(p => p.health === 'warning').length
  const healthy  = projects.filter(p => p.health === 'healthy').length

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: 'var(--text)', fontFamily: 'Raleway' }}>Project Health</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)', fontFamily: 'Lato' }}>Task velocity, stale debt, and momentum across all projects</p>
        </div>
        <button onClick={load} style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--muted)', cursor: 'pointer', lineHeight: 0 }}>
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Healthy',      value: healthy,  color: '#22c55e' },
          { label: 'Warning',      value: warning,  color: '#f97316' },
          { label: 'Stalled',      value: stalled,  color: '#ef4444' },
          { label: 'Total projects', value: projects.length, color: 'var(--text)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--panel)', borderRadius: 12, padding: '14px 16px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: s.color, fontFamily: 'Raleway' }}>{loading ? '—' : s.value}</div>
          </div>
        ))}
      </div>

      {/* Sort controls */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato', alignSelf: 'center', marginRight: 4 }}>Sort by:</span>
        {(['health', 'velocity', 'stale', 'completion'] as const).map(s => (
          <button key={s} onClick={() => setSort(s)} style={{ padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 700, fontFamily: 'Raleway', cursor: 'pointer', border: `1.5px solid ${sort === s ? 'var(--brand)' : 'var(--border)'}`, background: sort === s ? 'var(--active)' : 'transparent', color: sort === s ? 'var(--brand)' : 'var(--muted)', transition: 'all .12s' }}>
            {s === 'health' ? 'Health' : s === 'velocity' ? 'Velocity' : s === 'stale' ? 'Stale debt' : 'Completion'}
          </button>
        ))}
      </div>

      {/* Project cards */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {projects.map(p => {
            const { label, color, icon: Icon } = healthLabel(p)
            const velColor = p.velocity > 0 ? '#22c55e' : p.velocity < 0 ? '#ef4444' : 'var(--muted)'
            const VelIcon = p.velocity > 0 ? TrendingUp : p.velocity < 0 ? TrendingDown : Minus

            return (
              <Link key={p.id} href={`/projects/${p.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ background: 'var(--panel)', borderRadius: 16, border: `1px solid ${p.health === 'stalled' ? '#ef444430' : p.health === 'warning' ? '#f9741630' : 'var(--border)'}`, padding: '18px 22px', cursor: 'pointer', transition: 'box-shadow .15s' }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)')}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>

                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    {/* Color dot */}
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, flexShrink: 0, marginTop: 5 }} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Name + health badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <span style={{ fontFamily: 'Raleway', fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>{p.name}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: `${color}15`, color }}>
                          <Icon size={11} /> {label}
                        </span>
                        {p.urgent > 0 && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: '#ff5c7a15', color: '#ff5c7a' }}>
                            <Zap size={9} /> {p.urgent} urgent
                          </span>
                        )}
                      </div>

                      {/* Stats row */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                        {[
                          { label: 'Completion', value: `${p.completionPct}%`, sub: `${p.done}/${p.total} tasks`, color: p.completionPct >= 75 ? '#22c55e' : p.completionPct >= 40 ? 'var(--text)' : 'var(--muted)' },
                          { label: 'Open', value: p.open, sub: `${p.inProgress} in progress`, color: 'var(--text)' },
                          { label: 'Stale (7d+)', value: p.stale, sub: 'idle tasks', color: p.stale > 5 ? '#f97316' : p.stale > 0 ? '#ffcc66' : '#22c55e' },
                          { label: 'Done this week', value: p.doneThisWeek, sub: `${p.openedThisWeek} opened`, color: p.doneThisWeek > 0 ? '#22c55e' : 'var(--muted)' },
                          { label: 'Velocity', value: p.velocity >= 0 ? `+${p.velocity}` : String(p.velocity), sub: 'done − opened', color: velColor },
                        ].map(stat => (
                          <div key={stat.label} style={{ background: 'var(--faint)', borderRadius: 10, padding: '10px 12px' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{stat.label}</div>
                            <div style={{ fontSize: 18, fontWeight: 900, color: stat.color, fontFamily: 'Raleway' }}>{stat.value}</div>
                            <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'Lato', marginTop: 2 }}>{stat.sub}</div>
                          </div>
                        ))}
                      </div>

                      {/* Completion bar */}
                      <div style={{ marginTop: 12, height: 4, borderRadius: 2, background: 'var(--faint)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${p.completionPct}%`, background: p.completionPct >= 75 ? '#22c55e' : p.completionPct >= 40 ? p.color : '#f97316', borderRadius: 2, transition: 'width .4s' }} />
                      </div>

                      {/* Stalled message */}
                      {p.health === 'stalled' && (
                        <p style={{ margin: '8px 0 0', fontSize: 11, color: '#ef4444', fontFamily: 'Lato' }}>
                          ⚠ No tasks completed in 7 days — {p.stale} tasks sitting idle. Open this project and either close tasks or defer them.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
