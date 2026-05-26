'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, CheckCircle2, X, Search, Clock, AlertCircle } from 'lucide-react'
import { loadActive, saveActive, startSession, commitSession, dispatchTimerUpdate } from '@/lib/timer'

interface Task {
  id: string
  title: string
  status: string
  priority: string
  scheduled_for?: string | null
  deadline?: string | null
  project?: { id: string; name: string; color: string } | null
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: '#ff5c7a', high: '#ffcc66', medium: '#3dd6d0', low: '#27d98a',
}

const STATUS_LABEL: Record<string, string> = {
  todo: 'Todo', in_progress: 'In Progress', deferred: 'Blocked', done: 'Done',
}

const STATUS_COLOR: Record<string, string> = {
  todo: '#6b7280', in_progress: '#3dd6d0', deferred: '#f97316', done: '#22c55e',
}

const FILTERS = [
  { key: 'all',         label: 'All'         },
  { key: 'todo',        label: 'Todo'        },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'deferred',    label: 'Blocked'     },
]

const ESTIMATES = [
  { label: '15m', ms: 15 * 60_000 },
  { label: '30m', ms: 30 * 60_000 },
  { label: '1h',  ms: 60 * 60_000 },
  { label: '2h',  ms: 120 * 60_000 },
  { label: '4h',  ms: 240 * 60_000 },
]

function msToLabel(ms: number) {
  const h = ms / 3600000
  if (h >= 1) return `${h % 1 === 0 ? h : h.toFixed(1)}h`
  return `${Math.round(ms / 60000)}m`
}

