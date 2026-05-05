'use client'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, Square, Timer, BarChart2, Clock, Layers, ChevronRight, Calendar, Zap } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Task, Project } from '@/lib/types'
import { format, startOfWeek, eachDayOfInterval, endOfWeek, parseISO, isToday } from 'date-fns'

const S = { fontFamily: 'Raleway, sans-serif' }

// ── Types ──────────────────────────────────────────────────────────
interface TimeSession {
  id: string
  taskId: string | null
  taskTitle: string
  projectName: string
  start: number   // epoch ms
  end: number     // epoch ms
  duration: number // ms
  date: string    // YYYY-MM-DD
}

interface ActiveSession {
  taskId: string | null
  taskTitle: string
  projectName: string
  start: number
  pauses: { from: number; to: number }[]
  isPaused: boolean
  pausedAt: number | null
}

// ── Storage helpers ────────────────────────────────────────────────
function loadSessions(): TimeSession[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('time_sessions') || '[]') } catch { return [] }
}
function saveSessions(s: TimeSession[]) {
  localStorage.setItem('time_sessions', JSON.stringify(s))
}
function loadActive(): ActiveSession | null {
  if (typeof window === 'undefined') return null
  try {
    const v = localStorage.getItem('active_session')
    return v ? JSON.parse(v) : null
  } catch { return null }
}
function saveActive(s: ActiveSession | null) {
  if (s) localStorage.setItem('active_session', JSON.stringify(s))
  else localStorage.removeItem('active_session')
}

function uid() { return Math.random().toString(36).slice(2) }

