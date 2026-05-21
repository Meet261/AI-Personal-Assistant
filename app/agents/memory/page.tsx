'use client'
import { useState, useEffect, useCallback } from 'react'
import { Brain, Plus, Trash2, Search, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react'
import AgentPageLayout from '@/components/agents/AgentPageLayout'

const COLOR = '#374151'

interface MemoryFact { agent_id: string; key: string; value: string; updated: string }
interface GroupedMemory { agent: string; facts: MemoryFact[] }
interface AuditFact { agent_id: string; key: string; value: string; created_at: string; updated_at: string; days_since_update: number; days_since_create: number; stale: boolean }

const AGENT_COLORS: Record<string, string> = {
  memory: '#374151', assistant: '#0F766E', trading: '#B45309', research: '#7C3AED',
  journal: '#0369A1', scheduler: '#6D28D9', 'habit-tracker': '#065F46', email: '#DC2626',
}

export default function MemoryAgentPage() {
  const [grouped, setGrouped] = useState<GroupedMemory[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newVal, setNewVal] = useState('')
  const [saving, setSaving] = useState(false)
  const [auditFacts, setAuditFacts] = useState<AuditFact[]>([])
  const [auditLoading, setAuditLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/agents/memory')
    const data = await res.json()
    if (data.ok && data.data && typeof data.data === 'object') {
      const groups = Object.entries(data.data).map(([agent, facts]) => ({
        agent,
        facts: (facts as { key: string; value: string }[]).map(f => ({ agent_id: agent, key: f.key, value: f.value, updated: '' })),
      }))
      setGrouped(groups)
    }
    setLoading(false)
  }, [])

  const loadAudit = useCallback(async () => {
    setAuditLoading(true)
    const res = await fetch('/api/agents/memory', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_audit', params: {} }),
    })
    const data = await res.json()
    setAuditFacts(data.data ?? [])
    setAuditLoading(false)
  }, [])

  useEffect(() => { load(); loadAudit() }, [load, loadAudit])

  async function addFact() {
    if (!newKey.trim() || !newVal.trim()) return
    setSaving(true)
    const key = newKey.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    await fetch('/api/agents/memory', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', params: { key, value: newVal.trim(), agent_id: 'memory' } }),
    })
    setNewKey(''); setNewVal(''); setAdding(false)
    setSaving(false)
    load()
  }

  async function forgetFact(key: string, agentId: string) {
    await fetch('/api/agents/memory', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'forget', params: { key, agent_id: agentId } }),
    })
    load()
  }

  const filteredGroups = grouped.map(g => ({
    ...g,
    facts: g.facts.filter(f => !search || f.key.includes(search.toLowerCase()) || f.value.toLowerCase().includes(search.toLowerCase())),
  })).filter(g => g.facts.length > 0)

  const totalFacts = grouped.reduce((s, g) => s + g.facts.length, 0)

  const inp: React.CSSProperties = { padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--panel2)', color: 'var(--text)', fontFamily: 'Lato', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }

  const dashboard = (
    <div style={{ maxWidth: 760 }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 22 }}>
        <div style={{ background: 'var(--panel)', borderRadius: 14, padding: '16px 18px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Total Facts</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: COLOR }}>{totalFacts}</div>
        </div>
        <div style={{ background: 'var(--panel)', borderRadius: 14, padding: '16px 18px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Agents with Memory</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: COLOR }}>{grouped.length}</div>
        </div>
        <div style={{ background: 'var(--panel)', borderRadius: 14, padding: '16px 18px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Auto-extracted</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)', fontFamily: 'Lato', marginTop: 6 }}>Every 4 messages</div>
        </div>
      </div>

      {/* Search + add */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search memories…" style={{ ...inp, paddingLeft: 34 }} />
        </div>
        <button onClick={() => setAdding(a => !a)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, border: `1px solid ${COLOR}30`, background: `${COLOR}08`, color: COLOR, fontFamily: 'Raleway', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
          <Plus size={13} /> Add Fact
        </button>
        <button onClick={load} style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--muted)', cursor: 'pointer' }}>
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div style={{ background: 'var(--panel)', borderRadius: 12, padding: 16, border: '1px solid var(--border)', marginBottom: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="Key (e.g. dissertation_topic)" style={inp} />
            <input value={newVal} onChange={e => setNewVal(e.target.value)} placeholder="Value (e.g. representativeness in music recommendation)" style={inp} onKeyDown={e => e.key === 'Enter' && addFact()} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addFact} disabled={saving || !newKey.trim() || !newVal.trim()} style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', background: COLOR, color: '#fff', fontFamily: 'Raleway', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : 'Save Fact'}
              </button>
              <button onClick={() => { setAdding(false); setNewKey(''); setNewVal('') }} style={{ padding: '9px 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--muted)', fontFamily: 'Raleway', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Memory groups */}
      {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading memories…</div> :
        filteredGroups.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontFamily: 'Lato' }}>{search ? 'No memories match your search' : 'No memories yet. Chat with any agent to build memory.'}</div> :
        filteredGroups.map(group => {
          const color = AGENT_COLORS[group.agent] || '#94a3b8'
          return (
            <div key={group.agent} style={{ background: 'var(--panel)', borderRadius: 14, border: '1px solid var(--border)', marginBottom: 14, overflow: 'hidden' }}>
              <div style={{ padding: '12px 18px', background: `${color}08`, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                <span style={{ fontSize: 12, fontWeight: 800, color, textTransform: 'capitalize' }}>{group.agent}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>{group.facts.length} facts</span>
              </div>
              {group.facts.map((fact, i) => (
                <div key={fact.key} style={{ padding: '11px 18px', borderBottom: i < group.facts.length - 1 ? '1px solid var(--faint)' : 'none', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', fontFamily: 'monospace', marginBottom: 3 }}>{fact.key}</div>
                    <div style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'Lato', lineHeight: 1.4 }}>{fact.value}</div>
                  </div>
                  <button onClick={() => forgetFact(fact.key, fact.agent_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, borderRadius: 6, flexShrink: 0 }}
                    onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'}
                    onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--muted)'}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )
        })
      }
    </div>
  )

  // ── Audit tab ─────────────────────────────────────────────────────────────
  const staleFacts = auditFacts.filter(f => f.stale)
  const freshFacts = auditFacts.filter(f => !f.stale)

  const audit = (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: 'var(--text)', fontFamily: 'Raleway' }}>Memory Audit</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)', fontFamily: 'Lato' }}>
            {auditFacts.length} facts · {staleFacts.length} stale (not updated in 30+ days) · sorted oldest first
          </p>
        </div>
        <button onClick={loadAudit} style={{ padding: '7px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--muted)', cursor: 'pointer', lineHeight: 0 }}>
          <RefreshCw size={13} />
        </button>
      </div>

      {auditLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontFamily: 'Lato' }}>Loading audit…</div>
      ) : (
        <>
          {staleFacts.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <AlertTriangle size={14} color="#f97316" />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#f97316', fontFamily: 'Raleway', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stale — not updated in 30+ days ({staleFacts.length})</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {staleFacts.map(f => (
                  <div key={`${f.agent_id}:${f.key}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', borderRadius: 10, background: '#f9741008', border: '1px solid #f9741025' }}>
                    <AlertTriangle size={12} color="#f97316" style={{ flexShrink: 0, marginTop: 3 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', fontFamily: 'Raleway' }}>{f.key}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.value}</div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: '#f97316', fontWeight: 700 }}>{f.days_since_update}d old</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{f.agent_id}</div>
                    </div>
                    <button onClick={() => forgetFact(f.key, f.agent_id)} title="Delete stale fact" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f97316', padding: 2, lineHeight: 0, flexShrink: 0 }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {freshFacts.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <CheckCircle2 size={14} color="#22c55e" />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', fontFamily: 'Raleway', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current ({freshFacts.length})</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {freshFacts.map(f => (
                  <div key={`${f.agent_id}:${f.key}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--faint)', border: '1px solid var(--border)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', fontFamily: 'Raleway' }}>{f.key}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato', marginTop: 2 }}>{f.value}</div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>updated {f.updated_at}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{f.agent_id}</div>
                    </div>
                    <button onClick={() => forgetFact(f.key, f.agent_id)} title="Delete fact" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2, lineHeight: 0, flexShrink: 0 }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )

  return (
    <AgentPageLayout
      agentId="memory"
      agentName="Memory & Code"
      agentColor={COLOR}
      agentIcon={<Brain size={20} />}
      description="Cross-agent memory, preferences & code debugging · 100% local"
      tabs={['dashboard', 'actions', 'chat', 'settings']}
      starters={['What do you remember about me?', "What are my trading rules?", "What is my dissertation topic?", "Help me debug this error"]}
      dashboard={dashboard}
      actions={audit}
      settings={<div style={{ padding: 20, color: 'var(--muted)', fontFamily: 'Lato', fontSize: 13 }}>Memory settings coming soon.</div>}
      commandCenter={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>Total facts</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)' }}>{totalFacts}</span>
          </div>
          {staleFacts.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: '#f97316', fontFamily: 'Lato' }}>Stale (30d+)</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#f97316' }}>{staleFacts.length}</span>
            </div>
          )}
        </div>
      }
    />
  )
}
