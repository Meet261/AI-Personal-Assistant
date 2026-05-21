'use client'
import { useState, useEffect } from 'react'
import { CheckCircle2, Clock, BookOpen, TrendingUp, Flame, RefreshCw, ChevronDown, ChevronUp, Star } from 'lucide-react'
import { format, startOfWeek, endOfWeek, eachDayOfInterval, subWeeks } from 'date-fns'
import { loadSessions } from '@/lib/timer'

interface Task { id: string; title: string; status: string; priority: string; completed_at: string | null; created_at?: string; project?: { name: string; color: string } | null }
interface JournalEntry { date: string; energy_level: number | null; completed_today: string; blocked_or_pushed: string; tomorrow_focus?: string }
interface HabitSummary { total_habits: number; completion_rate: number; best_streak: number; habits: { name: string; streak: number; done_today: boolean; completed_count: number }[] }
interface HabitGridRow { id: string; name: string; color: string; days: { date: string; done: boolean }[] }
interface TradeSummary { total_pnl: number; today_pnl: number; wins: number; losses: number; win_rate: number }
interface Paper { id: string; title: string; dissertation_relevance: number | null; reading_status: string; updated_at: string }

const PRIORITY_COLOR: Record<string, string> = { urgent: '#ff5c7a', high: '#ffcc66', medium: '#3dd6d0', low: '#27d98a' }

