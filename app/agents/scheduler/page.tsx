'use client'
import { useState, useEffect, useCallback } from 'react'
import { Calendar, AlertTriangle, CheckSquare, Clock, RefreshCw, X } from 'lucide-react'
import AgentPageLayout from '@/components/agents/AgentPageLayout'

const COLOR = '#6D28D9'

interface Task { id?: string; title: string; priority: string; deadline?: string; scheduled_for?: string; status?: string; project?: { name: string } }
interface Alert { id?: string; title: string; body: string; priority: string; dismissed?: boolean }

const PRIORITY_COLOR: Record<string, string> = { urgent: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e' }

export default function SchedulerAgentPage() {
  const [weekTasks, setWeekTasks] = useState<Task[]>([])
  const [overdue, setOverdue] = useState<Task[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissing, setDismissing] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [week, od, al] = await Promise.allSettled([
      fetch('/api/agents/scheduler?action=get_week_view').then(r => r.json()),
      fetch('/api/agents/scheduler?action=get_overdue').then(r => r.json()),
      fetch('/api/agents/scheduler?action=get_alerts').then(r => r.json()),
    ])
    if (week.status === 'fulfilled' && week.value.ok) setWeekTasks(week.value.data ?? [])
    if (od.status === 'fulfilled' && od.value.ok) setOverdue(od.value.data ?? [])
    if (al.status === 'fulfilled' && al.value.ok) setAlerts(al.value.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function dismissAlert(id: string) {
    setDismissing(id)
    await fetch('/api/agents/scheduler', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dismiss_alert', params: { id } }),
    })
    setAlerts(prev => prev.filter(a => a.id !== id))
    setDismissing(null)
  }

  async function rescheduleAll() {
    await fetch('/api/agents/scheduler', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reschedule_overdue', params: {} }) })
    load()
  }

  // Group week tasks by day
  const today = new Date().toISOString().slice(0, 10)
  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(Date.now() + i * 86400000)
    const date = d.toISOString().slice(0, 10)
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })
    const tasks = weekTasks.filter(t => (t.deadline ?? t.scheduled_for) === date)
    return { date, label, tasks, isToday: date === today }
  })

  const dashboard = (
    <div style={{ maxWidth: 860 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'Raleway', fontWeight: 700, fontSize: 12 }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 22 }}>
        <div style={{ background: 'var(--panel)', borderRadius: 14, padding: '16px 18px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>This Week</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: COLOR }}>{weekTasks.length}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>tasks due in 7 days</div>
        </div>
        <div style={{ borderRadius: 14, padding: '16px 18px', border: `1px solid ${overdue.length ? '#ef444430' : 'var(--border)'}`, background: overdue.length ? 'rgba(239,68,68,0.04)' : 'var(--panel)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Overdue</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: overdue.length ? '#ef4444' : '#22c55e' }}>{overdue.length}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>{overdue.length ? 'need attention' : 'all clear'}</div>
        </div>
        <div style={{ background: 'var(--panel)', borderRadius: 14, padding: '16px 18px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Alerts</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: alerts.length ? '#f97316' : '#22c55e' }}>{alerts.length}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>from last cron run</div>
        </div>
      </div>

      {/* Alerts inbox */}
      {alerts.length > 0 && (
        <div style={{ background: 'var(--panel)', borderRadius: 14, border: '1px solid var(--border)', marginBottom: 22, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Alerts Inbox</span>
          </div>
          {alerts.map((a, i) => (
            <div key={i} style={{ padding: '14px 18px', borderBottom: i < alerts.length - 1 ? '1px solid var(--faint)' : 'none', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <AlertTriangle size={15} color={a.priority === 'urgent' ? '#ef4444' : a.priority === 'high' ? '#f97316' : '#eab308'} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 3 }}>{a.title}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato', lineHeight: 1.4 }}>{a.body}</div>
              </div>
              {a.id && (
                <button onClick={() => dismissAlert(a.id!)} disabled={dismissing === a.id} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, borderRadius: 6, flexShrink: 0 }}>
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Week view */}
      <div style={{ background: 'var(--panel)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>7-Day View</span>
        </div>
        {loading ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div> :
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0 }}>
            {days.map(day => (
              <div key={day.date} style={{
                padding: '12px 10px', borderRight: '1px solid var(--faint)',
                background: day.isToday ? `${COLOR}08` : 'transparent',
                minHeight: 120,
              }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: day.isToday ? COLOR : 'var(--muted)', marginBottom: 8, letterSpacing: '-0.01em' }}>{day.label}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {day.tasks.slice(0, 4).map((t, i) => (
                    <div key={i} style={{
                      padding: '3px 6px', borderRadius: 5, fontSize: 10, fontFamily: 'Lato', lineHeight: 1.3,
                      background: `${PRIORITY_COLOR[t.priority] || '#94a3b8'}15`,
                      color: PRIORITY_COLOR[t.priority] || 'var(--muted)',
                      borderLeft: `2px solid ${PRIORITY_COLOR[t.priority] || '#94a3b8'}`,
                    }}>{t.title?.slice(0, 30)}{t.title?.length > 30 ? '…' : ''}</div>
                  ))}
                  {day.tasks.length > 4 && <div style={{ fontSize: 10, color: 'var(--muted)', paddingLeft: 4 }}>+{day.tasks.length - 4} more</div>}
                </div>
              </div>
            ))}
          </div>
        }
      </div>
    </div>
  )

  const actionsTab = (
    <div style={{ maxWidth: 600 }}>
      {/* Overdue triage */}
      <div style={{ background: 'var(--panel)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Overdue Tasks ({overdue.length})</span>
          {overdue.length > 0 && (
            <button onClick={rescheduleAll} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, border: `1px solid ${COLOR}30`, background: `${COLOR}08`, color: COLOR, fontFamily: 'Raleway', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
              <RefreshCw size={11} /> Reschedule All to Today
            </button>
          )}
        </div>
        {overdue.length === 0 ? (
          <div style={{ padding: '24px 18px', textAlign: 'center', color: '#22c55e', fontSize: 13, fontFamily: 'Lato' }}>✓ No overdue tasks</div>
        ) : overdue.map((t, i) => (
          <div key={i} style={{ padding: '12px 18px', borderBottom: i < overdue.length - 1 ? '1px solid var(--faint)' : 'none', display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_COLOR[t.priority] || '#94a3b8', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t.title}</div>
              <div style={{ fontSize: 11, color: '#ef4444', fontFamily: 'Lato', marginTop: 2 }}>Due: {t.deadline}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  const commandCenter = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[
        { label: 'This week', value: `${weekTasks.length} tasks` },
        { label: 'Overdue', value: overdue.length, color: overdue.length ? '#ef4444' : '#22c55e' },
        { label: 'Alerts', value: alerts.length, color: alerts.length ? '#f97316' : '#22c55e' },
      ].map(item => (
        <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>{item.label}</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: (item as {color?: string}).color || 'var(--text)', fontFamily: 'Raleway' }}>{item.value}</span>
        </div>
      ))}
    </div>
  )

  return (
    <AgentPageLayout
      agentId="scheduler"
      agentName="Scheduler"
      agentColor={COLOR}
      agentIcon={<Calendar size={20} />}
      description="Week view, overdue triage & proactive alerts · 100% local"
      tabs={['dashboard', 'actions', 'chat', 'settings']}
      starters={['What should I focus on today?', 'What tasks are overdue?', 'Help me plan tomorrow', 'What are upcoming deadlines?']}
      dashboard={dashboard}
      actions={actionsTab}
      commandCenter={commandCenter}
      settings={<div style={{ padding: 20, color: 'var(--muted)', fontFamily: 'Lato', fontSize: 13 }}>Scheduler settings coming soon.</div>}
    />
  )
}
