'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Check, Flame, X, Loader2, Edit2, Save, CheckCircle2, Circle } from 'lucide-react'

const COLORS = [
  { hex: '#0F766E', label: 'Teal' },
  { hex: '#7C3AED', label: 'Purple' },
  { hex: '#B45309', label: 'Amber' },
  { hex: '#0369A1', label: 'Blue' },
  { hex: '#DC2626', label: 'Red' },
  { hex: '#065F46', label: 'Green' },
  { hex: '#9D174D', label: 'Pink' },
  { hex: '#1D4ED8', label: 'Indigo' },
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
interface HabitGrid extends Habit { days: GridDay[]; doneCount: number }
interface Streak { habit: string; streak: number; total: number }

function api(action: string, params: Record<string, unknown> = {}) {
  return fetch('/api/agents/habit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, params }),
  }).then(r => r.json())
}

function dayLabel(date: string) {
  const d = new Date(date + 'T12:00:00')
  return { day: d.toLocaleDateString('en', { weekday: 'short' }), num: d.getDate() }
}

const today = new Date().toISOString().slice(0, 10)

// ── Inline input style matching app design system ─────────────────────────
const inp: React.CSSProperties = {
  background: 'var(--panel2)', border: '1px solid var(--border)', color: 'var(--text)',
  borderRadius: 10, padding: '9px 13px', fontSize: 13, fontFamily: 'Lato, sans-serif',
  outline: 'none', width: '100%', boxSizing: 'border-box',
}

// ── Modal backdrop + card ─────────────────────────────────────────────────
function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        backdropFilter: 'blur(2px)',
      }}
    >
      <div style={{
        background: 'var(--panel)', borderRadius: 16, padding: 28, width: 420,
        border: '1px solid var(--border)', boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {children}
      </div>
    </div>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
      {COLORS.map(c => (
        <button key={c.hex} onClick={() => onChange(c.hex)} title={c.label}
          style={{
            width: 30, height: 30, borderRadius: '50%', background: c.hex,
            border: value === c.hex ? `3px solid var(--text)` : '3px solid transparent',
            cursor: 'pointer', outline: 'none', transition: 'transform .1s, border .1s',
            transform: value === c.hex ? 'scale(1.15)' : 'scale(1)',
          }}
        />
      ))}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
      {children}
    </div>
  )
}

