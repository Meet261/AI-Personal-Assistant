'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Check, Flame, X, Loader2, Edit2, Save } from 'lucide-react'

const S = { fontFamily: 'Raleway, sans-serif' }

const COLORS = [
  '#0F766E', '#7C3AED', '#B45309', '#0369A1',
  '#DC2626', '#065F46', '#9D174D', '#1D4ED8',
]

interface Habit {
  id: string
  name: string
  description: string | null
  color: string
  frequency: string
  active: boolean
}

interface GridDay { date: string; done: boolean }
interface HabitGrid extends Habit {
  days: GridDay[]
  doneCount: number
}

interface Streak { habit: string; streak: number; total: number }

function api(action: string, params = {}) {
  return fetch('/api/agents/habit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, params }),
  }).then(r => r.json())
}

// Format date as Mon 15, Tue 16, etc.
function dayLabel(date: string) {
  const d = new Date(date + 'T12:00:00')
  return { day: d.toLocaleDateString('en', { weekday: 'short' }), num: d.getDate() }
}

function isToday(date: string) {
  return date === new Date().toISOString().slice(0, 10)
}

export default function HabitsPage() {
  const [grid, setGrid] = useState<HabitGrid[]>([])
  const [days, setDays] = useState<string[]>([])
  const [streaks, setStreaks] = useState<Streak[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<Habit | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', description: '', color: COLORS[0], frequency: 'daily' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [gridRes, streakRes] = await Promise.all([
      api('get_grid'),
      api('get_streaks'),
    ])
    if (gridRes.ok) {
      setGrid(gridRes.data.grid ?? [])
      setDays(gridRes.data.days ?? [])
    }
    if (streakRes.ok) setStreaks(streakRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function toggleToday(habitId: string) {
    setToggling(habitId)
    await api('toggle_today', { habit_id: habitId })
    await load()
    setToggling(null)
  }

  async function createHabit() {
    if (!form.name.trim()) return
    setSaving(true)
    await api('create_habit', form)
    setForm({ name: '', description: '', color: COLORS[0], frequency: 'daily' })
    setShowAdd(false)
    setSaving(false)
    await load()
  }

  async function saveEdit() {
    if (!editing) return
    setSaving(true)
    await api('update_habit', { id: editing.id, name: editing.name, description: editing.description, color: editing.color })
    setEditing(null)
    setSaving(false)
    await load()
  }

  async function deleteHabit(id: string) {
    setDeleting(id)
    await api('delete_habit', { id })
    setDeleting(null)
    await load()
  }

  const today = new Date().toISOString().slice(0, 10)
  const totalDone = grid.reduce((s, h) => s + (h.days.find(d => d.date === today)?.done ? 1 : 0), 0)
  const overallPct = grid.length ? Math.round((grid.reduce((s, h) => s + h.doneCount, 0) / (grid.length * 28)) * 100) : 0

  return (
    <div style={{ ...S, minHeight: '100vh', background: 'var(--bg)', padding: '32px 24px', maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Habits</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>
            {totalDone}/{grid.length} done today · {overallPct}% last 28 days
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 16px', borderRadius: 10, border: 'none',
            background: '#0F766E', color: '#fff', cursor: 'pointer',
            fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 13,
          }}
        >
          <Plus size={15} /> Add Habit
        </button>
      </div>

      {/* Add habit modal */}
      {showAdd && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }}>
          <div style={{
            background: 'var(--card)', borderRadius: 16, padding: 28, width: 400,
            border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>New Habit</h2>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Name</label>
                <input
                  autoFocus
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && createHabit()}
                  placeholder="e.g. Morning run"
                  style={{
                    width: '100%', marginTop: 6, padding: '9px 12px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--faint)',
                    color: 'var(--text)', fontFamily: 'Raleway, sans-serif', fontSize: 14, boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Description (optional)</label>
                <input
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. 30 min cardio"
                  style={{
                    width: '100%', marginTop: 6, padding: '9px 12px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--faint)',
                    color: 'var(--text)', fontFamily: 'Raleway, sans-serif', fontSize: 14, boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Color</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                      style={{
                        width: 28, height: 28, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer',
                        outline: form.color === c ? `3px solid ${c}` : 'none',
                        outlineOffset: 2, opacity: form.color === c ? 1 : 0.6,
                      }}
                    />
                  ))}
                </div>
              </div>
              <button
                onClick={createHabit}
                disabled={saving || !form.name.trim()}
                style={{
                  padding: '10px 0', borderRadius: 10, border: 'none',
                  background: form.color, color: '#fff', cursor: 'pointer',
                  fontFamily: 'Raleway, sans-serif', fontWeight: 800, fontSize: 14,
                  opacity: saving || !form.name.trim() ? 0.6 : 1, marginTop: 4,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {saving ? <Loader2 size={15} style={{ animation: 'spin .8s linear infinite' }} /> : <Plus size={15} />}
                Create Habit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }}>
          <div style={{
            background: 'var(--card)', borderRadius: 16, padding: 28, width: 400,
            border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Edit Habit</h2>
              <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Name</label>
                <input
                  autoFocus
                  value={editing.name}
                  onChange={e => setEditing(h => h ? { ...h, name: e.target.value } : null)}
                  style={{
                    width: '100%', marginTop: 6, padding: '9px 12px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--faint)',
                    color: 'var(--text)', fontFamily: 'Raleway, sans-serif', fontSize: 14, boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Color</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setEditing(h => h ? { ...h, color: c } : null)}
                      style={{
                        width: 28, height: 28, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer',
                        outline: editing.color === c ? `3px solid ${c}` : 'none',
                        outlineOffset: 2, opacity: editing.color === c ? 1 : 0.6,
                      }}
                    />
                  ))}
                </div>
              </div>
              <button
                onClick={saveEdit}
                disabled={saving}
                style={{
                  padding: '10px 0', borderRadius: 10, border: 'none',
                  background: editing.color, color: '#fff', cursor: 'pointer',
                  fontFamily: 'Raleway, sans-serif', fontWeight: 800, fontSize: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {saving ? <Loader2 size={15} style={{ animation: 'spin .8s linear infinite' }} /> : <Save size={15} />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
          <Loader2 size={24} style={{ animation: 'spin .8s linear infinite' }} />
        </div>
      ) : grid.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60, background: 'var(--card)',
          borderRadius: 16, border: '1px dashed var(--border)',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <p style={{ color: 'var(--text)', fontWeight: 700, margin: '0 0 6px' }}>No habits yet</p>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>Click "Add Habit" to start tracking your daily routines.</p>
        </div>
      ) : (
        <>
          {/* 28-day grid */}
          <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Last 28 Days
              </span>
            </div>

            {/* Day headers — show every 7th day label */}
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 640, padding: '0 20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', alignItems: 'center', paddingTop: 10 }}>
                  <div />
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${days.length}, 1fr)`, gap: 3 }}>
                    {days.map((d, i) => {
                      const { day, num } = dayLabel(d)
                      const show = i % 7 === 0 || i === days.length - 1 || isToday(d)
                      return (
                        <div key={d} style={{ textAlign: 'center', fontSize: 9, color: isToday(d) ? '#0F766E' : 'var(--muted)', fontWeight: isToday(d) ? 800 : 400 }}>
                          {show ? <><div>{day}</div><div>{num}</div></> : null}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Habit rows */}
                {grid.map(habit => {
                  const todayDone = habit.days.find(d => d.date === today)?.done ?? false
                  const streak = streaks.find(s => s.habit === habit.name)?.streak ?? 0
                  return (
                    <div key={habit.id} style={{
                      display: 'grid', gridTemplateColumns: '160px 1fr',
                      alignItems: 'center', padding: '8px 0',
                      borderTop: '1px solid var(--faint)',
                    }}>
                      {/* Habit name + streak */}
                      <div style={{ paddingRight: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: habit.color, flexShrink: 0 }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {habit.name}
                          </div>
                          {streak > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#f59e0b' }}>
                              <Flame size={11} /> {streak}d streak
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Day cells */}
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${days.length}, 1fr)`, gap: 3 }}>
                        {habit.days.map(({ date, done }) => {
                          const isTod = isToday(date)
                          const isToggling = toggling === habit.id && isTod
                          return (
                            <button
                              key={date}
                              onClick={() => isTod ? toggleToday(habit.id) : undefined}
                              disabled={!isTod}
                              title={date}
                              style={{
                                width: '100%', aspectRatio: '1', borderRadius: 4, border: 'none',
                                background: done ? habit.color : isTod ? 'var(--faint)' : 'var(--faint)',
                                opacity: done ? 1 : isTod ? 1 : 0.4,
                                cursor: isTod ? 'pointer' : 'default',
                                outline: isTod ? `2px solid ${habit.color}` : 'none',
                                outlineOffset: 1,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'all .15s',
                              }}
                            >
                              {isToggling && <Loader2 size={8} style={{ animation: 'spin .8s linear infinite', color: '#fff' }} />}
                              {done && !isToggling && isTod && <Check size={8} color="#fff" strokeWidth={3} />}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}

                <div style={{ height: 12 }} />
              </div>
            </div>
          </div>

          {/* Today's checklist */}
          <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)', marginBottom: 24 }}>
            <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Today — {new Date().toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' })}
              </span>
            </div>
            <div style={{ padding: '8px 0' }}>
              {grid.map(habit => {
                const done = habit.days.find(d => d.date === today)?.done ?? false
                return (
                  <button
                    key={habit.id}
                    onClick={() => toggleToday(habit.id)}
                    disabled={toggling === habit.id}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                      padding: '12px 20px', border: 'none', background: 'none',
                      cursor: 'pointer', textAlign: 'left', transition: 'background .1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--faint)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <div style={{
                      width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                      background: done ? habit.color : 'transparent',
                      border: `2px solid ${habit.color}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all .15s',
                    }}>
                      {toggling === habit.id
                        ? <Loader2 size={12} style={{ animation: 'spin .8s linear infinite', color: done ? '#fff' : habit.color }} />
                        : done && <Check size={13} color="#fff" strokeWidth={3} />
                      }
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: 14, fontWeight: 700, color: 'var(--text)',
                        textDecoration: done ? 'line-through' : 'none',
                        opacity: done ? 0.6 : 1,
                      }}>
                        {habit.name}
                      </div>
                      {habit.description && (
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>{habit.description}</div>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>
                      {habit.doneCount}/28 days
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Manage habits */}
          <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)' }}>
            <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Manage Habits
              </span>
            </div>
            <div style={{ padding: '8px 0' }}>
              {grid.map(habit => (
                <div key={habit.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 20px',
                }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: habit.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{habit.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{habit.frequency}</div>
                  <button
                    onClick={() => setEditing(habit)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, borderRadius: 6 }}
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => deleteHabit(habit.id)}
                    disabled={deleting === habit.id}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 4, borderRadius: 6 }}
                  >
                    {deleting === habit.id
                      ? <Loader2 size={14} style={{ animation: 'spin .8s linear infinite' }} />
                      : <Trash2 size={14} />
                    }
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
