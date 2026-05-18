'use client'
import { useState, useEffect, useCallback } from 'react'
import { Flame, Plus, Trash2, CheckCircle2, Circle, RefreshCw, Award } from 'lucide-react'
import AgentPageLayout from '@/components/agents/AgentPageLayout'

const COLOR = '#065F46'

interface Habit {
  id: string
  name: string
  description: string | null
  color: string
  frequency: string
  active: boolean
}

interface GridRow {
  habit_id: string
  habit_name: string
  habit_color: string
  streak: number
  completions: Record<string, boolean>
}

interface WeeklySummary {
  total_habits: number
  completion_rate: number
  best_streak: number
  habits: { name: string; streak: number; done_today: boolean }[]
}

function HabitGrid({ rows, days }: { rows: GridRow[]; days: string[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: 'Lato' }}>
        <thead>
          <tr>
            <th style={{ width: 160, textAlign: 'left', padding: '6px 12px', fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Habit</th>
            {days.map(d => (
              <th key={d} style={{ width: 28, textAlign: 'center', padding: '6px 2px', fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>
                {new Date(d).toLocaleDateString([], { weekday: 'narrow' })}
                <br />
                <span style={{ fontSize: 9 }}>{new Date(d).getDate()}</span>
              </th>
            ))}
            <th style={{ width: 60, textAlign: 'center', padding: '6px 8px', fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>Streak</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.habit_id} style={{ borderTop: '1px solid var(--faint)' }}>
              <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: row.habit_color, flexShrink: 0 }} />
                  {row.habit_name}
                </div>
              </td>
              {days.map(d => {
                const done = row.completions[d]
                return (
                  <td key={d} style={{ textAlign: 'center', padding: '4px 2px' }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 5, margin: '0 auto',
                      background: done ? row.habit_color : 'var(--faint)',
                      border: `1px solid ${done ? row.habit_color : 'var(--border)'}`,
                      opacity: done ? 1 : 0.4,
                    }} />
                  </td>
                )
              })}
              <td style={{ textAlign: 'center', padding: '10px 8px' }}>
                <span style={{ fontWeight: 800, fontSize: 13, color: row.streak > 0 ? COLOR : 'var(--muted)', fontFamily: 'Raleway' }}>
                  {row.streak > 0 ? `${row.streak}🔥` : '—'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function HabitTrackerAgentPage() {
  const [habits, setHabits] = useState<Habit[]>([])
  const [grid, setGrid] = useState<GridRow[]>([])
  const [days, setDays] = useState<string[]>([])
  const [summary, setSummary] = useState<WeeklySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#065F46')
  const [creating, setCreating] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const call = useCallback(async (action: string, params: Record<string, unknown> = {}) => {
    const res = await fetch('/api/orchestrator', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: action }], agentId: 'habit-tracker' }),
    })
    const data = await res.json()
    return data.toolResults?.[0] ?? data
  }, [])

  const directCall = useCallback(async (action: string, params: Record<string, unknown> = {}) => {
    const res = await fetch('/api/agents/habit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, params }),
    })
    return res.json()
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [habitsRes, gridRes, summaryRes] = await Promise.all([
        fetch('/api/agents/habit?action=get_habits').then(r => r.json()),
        fetch('/api/agents/habit?action=get_grid').then(r => r.json()),
        fetch('/api/agents/habit?action=get_weekly_summary').then(r => r.json()),
      ])
      setHabits(habitsRes.data ?? [])
      if (gridRes.data?.length) {
        const first = gridRes.data[0]
        setDays(Object.keys(first.completions ?? {}).sort())
        setGrid(gridRes.data)
      }
      setSummary(summaryRes.data ?? null)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const toggleToday = useCallback(async (habitId: string) => {
    setTogglingId(habitId)
    await directCall('toggle_today', { habit_id: habitId })
    await load()
    setTogglingId(null)
  }, [directCall, load])

  const createHabit = useCallback(async () => {
    if (!newName.trim()) return
    setCreating(true)
    await directCall('create_habit', { name: newName.trim(), color: newColor })
    setNewName('')
    setNewColor('#065F46')
    await load()
    setCreating(false)
  }, [newName, newColor, directCall, load])

  const deleteHabit = useCallback(async (id: string) => {
    if (!confirm('Delete this habit and all its logs?')) return
    await directCall('delete_habit', { id })
    await load()
  }, [directCall, load])

  const todayStr = new Date().toISOString().slice(0, 10)

  // Dashboard tab
  const dashboard = (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'Raleway', fontWeight: 700, fontSize: 12 }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>Loading habits…</div>
      ) : (
        <>
          {/* Summary stats */}
          {summary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
              {[
                { label: 'Active Habits', value: summary.total_habits, icon: Flame },
                { label: 'Weekly Rate', value: `${summary.completion_rate}%`, icon: CheckCircle2 },
                { label: 'Best Streak', value: `${summary.best_streak} days`, icon: Award },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--panel)', borderRadius: 14, padding: '18px 20px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{s.label}</span>
                    <s.icon size={14} color="var(--muted)" />
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: COLOR, fontFamily: 'Raleway' }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Today's check-in */}
          <div style={{ background: 'var(--panel)', borderRadius: 14, border: '1px solid var(--border)', marginBottom: 24, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>Today — {new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
            </div>
            {habits.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No habits yet. Add one in the Actions tab.</div>
            ) : (
              habits.map(h => {
                const row = grid.find(g => g.habit_id === h.id)
                const doneToday = row?.completions[todayStr] ?? false
                return (
                  <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: '1px solid var(--faint)' }}>
                    <button onClick={() => toggleToday(h.id)} disabled={togglingId === h.id} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: doneToday ? COLOR : 'var(--muted)', flexShrink: 0 }}>
                      {doneToday ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                    </button>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: doneToday ? 'var(--muted)' : 'var(--text)', textDecoration: doneToday ? 'line-through' : 'none' }}>{h.name}</div>
                      {h.description && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{h.description}</div>}
                    </div>
                    {row && row.streak > 0 && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: COLOR }}>{row.streak}🔥</span>
                    )}
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: h.color, flexShrink: 0 }} />
                  </div>
                )
              })
            )}
          </div>

          {/* 28-day grid */}
          {grid.length > 0 && (
            <div style={{ background: 'var(--panel)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>28-Day Grid</h3>
              </div>
              <div style={{ padding: '16px 20px' }}>
                <HabitGrid rows={grid} days={days} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )

  // Actions tab — manage habits
  const actions = (
    <div style={{ maxWidth: 600 }}>
      {/* Add habit */}
      <div style={{ background: 'var(--panel)', borderRadius: 14, padding: 20, border: '1px solid var(--border)', marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Add Habit</h3>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createHabit()}
            placeholder="Habit name…"
            style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--text)', fontSize: 13, fontFamily: 'Lato', outline: 'none' }}
          />
          <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
            style={{ width: 42, height: 38, borderRadius: 10, border: '1px solid var(--border)', padding: 2, cursor: 'pointer', background: 'var(--faint)' }} />
          <button onClick={createHabit} disabled={creating || !newName.trim()} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10,
            background: COLOR, color: '#fff', border: 'none', cursor: 'pointer',
            fontFamily: 'Raleway', fontWeight: 700, fontSize: 13,
            opacity: creating || !newName.trim() ? 0.5 : 1,
          }}>
            <Plus size={15} /> Add
          </button>
        </div>
      </div>

      {/* Habit list */}
      <div style={{ background: 'var(--panel)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>All Habits</h3>
        </div>
        {habits.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No habits yet.</div>
        ) : (
          habits.map(h => (
            <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', borderBottom: '1px solid var(--faint)' }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: h.color, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{h.name}</div>
                {h.description && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{h.description}</div>}
              </div>
              <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'Lato', textTransform: 'capitalize' }}>{h.frequency}</span>
              <button onClick={() => deleteHabit(h.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )

  const commandCenter = summary ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {(summary.habits ?? []).slice(0, 4).map(h => (
        <div key={h.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>{h.name}</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: h.done_today ? COLOR : 'var(--muted)', fontFamily: 'Raleway', flexShrink: 0 }}>
            {h.done_today ? '✓' : '—'} {h.streak > 0 ? `${h.streak}🔥` : ''}
          </span>
        </div>
      ))}
    </div>
  ) : null

  const settings = (
    <div style={{ maxWidth: 500 }}>
      <div style={{ background: 'var(--panel)', borderRadius: 14, padding: 20, border: '1px solid var(--border)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Habit Tracker Settings</h3>
        {[
          { label: 'Storage', value: 'Supabase (habits + habit_logs)' },
          { label: 'Weekly digest', value: 'Sent via Email Agent (Sundays)' },
          { label: 'Streaks', value: 'Calculated from habit_logs table' },
          { label: 'Grid window', value: '28 days rolling' },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--faint)' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato' }}>{s.label}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', fontFamily: 'Lato' }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <AgentPageLayout
      agentId="habit-tracker"
      agentName="Habit Tracker"
      agentColor={COLOR}
      agentIcon={<Flame size={20} />}
      description="Daily check-ins, streaks & 28-day completion grid"
      tabs={['dashboard', 'actions', 'chat', 'settings']}
      starters={[
        'How am I doing with my habits this week?',
        'What is my longest streak?',
        'Which habits did I miss most this month?',
        'Give me a habit review for the week',
        'What should I focus on today?',
      ]}
      dashboard={dashboard}
      actions={actions}
      settings={settings}
      commandCenter={commandCenter}
    />
  )
}