function Section({ title, icon: Icon, color, count, children }: { title: string; icon: React.ElementType; color: string; count?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div style={{ background: 'var(--panel)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 16 }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: open ? '1px solid var(--border)' : 'none' }}>
        <Icon size={16} color={color} />
        <span style={{ fontFamily: 'Raleway', fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>{title}</span>
        {count !== undefined && <span style={{ padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: `${color}18`, color }}>{count}</span>}
        <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</span>
      </button>
      {open && <div style={{ padding: '16px 20px' }}>{children}</div>}
    </div>
  )
}

function Stat({ label, value, color = 'var(--text)', sub }: { label: string; value: string | number; color?: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--faint)', borderRadius: 12, padding: '14px 16px', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color, fontFamily: 'Raleway' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, fontFamily: 'Lato' }}>{sub}</div>}
    </div>
  )
}

function msToHours(ms: number) {
  const h = ms / 3600000
  return h >= 1 ? `${h.toFixed(1)}h` : `${Math.round(ms / 60000)}m`
}

export default function WeeklyReviewPage() {
  const [weekOffset, setWeekOffset] = useState(0)  // 0 = this week, -1 = last week
  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState<Task[]>([])
  const [journal, setJournal] = useState<JournalEntry[]>([])
  const [habits, setHabits] = useState<HabitSummary | null>(null)
  const [habitGrid, setHabitGrid] = useState<HabitGridRow[]>([])
  const [trading, setTrading] = useState<TradeSummary | null>(null)
  const [papers, setPapers] = useState<Paper[]>([])
  const [timerSessions, setTimerSessions] = useState<ReturnType<typeof loadSessions>>([])

  const weekStart = startOfWeek(subWeeks(new Date(), -weekOffset), { weekStartsOn: 1 })
  const weekEnd   = endOfWeek(weekStart, { weekStartsOn: 1 })
  const weekLabel = `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`
  const wsStr = format(weekStart, 'yyyy-MM-dd')
  const weStr = format(weekEnd, 'yyyy-MM-dd')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [tasksRes, journalRes, habitsRes, habitGridRes, tradingRes, papersRes] = await Promise.allSettled([
        fetch('/api/tasks').then(r => r.json()),
        fetch('/api/journal').then(r => r.json()),
        fetch('/api/agents/habit?action=get_weekly_summary').then(r => r.json()),
        fetch('/api/agents/habit?action=get_grid').then(r => r.json()),
        fetch('/api/trading/summary').then(r => r.json()),
        fetch('/api/research/papers').then(r => r.json()),
      ])
      if (tasksRes.status === 'fulfilled')     setTasks(tasksRes.value ?? [])
      if (journalRes.status === 'fulfilled')   setJournal(journalRes.value ?? [])
      if (habitsRes.status === 'fulfilled')    setHabits(habitsRes.value?.data ?? null)
      if (habitGridRes.status === 'fulfilled') setHabitGrid(habitGridRes.value?.data?.grid ?? [])
      if (tradingRes.status === 'fulfilled')   setTrading(tradingRes.value ?? null)
      if (papersRes.status === 'fulfilled')    setPapers(papersRes.value ?? [])
      setTimerSessions(loadSessions())
      setLoading(false)
    }
    load()
  }, [weekOffset])

  // ── Derived data ───────────────────────────────────────────────────────────
  const completedTasks = tasks.filter(t =>
    t.status === 'done' && t.completed_at && t.completed_at.slice(0, 10) >= wsStr && t.completed_at.slice(0, 10) <= weStr
  )
  const openedTasks = tasks.filter(t =>
    t.created_at && t.created_at.slice(0, 10) >= wsStr && t.created_at.slice(0, 10) <= weStr
  )

  const weekJournal = journal.filter(j => j.date >= wsStr && j.date <= weStr)
  const energyEntries = weekJournal.filter(j => j.energy_level)
  const avgEnergy = energyEntries.length
    ? (energyEntries.reduce((s, j) => s + (j.energy_level ?? 0), 0) / energyEntries.length).toFixed(1)
    : '—'

  const weekSessions = timerSessions.filter(s => s.date >= wsStr && s.date <= weStr)
  const totalTime = weekSessions.reduce((s, x) => s + x.duration, 0)

  // Time by project
  const timeByProject: Record<string, { name: string; ms: number }> = {}
  for (const s of weekSessions) {
    const key = s.projectName || 'Untracked'
    if (!timeByProject[key]) timeByProject[key] = { name: key, ms: 0 }
    timeByProject[key].ms += s.duration
  }
  const projectTime = Object.values(timeByProject).sort((a, b) => b.ms - a.ms)

  const papersRead = papers.filter(p =>
    (p.reading_status === 'read' || p.reading_status === 'reading') &&
    p.updated_at?.slice(0, 10) >= wsStr
  )
  const papersDigested = papers.filter(p => p.updated_at?.slice(0, 10) >= wsStr && p.updated_at.slice(0, 10) <= weStr)

  // Task breakdown by project
  const tasksByProject: Record<string, { name: string; color: string; tasks: Task[] }> = {}
  for (const t of completedTasks) {
    const key = t.project?.name ?? 'No project'
    if (!tasksByProject[key]) tasksByProject[key] = { name: key, color: t.project?.color ?? '#6b7280', tasks: [] }
    tasksByProject[key].tasks.push(t)
  }

  if (loading) return (
    <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)', fontFamily: 'Lato' }}>
      <RefreshCw size={24} style={{ animation: 'spin .8s linear infinite', marginBottom: 12 }} />
      <div>Loading weekly review…</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ padding: '28px 32px', maxWidth: 860, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: 'var(--text)', fontFamily: 'Raleway' }}>Weekly Review</h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--muted)', fontFamily: 'Lato' }}>{weekLabel}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => setWeekOffset(o => o - 1)} style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'Raleway', fontWeight: 700, fontSize: 12 }}>← Prev</button>
          {weekOffset < 0 && <button type="button" onClick={() => setWeekOffset(o => o + 1)} style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'Raleway', fontWeight: 700, fontSize: 12 }}>Next →</button>}
          {weekOffset !== 0 && <button type="button" onClick={() => setWeekOffset(0)} style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--faint)', color: '#3dd6d0', cursor: 'pointer', fontFamily: 'Raleway', fontWeight: 700, fontSize: 12 }}>This week</button>}
        </div>
      </div>

      {/* Headline stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
        <Stat label="Tasks done" value={completedTasks.length} color="#22c55e" sub={`${openedTasks.length} opened`} />
        <Stat label="Time tracked" value={totalTime > 0 ? msToHours(totalTime) : '—'} color="#3dd6d0" sub={`${weekSessions.length} sessions`} />
        <Stat label="Avg energy" value={avgEnergy} color="#f59e0b" sub={`${weekJournal.length} journal days`} />
        <Stat label="Habit rate" value={habits ? `${habits.completion_rate}%` : '—'} color="#a855f7" sub={`${habits?.total_habits ?? 0} habits`} />
        <Stat label="Trading P&L" value={trading ? `${trading.total_pnl >= 0 ? '+' : ''}$${trading.total_pnl.toFixed(0)}` : '—'} color={trading && trading.total_pnl >= 0 ? '#22c55e' : '#ef4444'} sub={trading ? `${trading.win_rate}% win rate` : ''} />
      </div>

      {/* Tasks section */}
      <Section title="Tasks Completed" icon={CheckCircle2} color="#22c55e" count={completedTasks.length}>
        {completedTasks.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontFamily: 'Lato', fontSize: 13, margin: 0 }}>No tasks completed this week.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.values(tasksByProject).map(({ name, color, tasks: ptasks }) => (
              <div key={name}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{name} ({ptasks.length})</span>
                </div>
                {ptasks.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, background: 'var(--faint)', marginBottom: 4 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[t.priority] ?? '#888', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>{t.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato', flexShrink: 0 }}>{t.completed_at?.slice(0, 10)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Time tracked section */}
      <Section title="Time Tracked" icon={Clock} color="#3dd6d0" count={weekSessions.length > 0 ? weekSessions.length : undefined}>
        {weekSessions.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontFamily: 'Lato', fontSize: 13, margin: 0 }}>No timer sessions recorded this week. Use Ctrl+S to start timing tasks.</p>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {projectTime.map(({ name, ms }) => {
                const pct = Math.round((ms / totalTime) * 100)
                return (
                  <div key={name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{name}</span>
                      <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato' }}>{msToHours(ms)} · {pct}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--faint)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: '#3dd6d0', borderRadius: 3 }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
              {eachDayOfInterval({ start: weekStart, end: weekEnd }).map(day => {
                const ds = format(day, 'yyyy-MM-dd')
                const dayMs = weekSessions.filter(s => s.date === ds).reduce((s, x) => s + x.duration, 0)
                const h = dayMs / 3600000
                return (
                  <div key={ds} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 4, fontFamily: 'Lato' }}>{format(day, 'EEE')}</div>
                    <div style={{ height: 40, borderRadius: 6, background: dayMs > 0 ? `rgba(61,214,208,${Math.min(1, h / 4)})` : 'var(--faint)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: dayMs > 0 ? '#0f766e' : 'var(--muted)' }}>{dayMs > 0 ? msToHours(dayMs) : '—'}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </Section>

      {/* Habits section */}
      <Section title="Habits" icon={Flame} color="#a855f7">
        {!habits ? (
          <p style={{ color: 'var(--muted)', fontFamily: 'Lato', fontSize: 13, margin: 0 }}>No habit data.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
              <Stat label="Completion rate" value={`${habits.completion_rate}%`} color="#a855f7" />
              <Stat label="Best streak" value={`${habits.best_streak}d`} color="#a855f7" />
              <Stat label="Active habits" value={habits.total_habits} />
            </div>
            {habits.habits.map(h => (
              <div key={h.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 9, background: 'var(--faint)' }}>
                <Flame size={13} color="#a855f7" />
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{h.name}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato' }}>{h.completed_count}/7 days</span>
                {h.streak > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#a855f7' }}>{h.streak}🔥</span>}
              </div>
            ))}

            {/* Habit ↔ Task correlation */}
            {(() => {
              if (habitGrid.length === 0 || completedTasks.length === 0) return null

              // Build a map: date → { habitsCompleted, tasksCompleted }
              const dayMap: Record<string, { habitsDone: number; tasksDone: number }> = {}
              for (const row of habitGrid) {
                for (const day of row.days) {
                  if (!dayMap[day.date]) dayMap[day.date] = { habitsDone: 0, tasksDone: 0 }
                  if (day.done) dayMap[day.date].habitsDone++
                }
              }
              for (const t of tasks) {
                if (t.completed_at) {
                  const d = t.completed_at.slice(0, 10)
                  if (!dayMap[d]) dayMap[d] = { habitsDone: 0, tasksDone: 0 }
                  dayMap[d].tasksDone++
                }
              }

              const days = Object.values(dayMap).filter(d => d.habitsDone > 0 || d.tasksDone > 0)
              if (days.length < 3) return null

              const withHabits    = days.filter(d => d.habitsDone > 0)
              const withoutHabits = days.filter(d => d.habitsDone === 0)
              if (withHabits.length === 0 || withoutHabits.length === 0) return null

              const avgWith    = (withHabits.reduce((s, d) => s + d.tasksDone, 0) / withHabits.length).toFixed(1)
              const avgWithout = (withoutHabits.reduce((s, d) => s + d.tasksDone, 0) / withoutHabits.length).toFixed(1)
              const diff = parseFloat(avgWith) - parseFloat(avgWithout)

              return (
                <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 10, background: diff > 0 ? '#a855f710' : 'var(--faint)', border: `1px solid ${diff > 0 ? '#a855f730' : 'var(--border)'}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Habit ↔ Task Correlation</div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 13, fontFamily: 'Lato' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#a855f7', fontSize: 20, fontFamily: 'Raleway' }}>{avgWith}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 11 }}>tasks/day with habits</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--muted)', fontSize: 20, fontFamily: 'Raleway' }}>{avgWithout}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 11 }}>tasks/day without habits</div>
                    </div>
                    <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, color: diff > 0 ? '#22c55e' : '#f97316', fontSize: 16, fontFamily: 'Raleway' }}>
                        {diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)} tasks
                      </div>
                      <div style={{ color: 'var(--muted)', fontSize: 11 }}>difference on habit days</div>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        )}
      </Section>

      {/* Research section */}
      <Section title="Research" icon={BookOpen} color="#7C3AED" count={papersDigested.length > 0 ? papersDigested.length : undefined}>
        {papersDigested.length === 0 && papersRead.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontFamily: 'Lato', fontSize: 13, margin: 0 }}>No papers digested or read this week.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {papersRead.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Started / Read ({papersRead.length})</div>
                {papersRead.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, background: 'var(--faint)' }}>
                    <BookOpen size={12} color="#7C3AED" />
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{p.title}</span>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {[1,2,3,4,5].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i <= (p.dissertation_relevance ?? 0) ? '#7C3AED' : 'var(--border)' }} />)}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </Section>

      {/* Trading section */}
      <Section title="Trading" icon={TrendingUp} color="#B45309">
        {!trading ? (
          <p style={{ color: 'var(--muted)', fontFamily: 'Lato', fontSize: 13, margin: 0 }}>No trading data.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            <Stat label="Total P&L" value={`${trading.total_pnl >= 0 ? '+' : ''}$${trading.total_pnl.toFixed(2)}`} color={trading.total_pnl >= 0 ? '#22c55e' : '#ef4444'} />
            <Stat label="Win rate" value={`${trading.win_rate}%`} color="#B45309" />
            <Stat label="Wins" value={trading.wins} color="#22c55e" />
            <Stat label="Losses" value={trading.losses} color="#ef4444" />
          </div>
        )}
      </Section>

      {/* Journal section */}
      <Section title="Journal" icon={Star} color="#f59e0b" count={weekJournal.length > 0 ? weekJournal.length : undefined}>
        {weekJournal.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontFamily: 'Lato', fontSize: 13, margin: 0 }}>No journal entries this week.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {weekJournal.sort((a, b) => b.date.localeCompare(a.date)).map(entry => (
              <div key={entry.date} style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--faint)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', fontFamily: 'Raleway' }}>{format(new Date(entry.date + 'T12:00:00'), 'EEEE, MMM d')}</span>
                  {entry.energy_level && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, background: '#f59e0b18', color: '#b45309', fontWeight: 700 }}>⚡ {entry.energy_level}/5</span>
                  )}
                </div>
                {entry.completed_today && <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato', lineHeight: 1.5 }}><strong>Done:</strong> {entry.completed_today.slice(0, 120)}{entry.completed_today.length > 120 ? '…' : ''}</p>}
                {entry.tomorrow_focus && <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato' }}><strong>Focus:</strong> {entry.tomorrow_focus.slice(0, 80)}</p>}
              </div>
            ))}
          </div>
        )}
      </Section>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
