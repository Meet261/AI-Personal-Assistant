// Shared timer state helpers — used by both the Timer page and the quick-action overlays.
// State is stored in localStorage; cross-component sync is via a 'timer:update' CustomEvent.

export interface ActiveSession {
  taskId: string | null
  taskTitle: string
  projectName: string
  start: number                        // epoch ms
  pauses: { from: number; to: number }[]
  isPaused: boolean
  pausedAt: number | null
  estimateMs?: number | null           // user-provided estimate in ms
}

export interface TimeSession {
  id: string
  taskId: string | null
  taskTitle: string
  projectName: string
  start: number
  end: number
  duration: number                     // ms
  date: string                         // YYYY-MM-DD
  estimateMs?: number | null           // estimate set at session start
}

export function loadSessions(): TimeSession[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('time_sessions') || '[]') } catch { return [] }
}

export function saveSessions(s: TimeSession[]) {
  localStorage.setItem('time_sessions', JSON.stringify(s))
}

export function loadActive(): ActiveSession | null {
  if (typeof window === 'undefined') return null
  try {
    const v = localStorage.getItem('active_session')
    return v ? JSON.parse(v) : null
  } catch { return null }
}

export function saveActive(s: ActiveSession | null) {
  if (s) localStorage.setItem('active_session', JSON.stringify(s))
  else localStorage.removeItem('active_session')
}

export function netElapsed(active: ActiveSession, now: number): number {
  let paused = active.pauses.reduce((acc, p) => acc + (p.to - p.from), 0)
  if (active.isPaused && active.pausedAt) paused += now - active.pausedAt
  return now - active.start - paused
}

export function timerUid() { return Math.random().toString(36).slice(2) }

/** Commit the active session to the history log and clear it. Returns the saved session or null if too short. */
export function commitSession(active: ActiveSession): TimeSession | null {
  const now = Date.now()
  const duration = netElapsed(active, now)
  if (duration < 5000) return null

  const session: TimeSession = {
    id: timerUid(),
    taskId: active.taskId,
    taskTitle: active.taskTitle,
    projectName: active.projectName,
    start: active.start,
    end: now,
    duration,
    date: new Date().toISOString().slice(0, 10),
    estimateMs: active.estimateMs ?? null,
  }
  saveSessions([session, ...loadSessions()])
  saveActive(null)
  return session
}

/** Start a new session, committing any existing one first. */
export function startSession(taskId: string | null, taskTitle: string, projectName: string, estimateMs?: number | null): ActiveSession {
  const existing = loadActive()
  if (existing) commitSession(existing)

  const session: ActiveSession = {
    taskId, taskTitle, projectName,
    start: Date.now(),
    pauses: [],
    isPaused: false,
    pausedAt: null,
    estimateMs: estimateMs ?? null,
  }
  saveActive(session)
  return session
}

/** Notify all components on this page that timer state has changed. */
export function dispatchTimerUpdate() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('timer:update'))
  }
}
