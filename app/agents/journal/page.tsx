'use client'
import { useState, useEffect, useCallback } from 'react'
import { Activity, Plus, Flame, Moon, Coffee, Heart, RefreshCw } from 'lucide-react'
import AgentPageLayout from '@/components/agents/AgentPageLayout'

const COLOR = '#0369A1'

interface JournalEntry {
  date: string
  energy_level: number | null
  completed_today: string | null
  blocked_or_pushed: string | null
  tomorrow_focus: string | null
}

interface HealthLog {
  date: string
  log_type: string
  data: Record<string, unknown>
}

const ENERGY_COLORS = ['', '#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e']
const ENERGY_LABELS = ['', 'Drained', 'Low', 'Okay', 'Good', 'Peak']

export default function JournalAgentPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [healthLogs, setHealthLogs] = useState<HealthLog[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeLog, setActiveLog] = useState<'workout' | 'sleep' | 'meal' | null>(null)
  const [logForm, setLogForm] = useState<Record<string, string>>({})
  const [checkinForm, setCheckinForm] = useState({ energy_level: 3, completed_today: '', blocked_or_pushed: '', tomorrow_focus: '' })
  const [savedToday, setSavedToday] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [e, h, today] = await Promise.allSettled([
      fetch('/api/agents/journal?action=get_recent_entries&days=14').then(r => r.json()),
      fetch('/api/agents/journal?action=get_health_logs&days=7').then(r => r.json()),
      fetch('/api/agents/journal?action=get_today_entry').then(r => r.json()),
    ])
    if (e.status === 'fulfilled' && e.value.ok) setEntries(e.value.data ?? [])
    if (h.status === 'fulfilled' && h.value.ok) setHealthLogs(h.value.data ?? [])
    if (today.status === 'fulfilled' && today.value.ok && today.value.data) {
      const d = today.value.data
      setCheckinForm({ energy_level: d.energy_level ?? 3, completed_today: d.completed_today ?? '', blocked_or_pushed: d.blocked_or_pushed ?? '', tomorrow_focus: d.tomorrow_focus ?? '' })
      setSavedToday(true)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function saveCheckin() {
    setSaving(true)
    await fetch('/api/agents/journal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save_entry', params: checkinForm }) })
    setSavedToday(true)
    setSaving(false)
    load()
  }

  async function saveHealthLog() {
    if (!activeLog) return
    setSaving(true)
    const action = activeLog === 'workout' ? 'log_workout' : activeLog === 'sleep' ? 'log_sleep' : 'log_meal'
    await fetch('/api/agents/journal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, params: { ...logForm, date: new Date().toISOString().slice(0, 10) } }) })
    setActiveLog(null)
    setLogForm({})
    setSaving(false)
    load()
  }

  const avgEnergy = entries.length ? (entries.reduce((s, e) => s + (e.energy_level ?? 0), 0) / entries.filter(e => e.energy_level).length).toFixed(1) : '—'
  const checkinStreak = entries.filter(e => e.energy_level !== null).length

  const inp: React.CSSProperties = { padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--panel2)', color: 'var(--text)', fontFamily: 'Lato', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }

  const dashboard = (
    <div style={{ maxWidth: 800 }}>
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Avg Energy (14d)', value: avgEnergy, sub: '/5 scale', color: COLOR },
          { label: 'Check-ins (14d)', value: checkinStreak, sub: 'consecutive days', color: '#059669' },
          { label: 'Health Logs (7d)', value: healthLogs.length, sub: 'workout / sleep / meal', color: '#7c3aed' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--panel)', borderRadius: 14, padding: '16px 18px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: s.color, fontFamily: 'Raleway' }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, fontFamily: 'Lato' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Energy chart (last 14 days) */}
      <div style={{ background: 'var(--panel)', borderRadius: 14, padding: '18px 20px', border: '1px solid var(--border)', marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Energy Trend — Last 14 Days</h3>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
          {Array.from({ length: 14 }).map((_, i) => {
            const date = new Date(Date.now() - (13 - i) * 86400000).toISOString().slice(0, 10)
            const entry = entries.find(e => e.date === date)
            const level = entry?.energy_level ?? 0
            const color = level ? ENERGY_COLORS[level] : 'var(--faint)'
            return (
              <div key={date} title={`${date}: ${level ? ENERGY_LABELS[level] : 'No entry'}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: '100%', height: level ? `${(level / 5) * 64}px` : 8, borderRadius: 4, background: color, transition: 'height .3s', minHeight: 6 }} />
                <span style={{ fontSize: 9, color: 'var(--muted)' }}>{new Date(date + 'T12:00:00').getDate()}</span>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
          {[1,2,3,4,5].map(n => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: ENERGY_COLORS[n] }} />
              <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'Lato' }}>{ENERGY_LABELS[n]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent entries */}
      <div style={{ background: 'var(--panel)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Recent Entries</span>
        </div>
        {loading ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading…</div> :
        entries.slice(0, 5).map(e => (
          <div key={e.date} style={{ padding: '12px 18px', borderBottom: '1px solid var(--faint)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ flexShrink: 0 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: e.energy_level ? ENERGY_COLORS[e.energy_level] + '20' : 'var(--faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${e.energy_level ? ENERGY_COLORS[e.energy_level] + '40' : 'var(--border)'}` }}>
                <span style={{ fontSize: 13, fontWeight: 900, color: e.energy_level ? ENERGY_COLORS[e.energy_level] : 'var(--muted)' }}>{e.energy_level ?? '—'}</span>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 3 }}>{e.date}</div>
              {e.completed_today && <p style={{ margin: '0 0 2px', fontSize: 12, color: 'var(--text)', fontFamily: 'Lato', lineHeight: 1.4 }}>✓ {e.completed_today.slice(0, 100)}</p>}
              {e.blocked_or_pushed && <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato' }}>⚠ {e.blocked_or_pushed.slice(0, 80)}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  const actions = (
    <div style={{ maxWidth: 680 }}>
      {/* Daily check-in */}
      <div style={{ background: 'var(--panel)', borderRadius: 14, padding: 22, border: `1px solid ${savedToday ? '#22c55e40' : 'var(--border)'}`, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Daily Check-in</h3>
          {savedToday && <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', background: '#22c55e10', padding: '3px 10px', borderRadius: 6 }}>✓ Saved today</span>}
        </div>

        {/* Energy selector */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 10 }}>Energy Level</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[1,2,3,4,5].map(n => (
              <button key={n} onClick={() => setCheckinForm(f => ({ ...f, energy_level: n }))} style={{
                flex: 1, padding: '10px 0', borderRadius: 10, border: `2px solid ${checkinForm.energy_level === n ? ENERGY_COLORS[n] : 'var(--border)'}`,
                background: checkinForm.energy_level === n ? ENERGY_COLORS[n] + '20' : 'transparent',
                color: checkinForm.energy_level === n ? ENERGY_COLORS[n] : 'var(--muted)',
                fontFamily: 'Raleway', fontWeight: 800, fontSize: 14, cursor: 'pointer', transition: 'all .15s',
              }}>
                {n}
                <div style={{ fontSize: 9, fontWeight: 600, marginTop: 2 }}>{ENERGY_LABELS[n]}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>What did you complete today?</label>
            <textarea value={checkinForm.completed_today} onChange={e => setCheckinForm(f => ({ ...f, completed_today: e.target.value }))} placeholder="List your wins…" rows={2} style={{ ...inp, resize: 'none' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>Blocked or pushed?</label>
            <textarea value={checkinForm.blocked_or_pushed} onChange={e => setCheckinForm(f => ({ ...f, blocked_or_pushed: e.target.value }))} placeholder="What got in the way…" rows={2} style={{ ...inp, resize: 'none' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>Tomorrow's focus</label>
            <input value={checkinForm.tomorrow_focus} onChange={e => setCheckinForm(f => ({ ...f, tomorrow_focus: e.target.value }))} placeholder="Top priority tomorrow…" style={inp} />
          </div>
          <button onClick={saveCheckin} disabled={saving} style={{
            padding: '11px 0', borderRadius: 10, border: 'none', background: COLOR, color: '#fff',
            fontFamily: 'Raleway', fontWeight: 800, fontSize: 13, cursor: 'pointer',
            opacity: saving ? 0.7 : 1,
          }}>
            {saving ? 'Saving…' : savedToday ? 'Update Check-in' : 'Save Check-in'}
          </button>
        </div>
      </div>

      {/* Quick health logs */}
      <div style={{ background: 'var(--panel)', borderRadius: 14, padding: 22, border: '1px solid var(--border)' }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Log Health</h3>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          {[
            { key: 'workout' as const, label: 'Workout', icon: Flame, color: '#f97316' },
            { key: 'sleep' as const, label: 'Sleep', icon: Moon, color: '#6366f1' },
            { key: 'meal' as const, label: 'Meal', icon: Coffee, color: '#0369A1' },
          ].map(item => (
            <button key={item.key} onClick={() => setActiveLog(activeLog === item.key ? null : item.key)} style={{
              flex: 1, padding: '10px 0', borderRadius: 10, border: `1.5px solid ${activeLog === item.key ? item.color : 'var(--border)'}`,
              background: activeLog === item.key ? item.color + '12' : 'transparent',
              color: activeLog === item.key ? item.color : 'var(--muted)',
              fontFamily: 'Raleway', fontWeight: 700, fontSize: 12, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all .15s',
            }}>
              <item.icon size={14} />{item.label}
            </button>
          ))}
        </div>

        {activeLog === 'workout' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input placeholder="Type (e.g. Run, Gym, Swim)" value={logForm.type ?? ''} onChange={e => setLogForm(f => ({ ...f, type: e.target.value }))} style={inp} />
            <input placeholder="Duration (minutes)" type="number" value={logForm.duration_min ?? ''} onChange={e => setLogForm(f => ({ ...f, duration_min: e.target.value }))} style={inp} />
            <input placeholder="Notes (optional)" value={logForm.notes ?? ''} onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))} style={inp} />
          </div>
        )}
        {activeLog === 'sleep' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input placeholder="Hours slept" type="number" step="0.5" value={logForm.hours ?? ''} onChange={e => setLogForm(f => ({ ...f, hours: e.target.value }))} style={inp} />
            <div>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Quality (1-5)</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {[1,2,3,4,5].map(n => <button key={n} onClick={() => setLogForm(f => ({ ...f, quality: String(n) }))} style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: `1.5px solid ${logForm.quality === String(n) ? '#6366f1' : 'var(--border)'}`, background: logForm.quality === String(n) ? '#6366f110' : 'transparent', color: logForm.quality === String(n) ? '#6366f1' : 'var(--muted)', fontFamily: 'Raleway', fontWeight: 700, cursor: 'pointer' }}>{n}</button>)}
              </div>
            </div>
          </div>
        )}
        {activeLog === 'meal' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <select value={logForm.meal ?? 'lunch'} onChange={e => setLogForm(f => ({ ...f, meal: e.target.value }))} style={{ ...inp }}>
              {['breakfast','lunch','dinner','snack'].map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
            </select>
            <input placeholder="What did you eat?" value={logForm.description ?? ''} onChange={e => setLogForm(f => ({ ...f, description: e.target.value }))} style={inp} />
          </div>
        )}

        {activeLog && (
          <button onClick={saveHealthLog} disabled={saving} style={{ width: '100%', marginTop: 12, padding: '10px 0', borderRadius: 10, border: 'none', background: COLOR, color: '#fff', fontFamily: 'Raleway', fontWeight: 800, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Logging…' : `Log ${activeLog.charAt(0).toUpperCase() + activeLog.slice(1)}`}
          </button>
        )}
      </div>
    </div>
  )

  const commandCenter = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>Today energy</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: checkinForm.energy_level ? ENERGY_COLORS[checkinForm.energy_level] : 'var(--muted)' }}>
          {savedToday ? `${checkinForm.energy_level}/5 — ${ENERGY_LABELS[checkinForm.energy_level]}` : 'Not logged'}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>14-day avg</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)' }}>{avgEnergy}/5</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>Check-ins</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)' }}>{checkinStreak} of 14 days</span>
      </div>
    </div>
  )

  return (
    <AgentPageLayout
      agentId="journal"
      agentName="Journal & Health"
      agentColor={COLOR}
      agentIcon={<Activity size={20} />}
      description="Daily reflection, energy tracking & health logs · 100% local"
      tabs={['dashboard', 'actions', 'chat', 'settings']}
      starters={['How was my energy this week?', 'What patterns do you see in my journal?', 'How many days did I check in this month?', 'Analyse my sleep and energy correlation']}
      dashboard={dashboard}
      actions={actions}
      commandCenter={commandCenter}
      settings={<div style={{ padding: 20, color: 'var(--muted)', fontFamily: 'Lato', fontSize: 13 }}>Journal settings coming soon.</div>}
    />
  )
}