export default function QuickTaskAction() {
  const [mode, setMode]             = useState<'start' | 'finish' | null>(null)
  const [tasks, setTasks]           = useState<Task[]>([])
  const [query, setQuery]           = useState('')
  const [filter, setFilter]         = useState('all')
  const [selectedId, setSelected]   = useState<string>('')
  const [saving, setSaving]         = useState(false)
  const [done, setDone]             = useState(false)
  const [activeSession, setActive]  = useState(() => loadActive())
  const [estimateMs, setEstimateMs] = useState<number | null>(null)
  const [finishResult, setFinishResult] = useState<{ duration: number; estimate: number | null } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Load tasks (excluding done unless searching)
  useEffect(() => {
    fetch('/api/tasks')
      .then(r => r.json())
      .then((data: Task[]) => {
        if (Array.isArray(data)) setTasks(data.filter(t => t.status !== 'done'))
      })
      .catch(() => {})
  }, [])

  // Re-read active session whenever timer changes
  useEffect(() => {
    function sync() { setActive(loadActive()) }
    window.addEventListener('timer:update', sync)
    return () => window.removeEventListener('timer:update', sync)
  }, [])

  // Keyboard shortcuts — capture phase to beat browser defaults
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName

      if (e.ctrlKey && !e.metaKey && !e.shiftKey) {
        if (e.key.toLowerCase() === 's') {
          if (mode !== null) return   // already open
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
          e.preventDefault()
          setMode('start')
          setQuery(''); setFilter('all'); setSelected(''); setDone(false); setEstimateMs(null); setFinishResult(null)
          return
        }
        if (e.key.toLowerCase() === 'f') {
          e.preventDefault()
          if (mode !== null) { setMode(null); return }

          const current = loadActive()
          // Always open the overlay in finish mode first so the result banner can show
          setMode('finish')
          setQuery(''); setFilter('in_progress'); setSelected(''); setDone(false); setFinishResult(null)
          // If a task is already running, finish it immediately (result shown in the overlay)
          if (current?.taskId) {
            setTimeout(() => finishImmediate(current.taskId!, current), 100)
          }
          return
        }
      }

      if (e.key === 'Escape' && mode !== null) { e.stopPropagation(); setMode(null) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [mode])

  // Focus search when overlay opens
  useEffect(() => {
    if (mode) requestAnimationFrame(() => searchRef.current?.focus())
  }, [mode])

  // Pre-select currently running task in start mode
  useEffect(() => {
    if (mode === 'start' && activeSession?.taskId) setSelected(activeSession.taskId)
  }, [mode, activeSession])

  // ── Filtered task list ─────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

  // Date bucket: 0 = overdue, 1 = today, 2 = tomorrow, 3 = this week, 4 = future, 5 = undated
  function dateBucket(t: Task): number {
    const d = t.scheduled_for ?? t.deadline
    if (!d) return 5
    if (d < today) return 0   // overdue
    if (d === today) return 1
    if (d === tomorrow) return 2
    const weekOut = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
    if (d <= weekOut) return 3
    return 4
  }

  const filtered = tasks.filter(t => {
    if (mode === 'start' && t.status === 'done') return false
    if (mode === 'finish' && t.status === 'done') return false
    if (filter !== 'all' && t.status !== filter) return false
    if (query) {
      const q = query.toLowerCase()
      return t.title.toLowerCase().includes(q) ||
             (t.project?.name ?? '').toLowerCase().includes(q)
    }
    return true
  }).sort((a, b) => {
    // In-progress tasks always float to top
    if (a.status === 'in_progress' && b.status !== 'in_progress') return -1
    if (b.status === 'in_progress' && a.status !== 'in_progress') return 1
    // Then sort by date bucket (today → tomorrow → this week → future → undated, overdue first)
    const db = dateBucket(a) - dateBucket(b)
    if (db !== 0) return db
    // Within same date bucket: sort by priority
    const order = { urgent: 0, high: 1, medium: 2, low: 3 }
    return (order[a.priority as keyof typeof order] ?? 2) - (order[b.priority as keyof typeof order] ?? 2)
  })

  // ── Actions ────────────────────────────────────────────────────────────────
  async function confirmStart() {
    const task = tasks.find(t => t.id === selectedId)
    if (!task || saving) return
    setSaving(true)

    // Start timer (commits previous session if any), passing estimate
    const projectName = task.project?.name ?? ''
    startSession(task.id, task.title, projectName, estimateMs)
    dispatchTimerUpdate()
    setActive(loadActive())

    // Mark task in_progress
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress' }),
    }).catch(() => {})

    setSaving(false)
    setDone(true)
    setTimeout(() => setMode(null), 700)
  }

  async function finishImmediate(taskId: string, current = loadActive()) {
    setSaving(true)

    // Stop timer — always clear active session; commitSession logs it only if ≥5s
    if (current) {
      const { netElapsed } = await import('@/lib/timer')
      const actualMs = netElapsed(current, Date.now())
      commitSession(current)
      saveActive(null)          // ensure cleared even if session was too short to log
      dispatchTimerUpdate()
      // Show actual vs estimate result
      if (actualMs >= 5000 || current.estimateMs) {
        setFinishResult({ duration: actualMs, estimate: current.estimateMs ?? null })
      }
      setActive(null)
    }

    // Mark task done
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done', completed_at: new Date().toISOString() }),
    }).catch(() => {})

    setSaving(false)
    setDone(true)
    // If there's a result to show, keep overlay open for 3s; otherwise close fast
    setTimeout(() => setMode(null), finishResult || current?.estimateMs ? 3000 : 700)
  }

  async function confirmFinish() {
    if (!selectedId || saving) return
    await finishImmediate(selectedId)
  }

  if (!mode) return null

  const isStart   = mode === 'start'
  const accentColor = isStart ? '#3dd6d0' : '#22c55e'
  const selected  = tasks.find(t => t.id === selectedId)

  return (
    <div
      onClick={() => setMode(null)}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(10,20,30,0.6)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '10vh',
        animation: 'qaFadeIn .12s ease-out',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(580px,94vw)',
          background: 'var(--panel)',
          borderRadius: 20,
          border: `1px solid ${accentColor}40`,
          boxShadow: `0 28px 72px rgba(0,0,0,0.4), 0 0 0 1px ${accentColor}20`,
          overflow: 'hidden',
          animation: 'qaSlideDown .16s ease-out',
          display: 'flex', flexDirection: 'column',
          maxHeight: '76vh',
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            {isStart
              ? <Play size={16} color={accentColor} fill={accentColor} />
              : <CheckCircle2 size={16} color={accentColor} />}
            <span style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>
              {isStart ? 'Start Task' : 'Finish Task'}
            </span>
            <button type="button" onClick={() => setMode(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', lineHeight: 0, padding: 4 }}>
              <X size={15} />
            </button>
          </div>

          {/* Running session banner */}
          {activeSession && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 9, background: `${accentColor}12`, border: `1px solid ${accentColor}30`, marginBottom: 10 }}>
              <Clock size={12} color={accentColor} />
              <span style={{ fontSize: 12, color: accentColor, fontFamily: 'Lato, sans-serif', fontWeight: 600 }}>
                {isStart
                  ? `Currently timing: ${activeSession.taskTitle} — session will be saved & replaced`
                  : `Timing: ${activeSession.taskTitle}`}
              </span>
            </div>
          )}

          {/* Estimate picker (start mode only) */}
          {isStart && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Clock size={12} color="var(--muted)" />
              <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato, sans-serif', fontWeight: 600 }}>Estimate:</span>
              {ESTIMATES.map(e => (
                <button key={e.label} type="button" onClick={() => setEstimateMs(estimateMs === e.ms ? null : e.ms)} style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', cursor: 'pointer', border: `1.5px solid ${estimateMs === e.ms ? accentColor : 'var(--border)'}`, background: estimateMs === e.ms ? `${accentColor}18` : 'transparent', color: estimateMs === e.ms ? accentColor : 'var(--muted)', transition: 'all .12s' }}>
                  {e.label}
                </button>
              ))}
              {estimateMs && <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 2 }}>← click to clear</span>}
            </div>
          )}

          {/* Actual vs estimate result (finish done state) */}
          {!isStart && done && finishResult && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: '#22c55e10', border: '1px solid #22c55e30', marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#16a34a', fontFamily: 'Raleway, sans-serif', marginBottom: 4 }}>✓ Session complete</div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12, fontFamily: 'Lato, sans-serif', color: 'var(--muted)' }}>
                <span>Actual: <strong style={{ color: 'var(--text)' }}>{msToLabel(finishResult.duration)}</strong></span>
                {finishResult.estimate && (
                  <>
                    <span>Estimate: <strong style={{ color: 'var(--text)' }}>{msToLabel(finishResult.estimate)}</strong></span>
                    <span style={{ color: finishResult.duration <= finishResult.estimate ? '#16a34a' : '#f97316', fontWeight: 700 }}>
                      {finishResult.duration <= finishResult.estimate
                        ? `✓ ${msToLabel(finishResult.estimate - finishResult.duration)} under`
                        : `↑ ${msToLabel(finishResult.duration - finishResult.estimate)} over`}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Search — hide in finish done state */}
          {!(done && !isStart) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--faint)' }}>
            <Search size={13} color="var(--muted)" />
            <input
              ref={searchRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search tasks or projects…"
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 13, color: 'var(--text)', fontFamily: 'Lato, sans-serif' }}
              onKeyDown={e => {
                if (e.key === 'Enter') { isStart ? confirmStart() : confirmFinish() }
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  const idx = filtered.findIndex(t => t.id === selectedId)
                  if (filtered[idx + 1]) setSelected(filtered[idx + 1].id)
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  const idx = filtered.findIndex(t => t.id === selectedId)
                  if (filtered[idx - 1]) setSelected(filtered[idx - 1].id)
                }
              }}
            />
          </div>
          )}

          {/* Status filters */}
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {FILTERS.map(f => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                style={{
                  padding: '4px 11px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                  fontFamily: 'Raleway, sans-serif', cursor: 'pointer',
                  border: `1.5px solid ${filter === f.key ? accentColor : 'var(--border)'}`,
                  background: filter === f.key ? `${accentColor}18` : 'transparent',
                  color: filter === f.key ? accentColor : 'var(--muted)',
                  transition: 'all .12s',
                }}
              >
                {f.label}
              </button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato, sans-serif', alignSelf: 'center' }}>
              {filtered.length} task{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Task list */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13, fontFamily: 'Lato, sans-serif' }}>
              No tasks match
            </div>
          ) : filtered.map(task => {
            const isSelected = task.id === selectedId
            const isCurrent  = task.id === activeSession?.taskId
            return (
              <div
                key={task.id}
                onClick={() => setSelected(task.id)}
                onDoubleClick={() => isStart ? confirmStart() : confirmFinish()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '11px 18px',
                  borderBottom: '1px solid var(--faint)',
                  background: isSelected ? `${accentColor}10` : 'transparent',
                  borderLeft: `3px solid ${isSelected ? accentColor : 'transparent'}`,
                  cursor: 'pointer',
                  transition: 'background .1s',
                }}
              >
                {/* Priority dot */}
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_COLOR[task.priority] ?? '#888', flexShrink: 0 }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {task.title}
                    {isCurrent && <span style={{ marginLeft: 8, fontSize: 10, color: accentColor, fontWeight: 800 }}>⏱ running</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato, sans-serif', marginTop: 2 }}>
                    {task.project?.name && <span style={{ color: task.project.color }}>{task.project.name} · </span>}
                    <span style={{ color: STATUS_COLOR[task.status] ?? '#888' }}>{STATUS_LABEL[task.status] ?? task.status}</span>
                    {(() => {
                      const d = task.scheduled_for ?? task.deadline
                      if (!d) return null
                      const label = d < today ? `⚠ overdue (${d})` : d === today ? 'Today' : d === tomorrow ? 'Tomorrow' : d
                      const color = d < today ? '#ef4444' : d === today ? '#3dd6d0' : d === tomorrow ? '#f97316' : 'var(--muted)'
                      return <span style={{ color, marginLeft: 6, fontWeight: d <= tomorrow ? 700 : 400 }}>· {label}</span>
                    })()}
                  </div>
                </div>

                {isSelected && (
                  <span style={{ fontSize: 10, color: accentColor, fontFamily: 'Lato, sans-serif', fontWeight: 700, flexShrink: 0 }}>
                    ↵ confirm
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: 'var(--faint)' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato, sans-serif' }}>
            <kbd style={{ padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 10, background: 'var(--panel)' }}>↑↓</kbd>
            {' '}navigate &nbsp;·&nbsp;
            <kbd style={{ padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 10, background: 'var(--panel)' }}>↵</kbd>
            {' '}confirm &nbsp;·&nbsp;
            <kbd style={{ padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 10, background: 'var(--panel)' }}>Esc</kbd>
            {' '}cancel
          </span>

          <button
            type="button"
            onClick={isStart ? confirmStart : confirmFinish}
            disabled={!selectedId || saving}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 18px', borderRadius: 10, border: 'none',
              background: done ? '#22c55e' : selectedId ? accentColor : 'var(--faint)',
              color: selectedId ? '#fff' : 'var(--muted)',
              fontFamily: 'Raleway, sans-serif', fontWeight: 800, fontSize: 13,
              cursor: selectedId && !saving ? 'pointer' : 'not-allowed',
              transition: 'all .15s',
              opacity: selectedId ? 1 : 0.5,
            }}
          >
            {done
              ? <><CheckCircle2 size={14} /> Done!</>
              : saving ? (isStart ? 'Starting…' : 'Finishing…')
              : isStart
              ? <><Play size={13} fill="#fff" /> {selected ? `Start "${selected.title.slice(0, 24)}${selected.title.length > 24 ? '…' : ''}"` : 'Select a task'}</>
              : <><CheckCircle2 size={13} /> {selected ? `Finish "${selected.title.slice(0, 22)}${selected.title.length > 22 ? '…' : ''}"` : 'Select a task'}</>
            }
          </button>
        </div>
      </div>

      <style>{`
        @keyframes qaFadeIn    { from { opacity: 0 } to { opacity: 1 } }
        @keyframes qaSlideDown { from { opacity: 0; transform: translateY(-10px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
    </div>
  )
}
