'use client'
import { useState, useEffect, useCallback } from 'react'
import { Activity, RefreshCw, ChevronRight, CheckCircle2, XCircle, Clock, Zap } from 'lucide-react'

const S = { fontFamily: 'Raleway, sans-serif' }

interface IntentLog {
  id: string
  user_message: string
  primary_agent: string
  secondary_agents: string[]
  confidence: number
  reason: string
  tool_actions: string[]
  tool_results_ok: boolean[]
  reply_length: number
  duration_ms: number
  created_at: string
}

const AGENT_COLORS: Record<string, string> = {
  assistant: '#0F766E', research: '#7C3AED', trading: '#B45309',
  journal: '#0369A1', scheduler: '#6D28D9', knowledge: '#1D4ED8',
  'paper-digester': '#9D174D', 'habit-tracker': '#065F46', memory: '#374151', email: '#DC2626',
}

export default function RoutingTracePage() {
  const [logs, setLogs] = useState<IntentLog[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<IntentLog | null>(null)
  const [filter, setFilter] = useState<string>('all')

  const load = useCallback(async () => {
    setLoading(true)
    // Fetch directly from Supabase via API
    const res = await fetch('/api/agents/trace')
    if (res.ok) {
      const data = await res.json()
      setLogs(data.logs ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const agents = ['all', ...Array.from(new Set(logs.map(l => l.primary_agent))).sort()]
  const filtered = filter === 'all' ? logs : logs.filter(l => l.primary_agent === filter)

  const avgDuration = logs.length ? Math.round(logs.reduce((s, l) => s + (l.duration_ms ?? 0), 0) / logs.length) : 0
  const toolCallRate = logs.length ? Math.round(logs.filter(l => l.tool_actions?.length > 0).length / logs.length * 100) : 0
  const failRate = logs.length ? Math.round(logs.filter(l => l.tool_results_ok?.some(ok => !ok)).length / logs.length * 100) : 0

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', ...S }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 32px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Activity size={20} color="#6D28D9" /> Routing Trace
            </h1>
            <p style={{ margin: '5px 0 0', fontSize: 13, color: 'var(--muted)', fontFamily: 'Lato' }}>
              Every orchestrator request — routing decisions, tool calls, timing
            </p>
          </div>
          <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'Raleway', fontWeight: 700, fontSize: 12 }}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Total Requests', value: logs.length, color: '#6D28D9' },
            { label: 'Avg Duration', value: `${(avgDuration / 1000).toFixed(1)}s`, color: '#0369A1' },
            { label: 'Tool Call Rate', value: `${toolCallRate}%`, color: '#0F766E' },
            { label: 'Error Rate', value: `${failRate}%`, color: failRate > 10 ? '#ef4444' : '#22c55e' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--panel)', borderRadius: 14, padding: '16px 18px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: s.color, fontFamily: 'Raleway' }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filter */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {agents.map(a => (
            <button key={a} onClick={() => setFilter(a)} style={{
              padding: '5px 12px', borderRadius: 8, border: `1px solid ${filter === a ? (AGENT_COLORS[a] ?? '#6D28D9') + '60' : 'var(--border)'}`,
              background: filter === a ? `${AGENT_COLORS[a] ?? '#6D28D9'}10` : 'var(--faint)',
              color: filter === a ? (AGENT_COLORS[a] ?? '#6D28D9') : 'var(--muted)',
              fontFamily: 'Raleway', fontWeight: 700, fontSize: 11, cursor: 'pointer', textTransform: 'capitalize',
            }}>{a}</button>
          ))}
        </div>

        {/* Log table + detail */}
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 360px' : '1fr', gap: 16 }}>
          {/* Log list */}
          <div style={{ background: 'var(--panel)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 100px 60px 80px 60px', gap: 12 }}>
              {['Message', 'Agent', 'Conf', 'Duration', 'Tools'].map(h => (
                <span key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</span>
              ))}
            </div>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontFamily: 'Lato' }}>Loading trace…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontFamily: 'Lato' }}>No requests yet. Chat with any agent to see traces here.</div>
            ) : (
              filtered.slice(0, 50).map(log => {
                const color = AGENT_COLORS[log.primary_agent] ?? '#94a3b8'
                const hasError = log.tool_results_ok?.some(ok => !ok)
                const isSelected = selected?.id === log.id
                return (
                  <div key={log.id} onClick={() => setSelected(isSelected ? null : log)} style={{
                    padding: '11px 18px', borderBottom: '1px solid var(--faint)', cursor: 'pointer',
                    background: isSelected ? `${color}08` : 'transparent', transition: 'background .1s',
                    display: 'grid', gridTemplateColumns: '1fr 100px 60px 80px 60px', gap: 12, alignItems: 'center',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--faint)' }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.user_message?.slice(0, 60)}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, fontFamily: 'Lato' }}>
                        {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.primary_agent}</span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>
                      {log.confidence ? `${Math.round(log.confidence * 100)}%` : '—'}
                    </span>
                    <span style={{ fontSize: 11, color: (log.duration_ms ?? 0) > 30000 ? '#f97316' : 'var(--muted)', fontFamily: 'Lato', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={10} />{log.duration_ms ? `${(log.duration_ms / 1000).toFixed(1)}s` : '—'}
                    </span>
                    <span style={{ fontSize: 11, color: hasError ? '#ef4444' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                      {hasError ? <XCircle size={12} color="#ef4444" /> : log.tool_actions?.length > 0 ? <CheckCircle2 size={12} color="#22c55e" /> : null}
                      {log.tool_actions?.length ?? 0}
                    </span>
                  </div>
                )
              })
            )}
          </div>

          {/* Detail panel */}
          {selected && (
            <div style={{ background: 'var(--panel)', borderRadius: 14, border: '1px solid var(--border)', padding: 20, height: 'fit-content' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Request Detail</span>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18, lineHeight: 1 }}>×</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Message</div>
                  <div style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'Lato', lineHeight: 1.5, background: 'var(--faint)', padding: '8px 10px', borderRadius: 8 }}>{selected.user_message}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { label: 'Agent', value: selected.primary_agent, color: AGENT_COLORS[selected.primary_agent] },
                    { label: 'Confidence', value: selected.confidence ? `${Math.round(selected.confidence * 100)}%` : '—' },
                    { label: 'Duration', value: selected.duration_ms ? `${(selected.duration_ms / 1000).toFixed(2)}s` : '—' },
                    { label: 'Reply length', value: selected.reply_length ? `${selected.reply_length} chars` : '—' },
                  ].map(item => (
                    <div key={item.label}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{item.label}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: (item as {color?: string}).color ?? 'var(--text)', textTransform: 'capitalize' }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                {selected.reason && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Routing Reason</div>
                    <div style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'Lato' }}>{selected.reason}</div>
                  </div>
                )}

                {selected.secondary_agents?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Secondary Agents</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {selected.secondary_agents.map(a => (
                        <span key={a} style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: `${AGENT_COLORS[a] ?? '#94a3b8'}15`, color: AGENT_COLORS[a] ?? '#94a3b8' }}>{a}</span>
                      ))}
                    </div>
                  </div>
                )}

                {selected.tool_actions?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Tool Calls</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {selected.tool_actions.map((action, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px', borderRadius: 7, background: 'var(--faint)', fontSize: 11, fontFamily: 'monospace' }}>
                          {selected.tool_results_ok?.[i] !== false
                            ? <CheckCircle2 size={11} color="#22c55e" />
                            : <XCircle size={11} color="#ef4444" />}
                          <span style={{ color: 'var(--text)' }}>{action}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