function msToHMS(ms: number) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m ${sec}s`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

function msToHHMMSS(ms: number) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

// Net elapsed excluding pauses
function netElapsed(active: ActiveSession, now: number): number {
  let paused = active.pauses.reduce((acc, p) => acc + (p.to - p.from), 0)
  if (active.isPaused && active.pausedAt) paused += now - active.pausedAt
  return now - active.start - paused
}

// ── Main component ─────────────────────────────────────────────────
export default function TimerPage() {
  const [tab, setTab] = useState<'timer' | 'stats'>('timer')
  const [tasks, setTasks] = useState<Task[]>([])
  const [active, setActiveState] = useState<ActiveSession | null>(null)
  const [sessions, setSessions] = useState<TimeSession[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [selectedTaskId, setSelectedTaskId] = useState<string>('')
  const [toast, setToast] = useState<string | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  // persist helpers
  const setActive = useCallback((s: ActiveSession | null) => {
    setActiveState(s)
    saveActive(s)
  }, [])

  // Load data
  useEffect(() => {
    supabase.from('tasks')
      .select('*, project:projects(id,name,color)')
      .neq('status', 'done')
      .order('priority')
      .then(({ data }) => setTasks((data || []) as Task[]))

    setSessions(loadSessions())
    const act = loadActive()
    if (act) {
      setActiveState(act)
      setElapsed(netElapsed(act, Date.now()))
    }
  }, [])

  // Tick
  useEffect(() => {
    if (active && !active.isPaused) {
      tickRef.current = setInterval(() => {
        setElapsed(netElapsed(active, Date.now()))
      }, 500)
    } else {
      if (tickRef.current) clearInterval(tickRef.current)
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [active])

  function start() {
    const task = tasks.find(t => t.id === selectedTaskId) || null
    const session: ActiveSession = {
      taskId: task?.id || null,
      taskTitle: task?.title || 'Untracked work',
      projectName: (task?.project as Project | undefined)?.name || '',
      start: Date.now(),
      pauses: [],
      isPaused: false,
      pausedAt: null,
    }
    setActive(session)
    setElapsed(0)
  }

  function pause() {
    if (!active || active.isPaused) return
    const updated: ActiveSession = { ...active, isPaused: true, pausedAt: Date.now() }
    setActive(updated)
  }

  function resume() {
    if (!active || !active.isPaused || !active.pausedAt) return
    const updated: ActiveSession = {
      ...active,
      isPaused: false,
      pauses: [...active.pauses, { from: active.pausedAt, to: Date.now() }],
      pausedAt: null,
    }
    setActive(updated)
  }

  function stop() {
    if (!active) return
    const now = Date.now()
    const duration = netElapsed(active, now)
    if (duration < 5000) { setActive(null); setElapsed(0); showToast('Session too short (< 5s) — not saved'); return }

    const session: TimeSession = {
      id: uid(),
      taskId: active.taskId,
      taskTitle: active.taskTitle,
      projectName: active.projectName,
      start: active.start,
      end: now,
      duration,
      date: format(new Date(), 'yyyy-MM-dd'),
    }
    const updated = [session, ...loadSessions()]
    saveSessions(updated)
    setSessions(updated)
    setActive(null)
    setElapsed(0)
  }

  // ── Stats calculations ────────────────────────────────────────────
  const today = format(new Date(), 'yyyy-MM-dd')
  const todaySessions = sessions.filter(s => s.date === today)
  const todayTotal = todaySessions.reduce((a, s) => a + s.duration, 0)
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 })
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd })
  const weekTotal = sessions.filter(s => s.date >= format(weekStart, 'yyyy-MM-dd') && s.date <= format(weekEnd, 'yyyy-MM-dd'))
    .reduce((a, s) => a + s.duration, 0)

  // Task breakdown — last 30 days
  const taskMap: Record<string, { title: string; project: string; ms: number; count: number }> = {}
  for (const s of sessions) {
    const key = s.taskId || `__${s.taskTitle}`
    if (!taskMap[key]) taskMap[key] = { title: s.taskTitle, project: s.projectName, ms: 0, count: 0 }
    taskMap[key].ms += s.duration
    taskMap[key].count++
  }
  const taskStats = Object.values(taskMap).sort((a, b) => b.ms - a.ms)

  // Daily heatmap for current week
  const dayTotals = weekDays.map(d => {
    const ds = format(d, 'yyyy-MM-dd')
    return {
      date: ds,
      label: format(d, 'EEE'),
      ms: sessions.filter(s => s.date === ds).reduce((a, s) => a + s.duration, 0),
      isToday: isToday(d),
    }
  })
  const maxDay = Math.max(...dayTotals.map(d => d.ms), 1)

  const selectedTask = tasks.find(t => t.id === selectedTaskId)

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900, margin: '0 auto' }}>
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 200, padding: '10px 20px', borderRadius: 12, background: 'var(--panel)', border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(0,0,0,.2)', fontSize: 13, fontFamily: 'Raleway, sans-serif', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ ...S, fontWeight: 900, fontSize: 24, color: 'var(--text)', margin: 0 }}>Work Timer</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
            Track time by task · see where your day goes
          </p>
        </div>
        <div style={{ display: 'flex', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
          {(['timer', 'stats'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                padding: '8px 18px', border: 'none', cursor: 'pointer',
                ...S, fontWeight: 700, fontSize: 12,
                background: tab === t ? 'var(--brand)' : 'var(--faint)',
                color: tab === t ? '#fff' : 'var(--muted)',
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
              {t === 'timer' ? <Timer size={13} /> : <BarChart2 size={13} />}
              {t === 'timer' ? 'Timer' : 'Stats'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'timer' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Big clock */}
          <div className="card" style={{
            borderRadius: 'var(--r-xl)', padding: '40px 32px', textAlign: 'center',
            background: active
              ? active.isPaused
                ? 'linear-gradient(135deg, rgba(255,204,102,.08), rgba(255,204,102,.04))'
                : 'linear-gradient(135deg, rgba(13,148,136,.10), rgba(45,212,191,.05))'
              : undefined,
            border: active
              ? active.isPaused ? '1px solid rgba(255,204,102,.25)' : '1px solid rgba(13,148,136,.25)'
              : '1px solid var(--border)',
          }}>
            {/* Status pill */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <span style={{
                padding: '4px 14px', borderRadius: 999, fontSize: 11, fontWeight: 800, ...S,
                background: active
                  ? active.isPaused ? 'rgba(255,204,102,.18)' : 'rgba(13,148,136,.18)'
                  : 'var(--faint)',
                color: active
                  ? active.isPaused ? '#ffcc66' : 'var(--brand)'
                  : 'var(--muted)',
              }}>
                {active ? (active.isPaused ? '⏸ Paused' : '● Recording') : '○ Idle'}
              </span>
            </div>

            {/* Timer display */}
            <div style={{
              fontFamily: 'monospace', fontSize: 64, fontWeight: 900, letterSpacing: '-2px',
              color: active ? (active.isPaused ? '#ffcc66' : 'var(--brand)') : 'var(--muted)',
              lineHeight: 1, marginBottom: 8,
              opacity: active?.isPaused ? 0.7 : 1,
            }}>
              {msToHHMMSS(elapsed)}
            </div>

            {/* Current task label */}
            {active && (
              <p style={{ ...S, fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                {active.taskTitle}
              </p>
            )}
            {active?.projectName && (
              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 0 }}>
                {active.projectName}
              </p>
            )}
          </div>

          {/* Task selector — only when not running */}
          {!active && (
            <div className="card" style={{ borderRadius: 'var(--r-lg)', padding: 20 }}>
              <p style={{ ...S, fontWeight: 800, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>
                What are you working on?
              </p>
              <select
                value={selectedTaskId}
                onChange={e => setSelectedTaskId(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 12,
                  background: 'var(--faint)', border: '1px solid var(--border)',
                  color: 'var(--text)', fontSize: 13, fontFamily: 'Lato, sans-serif', outline: 'none',
                }}>
                <option value="">— Untracked (general work) —</option>
                {tasks.map(t => (
                  <option key={t.id} value={t.id}>
                    {(t.project as Project | undefined)?.name ? `[${(t.project as Project).name}] ` : ''}{t.title}
                  </option>
                ))}
              </select>
              {selectedTask && (
                <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                  <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, ...S, background: 'var(--faint)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                    Effort: {selectedTask.effort}
                  </span>
                  <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, ...S, background: 'var(--faint)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                    {selectedTask.priority}
                  </span>
                  {selectedTask.deadline && (
                    <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, ...S, background: 'var(--faint)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                      Due {selectedTask.deadline}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Controls */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            {!active ? (
              <button onClick={start}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '14px 40px', borderRadius: 16, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, var(--t1), var(--t2))',
                  color: '#fff', fontSize: 15, fontWeight: 900, ...S,
                  boxShadow: '0 4px 20px rgba(13,148,136,.4)',
                }}>
                <Play size={18} fill="#fff" /> Start Work Session
              </button>
            ) : (
              <>
                {active.isPaused ? (
                  <button onClick={resume}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '12px 28px', borderRadius: 14, border: 'none', cursor: 'pointer',
                      background: 'linear-gradient(135deg, var(--t1), var(--t2))',
                      color: '#fff', fontSize: 14, fontWeight: 800, ...S,
                      boxShadow: '0 4px 16px rgba(13,148,136,.35)',
                    }}>
                    <Play size={16} fill="#fff" /> Resume
                  </button>
                ) : (
                  <button onClick={pause}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '12px 28px', borderRadius: 14, cursor: 'pointer',
                      background: 'rgba(255,204,102,.15)', border: '1px solid rgba(255,204,102,.3)',
                      color: '#ffcc66', fontSize: 14, fontWeight: 800, ...S,
                    }}>
                    <Pause size={16} /> Pause
                  </button>
                )}
                <button onClick={stop}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '12px 28px', borderRadius: 14, border: '1px solid rgba(255,92,122,.3)',
                    cursor: 'pointer', background: 'rgba(255,92,122,.08)',
                    color: '#ff5c7a', fontSize: 14, fontWeight: 800, ...S,
                  }}>
                  <Square size={16} fill="#ff5c7a" /> Stop & Save
                </button>
              </>
            )}
          </div>

          {/* Today's sessions */}
          {todaySessions.length > 0 && (
            <div className="card" style={{ borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ ...S, fontWeight: 800, fontSize: 13, color: 'var(--text)', margin: 0 }}>Today&apos;s Sessions</p>
                <span style={{ ...S, fontWeight: 700, fontSize: 12, color: 'var(--brand)' }}>
                  Total: {msToHMS(todayTotal)}
                </span>
              </div>
              {todaySessions.map((s, i) => (
                <div key={s.id} style={{
                  padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  borderBottom: i < todaySessions.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <div>
                    <p style={{ ...S, fontWeight: 700, fontSize: 13, color: 'var(--text)', margin: 0 }}>{s.taskTitle}</p>
                    {s.projectName && <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 0' }}>{s.projectName}</p>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13, color: 'var(--brand)', margin: 0 }}>
                      {msToHMS(s.duration)}
                    </p>
                    <p style={{ fontSize: 10, color: 'var(--muted)', margin: '2px 0 0' }}>
                      {format(new Date(s.start), 'h:mm a')} – {format(new Date(s.end), 'h:mm a')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'stats' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {[
              { label: 'Today', value: msToHMS(todayTotal), icon: Clock, sub: `${todaySessions.length} sessions` },
              { label: 'This Week', value: msToHMS(weekTotal), icon: Calendar, sub: `${sessions.filter(s => s.date >= format(weekStart, 'yyyy-MM-dd')).length} sessions` },
              { label: 'All Time', value: msToHMS(sessions.reduce((a, s) => a + s.duration, 0)), icon: Zap, sub: `${sessions.length} total sessions` },
            ].map(card => (
              <div key={card.label} className="card" style={{ borderRadius: 'var(--r-lg)', padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <card.icon size={14} style={{ color: 'var(--brand)' }} />
                  <p style={{ ...S, fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', margin: 0 }}>{card.label}</p>
                </div>
                <p style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: 0 }}>{card.value}</p>
                <p style={{ fontSize: 11, color: 'var(--muted)', margin: '4px 0 0' }}>{card.sub}</p>
              </div>
            ))}
          </div>

          {/* Weekly heatmap */}
          <div className="card" style={{ borderRadius: 'var(--r-lg)', padding: 20 }}>
            <p style={{ ...S, fontWeight: 800, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 16 }}>
              This Week
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 80 }}>
              {dayTotals.map(d => (
                <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: '100%', borderRadius: 6,
                    height: d.ms > 0 ? Math.max(8, (d.ms / maxDay) * 56) : 4,
                    background: d.isToday
                      ? 'linear-gradient(180deg, var(--t4), var(--t2))'
                      : d.ms > 0 ? 'var(--brand2)' : 'var(--faint)',
                    opacity: d.ms > 0 ? 1 : 0.4,
                    transition: 'height .3s',
                  }} title={d.ms > 0 ? msToHMS(d.ms) : 'No work'} />
                  <p style={{ fontSize: 10, fontWeight: d.isToday ? 800 : 600, ...S, color: d.isToday ? 'var(--brand)' : 'var(--muted)', margin: 0 }}>{d.label}</p>
                  {d.ms > 0 && <p style={{ fontSize: 9, color: 'var(--muted)', margin: 0, fontFamily: 'monospace' }}>{msToHMS(d.ms)}</p>}
                </div>
              ))}
            </div>
          </div>

          {/* Task breakdown */}
          {taskStats.length > 0 && (
            <div className="card" style={{ borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                <p style={{ ...S, fontWeight: 800, fontSize: 13, color: 'var(--text)', margin: 0 }}>Time by Task</p>
              </div>
              {taskStats.slice(0, 10).map((t, i) => {
                const pct = Math.round((t.ms / sessions.reduce((a, s) => a + s.duration, 1)) * 100)
                return (
                  <div key={i} style={{ padding: '12px 20px', borderBottom: i < Math.min(taskStats.length, 10) - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ minWidth: 0, flex: 1, marginRight: 12 }}>
                        <p style={{ ...S, fontWeight: 700, fontSize: 13, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</p>
                        {t.project && <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 0' }}>{t.project}</p>}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13, color: 'var(--brand)', margin: 0 }}>{msToHMS(t.ms)}</p>
                        <p style={{ fontSize: 10, color: 'var(--muted)', margin: '2px 0 0' }}>{t.count} session{t.count !== 1 ? 's' : ''} · {pct}%</p>
                      </div>
                    </div>
                    <div style={{ height: 4, borderRadius: 99, background: 'var(--faint)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 99, background: 'linear-gradient(90deg, var(--t1), var(--t4))', width: `${pct}%`, transition: 'width .4s' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {sessions.length === 0 && (
            <div className="card" style={{ borderRadius: 'var(--r-lg)', padding: '56px 0', textAlign: 'center' }}>
              <Timer size={40} style={{ color: 'var(--muted)', opacity: 0.2, display: 'block', margin: '0 auto 12px' }} />
              <p style={{ ...S, fontWeight: 700, color: 'var(--muted)' }}>No sessions yet — start the timer to track your work</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