export default function HabitsPage() {
  const [grid, setGrid] = useState<HabitGrid[]>([])
  const [days, setDays] = useState<string[]>([])
  const [streaks, setStreaks] = useState<Streak[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  // Modals
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<Habit | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Habit | null>(null)

  // Forms
  const blankForm = { name: '', description: '', color: COLORS[0].hex, frequency: 'daily' }
  const [form, setForm] = useState(blankForm)
  const [editForm, setEditForm] = useState({ name: '', description: '', color: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [g, s] = await Promise.all([api('get_grid'), api('get_streaks')])
    if (g.ok) { setGrid(g.data.grid ?? []); setDays(g.data.days ?? []) }
    if (s.ok) setStreaks(s.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Actions ───────────────────────────────────────────────────────────
  async function toggleToday(habitId: string) {
    setToggling(habitId)
    // Optimistic update
    setGrid(g => g.map(h => h.id !== habitId ? h : {
      ...h,
      days: h.days.map(d => d.date === today ? { ...d, done: !d.done } : d),
      doneCount: h.days.find(d => d.date === today)?.done ? h.doneCount - 1 : h.doneCount + 1,
    }))
    await api('toggle_today', { habit_id: habitId })
    await load()
    setToggling(null)
  }

  async function createHabit() {
    if (!form.name.trim()) return
    setSaving(true)
    await api('create_habit', { ...form })
    setForm(blankForm)
    setShowAdd(false)
    setSaving(false)
    await load()
  }

  async function saveEdit() {
    if (!editing || !editForm.name.trim()) return
    setSaving(true)
    await api('update_habit', { id: editing.id, ...editForm })
    setEditing(null)
    setSaving(false)
    await load()
  }

  async function deleteHabit() {
    if (!confirmDelete) return
    await api('delete_habit', { id: confirmDelete.id })
    setConfirmDelete(null)
    await load()
  }

  // ── Derived stats ─────────────────────────────────────────────────────
  const todayDone = grid.filter(h => h.days.find(d => d.date === today)?.done).length
  const overallPct = grid.length
    ? Math.round(grid.reduce((s, h) => s + h.doneCount, 0) / (grid.length * 28) * 100)
    : 0

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '28px 24px', maxWidth: 960, margin: '0 auto', fontFamily: 'Raleway, sans-serif' }}>

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: 0, letterSpacing: '-0.02em' }}>Habits</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0', fontFamily: 'Lato, sans-serif' }}>
            {loading ? '…' : `${todayDone} of ${grid.length} done today · ${overallPct}% last 28 days`}
          </p>
        </div>
        <button
          onClick={() => { setForm(blankForm); setShowAdd(true) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px',
            borderRadius: 10, border: 'none', background: '#0F766E', color: '#fff',
            cursor: 'pointer', fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 13,
          }}
        >
          <Plus size={14} /> Add Habit
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <Loader2 size={22} style={{ animation: 'spin .8s linear infinite', color: 'var(--muted)' }} />
        </div>
      ) : grid.length === 0 ? (
        /* ── Empty state ──────────────────────────────────────────────── */
        <div style={{
          textAlign: 'center', padding: '64px 24px', background: 'var(--panel)',
          borderRadius: 16, border: '1px dashed var(--border)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔥</div>
          <p style={{ color: 'var(--text)', fontWeight: 800, fontSize: 16, margin: '0 0 8px' }}>No habits yet</p>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 24px', fontFamily: 'Lato, sans-serif' }}>
            Build daily consistency by tracking your routines here.
          </p>
          <button
            onClick={() => { setForm(blankForm); setShowAdd(true) }}
            style={{
              padding: '10px 20px', borderRadius: 10, border: 'none',
              background: '#0F766E', color: '#fff', cursor: 'pointer',
              fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 13,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <Plus size={14} /> Add your first habit
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Today's checklist ──────────────────────────────────────── */}
          <div style={{ background: 'var(--panel)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Today — {new Date().toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' })}
              </span>
              <span style={{
                fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 20,
                background: todayDone === grid.length ? 'rgba(15,118,110,0.15)' : 'var(--faint)',
                color: todayDone === grid.length ? '#0F766E' : 'var(--muted)',
              }}>
                {todayDone}/{grid.length}
              </span>
            </div>
            {grid.map((habit, i) => {
              const done = habit.days.find(d => d.date === today)?.done ?? false
              const streak = streaks.find(s => s.habit === habit.name)?.streak ?? 0
              const isLast = i === grid.length - 1
              return (
                <div
                  key={habit.id}
                  onClick={() => !toggling && toggleToday(habit.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '13px 20px', cursor: 'pointer',
                    borderBottom: isLast ? 'none' : '1px solid var(--faint)',
                    transition: 'background .1s',
                    background: done ? `${habit.color}08` : 'transparent',
                  }}
                  onMouseEnter={e => !done && (e.currentTarget.style.background = 'var(--faint)')}
                  onMouseLeave={e => e.currentTarget.style.background = done ? `${habit.color}08` : 'transparent'}
                >
                  {/* Checkbox */}
                  <div style={{
                    width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                    background: done ? habit.color : 'transparent',
                    border: `2px solid ${done ? habit.color : 'var(--border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all .15s',
                  }}>
                    {toggling === habit.id
                      ? <Loader2 size={11} style={{ animation: 'spin .8s linear infinite', color: done ? '#fff' : habit.color }} />
                      : done ? <Check size={13} color="#fff" strokeWidth={3} /> : null
                    }
                  </div>

                  {/* Name + description */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 700, color: done ? 'var(--muted)' : 'var(--text)',
                      textDecoration: done ? 'line-through' : 'none', transition: 'all .15s',
                    }}>
                      {habit.name}
                    </div>
                    {habit.description && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1, fontFamily: 'Lato, sans-serif' }}>
                        {habit.description}
                      </div>
                    )}
                  </div>

                  {/* Streak */}
                  {streak > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: '#f59e0b', flexShrink: 0 }}>
                      <Flame size={13} /> {streak}d
                    </div>
                  )}

                  {/* Completion rate */}
                  <div style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0, fontFamily: 'Lato, sans-serif' }}>
                    {habit.doneCount}/28
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── 28-day grid ────────────────────────────────────────────── */}
          <div style={{ background: 'var(--panel)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                28-Day History
              </span>
            </div>
            <div style={{ overflowX: 'auto', padding: '12px 20px 16px' }}>
              <div style={{ minWidth: 580 }}>
                {/* Day labels */}
                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', marginBottom: 6 }}>
                  <div />
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${days.length}, 1fr)`, gap: 3 }}>
                    {days.map((d, i) => {
                      const { day, num } = dayLabel(d)
                      const isTod = d === today
                      const show = i === 0 || i % 7 === 0 || isTod || i === days.length - 1
                      return (
                        <div key={d} style={{ textAlign: 'center', minWidth: 0 }}>
                          {show ? (
                            <div style={{ fontSize: 9, lineHeight: 1.3, color: isTod ? '#0F766E' : 'var(--muted)', fontWeight: isTod ? 800 : 500 }}>
                              <div>{day}</div>
                              <div>{num}</div>
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Habit rows */}
                {grid.map(habit => (
                  <div key={habit.id} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', marginBottom: 6 }}>
                    {/* Name */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingRight: 10, minWidth: 0 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: habit.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {habit.name}
                      </span>
                    </div>
                    {/* Cells */}
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${days.length}, 1fr)`, gap: 3 }}>
                      {habit.days.map(({ date, done }) => {
                        const isTod = date === today
                        return (
                          <div
                            key={date}
                            onClick={() => isTod && !toggling && toggleToday(habit.id)}
                            title={`${date}${done ? ' ✓' : ''}`}
                            style={{
                              aspectRatio: '1', borderRadius: 4,
                              background: done ? habit.color : 'var(--faint)',
                              opacity: done ? 1 : isTod ? 0.8 : 0.35,
                              outline: isTod ? `2px solid ${habit.color}` : 'none',
                              outlineOffset: 1,
                              cursor: isTod ? 'pointer' : 'default',
                              transition: 'opacity .15s',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            {isTod && toggling === habit.id && (
                              <Loader2 size={7} style={{ animation: 'spin .8s linear infinite', color: done ? '#fff' : habit.color }} />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Manage habits ───────────────────────────────────────────── */}
          <div style={{ background: 'var(--panel)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Manage
              </span>
            </div>
            {grid.map((habit, i) => {
              const streak = streaks.find(s => s.habit === habit.name)?.streak ?? 0
              const pct = Math.round((habit.doneCount / 28) * 100)
              return (
                <div key={habit.id} style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px',
                  borderBottom: i < grid.length - 1 ? '1px solid var(--faint)' : 'none',
                }}>
                  {/* Colour dot */}
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: habit.color, flexShrink: 0 }} />

                  {/* Name + meta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{habit.name}</div>
                    {habit.description && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato, sans-serif' }}>{habit.description}</div>
                    )}
                  </div>

                  {/* Stats */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                    {streak > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>
                        <Flame size={12} /> {streak}d
                      </div>
                    )}
                    {/* Mini progress bar */}
                    <div style={{ width: 60 }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, fontFamily: 'Lato, sans-serif', textAlign: 'right' }}>{pct}%</div>
                      <div style={{ height: 4, borderRadius: 4, background: 'var(--faint)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: habit.color, borderRadius: 4, transition: 'width .3s' }} />
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button
                      onClick={() => { setEditing(habit); setEditForm({ name: habit.name, description: habit.description ?? '', color: habit.color }) }}
                      style={{ background: 'none', border: '1px solid transparent', borderRadius: 8, cursor: 'pointer', color: 'var(--muted)', padding: '5px 7px', display: 'flex', alignItems: 'center', transition: 'all .15s' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--faint)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'none' }}
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(habit)}
                      style={{ background: 'none', border: '1px solid transparent', borderRadius: 8, cursor: 'pointer', color: 'var(--muted)', padding: '5px 7px', display: 'flex', alignItems: 'center', transition: 'all .15s' }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#ff5c7a'; e.currentTarget.style.borderColor = 'rgba(255,92,122,.3)'; e.currentTarget.style.background = 'rgba(255,92,122,.08)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'none' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Add habit modal ──────────────────────────────────────────────── */}
      {showAdd && (
        <Modal onClose={() => setShowAdd(false)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.01em' }}>New Habit</h2>
            <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, borderRadius: 6 }}>
              <X size={18} />
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <Label>Name</Label>
              <input autoFocus style={inp} value={form.name} placeholder="e.g. Morning run"
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && createHabit()}
              />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <input style={inp} value={form.description} placeholder="e.g. 30 min cardio outdoors"
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div>
              <Label>Color</Label>
              <ColorPicker value={form.color} onChange={c => setForm(f => ({ ...f, color: c }))} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                onClick={() => setShowAdd(false)}
                style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                onClick={createHabit}
                disabled={saving || !form.name.trim()}
                style={{
                  flex: 2, padding: '10px 0', borderRadius: 10, border: 'none',
                  background: form.color, color: '#fff', cursor: form.name.trim() ? 'pointer' : 'not-allowed',
                  fontFamily: 'Raleway, sans-serif', fontWeight: 800, fontSize: 13,
                  opacity: !form.name.trim() ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                }}
              >
                {saving ? <Loader2 size={14} style={{ animation: 'spin .8s linear infinite' }} /> : <Plus size={14} />}
                Create Habit
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Edit habit modal ─────────────────────────────────────────────── */}
      {editing && (
        <Modal onClose={() => setEditing(null)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.01em' }}>Edit Habit</h2>
            <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, borderRadius: 6 }}>
              <X size={18} />
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <Label>Name</Label>
              <input autoFocus style={inp} value={editForm.name}
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && saveEdit()}
              />
            </div>
            <div>
              <Label>Description</Label>
              <input style={inp} value={editForm.description}
                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div>
              <Label>Color</Label>
              <ColorPicker value={editForm.color} onChange={c => setEditForm(f => ({ ...f, color: c }))} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                onClick={() => setEditing(null)}
                style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={saving || !editForm.name.trim()}
                style={{
                  flex: 2, padding: '10px 0', borderRadius: 10, border: 'none',
                  background: editForm.color, color: '#fff', cursor: 'pointer',
                  fontFamily: 'Raleway, sans-serif', fontWeight: 800, fontSize: 13,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                }}
              >
                {saving ? <Loader2 size={14} style={{ animation: 'spin .8s linear infinite' }} /> : <Save size={14} />}
                Save Changes
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Confirm delete modal ─────────────────────────────────────────── */}
      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)}>
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🗑️</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 900, color: 'var(--text)' }}>Delete habit?</h2>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 24px', fontFamily: 'Lato, sans-serif', lineHeight: 1.6 }}>
              This will permanently delete <strong style={{ color: 'var(--text)' }}>{confirmDelete.name}</strong> and all its history. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setConfirmDelete(null)}
                style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                onClick={deleteHabit}
                style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: '#DC2626', color: '#fff', cursor: 'pointer', fontFamily: 'Raleway, sans-serif', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
        </Modal>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
