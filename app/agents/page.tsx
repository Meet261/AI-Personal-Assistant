'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  TrendingUp, BookOpen, Calendar, Brain, Microscope,
  Search, Mail, Bot, Flame, ChevronRight, Activity,
  Zap, AlertTriangle, CheckCircle2, Play, Square,
} from 'lucide-react'

const S = { fontFamily: 'Raleway, sans-serif' }

interface AgentDef {
  id: string
  name: string
  shortDesc: string
  color: string
  icon: React.ElementType
  route: string
  external?: boolean
  tags: string[]
}

const AGENTS: AgentDef[] = [
  { id: 'assistant',  name: 'Personal Assistant', shortDesc: 'Tasks, projects & meetings',   color: '#0F766E', icon: Bot,        route: '/agents/assistant', tags: ['tasks','projects','meetings'] },
  { id: 'trading',    name: 'Trading Agent',      shortDesc: 'P&L, risk & trade history',    color: '#B45309', icon: TrendingUp, route: '/agents/trading',   tags: ['pnl','risk','signals'] },
  { id: 'journal',    name: 'Journal & Health',   shortDesc: 'Mood, energy & health logs',   color: '#0369A1', icon: Activity,   route: '/agents/journal',   tags: ['mood','energy','health'] },
  { id: 'scheduler',  name: 'Scheduler',          shortDesc: 'Week view & smart planning',   color: '#6D28D9', icon: Calendar,   route: '/agents/scheduler', tags: ['week','overdue','alerts'] },
  { id: 'memory',     name: 'Memory & Code',      shortDesc: 'Facts, prefs & code debug',    color: '#374151', icon: Brain,      route: '/agents/memory',    tags: ['facts','preferences','debug'] },
  { id: 'digester',   name: 'Paper Digester',     shortDesc: 'AI analysis of your papers',   color: '#9D174D', icon: Microscope, route: '/agents/digester',  tags: ['haiku','digest','papers'] },
  { id: 'knowledge',  name: 'Knowledge (RAG)',    shortDesc: 'Semantic search your library', color: '#1D4ED8', icon: Search,     route: '/agents/knowledge', tags: ['rag','search','citations'] },
  { id: 'habits',     name: 'Habit Tracker',      shortDesc: 'Streaks & daily consistency',  color: '#065F46', icon: Flame,      route: '/agents/habit-tracker', tags: ['streaks','routines'] },
  { id: 'email',      name: 'Email Agent',        shortDesc: 'Inbox triage & drafts',        color: '#DC2626', icon: Mail,       route: '/agents/email',     tags: ['inbox','triage','drafts'] },
  { id: 'research',   name: 'Research Assistant', shortDesc: 'Paper library & highlights',   color: '#7C3AED', icon: BookOpen,   route: '/agents/research',  tags: ['papers','highlights','pdf'] },
]

interface SysStatus {
  deepseek: boolean | null
  chroma: boolean | null
  papers: number
  tasks: number
  habits: number
  alerts: number
}

// Agents that have controllable processes
const CONTROLLABLE = ['trading', 'research']

export default function AgentsHubPage() {
  const router = useRouter()
  const [sys, setSys] = useState<SysStatus>({ deepseek: null, chroma: null, papers: 0, tasks: 0, habits: 0, alerts: 0 })
  const [filter, setFilter] = useState('')
  const [agentStatus, setAgentStatus] = useState<Record<string, boolean>>({})
  const [controlling, setControlling] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    const res = await fetch('/api/agents/launch').then(r => r.json()).catch(() => ({}))
    const map: Record<string, boolean> = {}
    for (const [id, val] of Object.entries(res)) {
      map[id] = (val as { running: boolean }).running ?? false
    }
    setAgentStatus(map)
  }, [])

  useEffect(() => {
    Promise.allSettled([
      fetch('/api/system/health', { signal: AbortSignal.timeout(3000) }).then(r => r.json()).then(d => d.services?.deepseek ?? false),
      fetch('/api/knowledge?action=status').then(r => r.json()).then(d => d.ok),
      fetch('/api/research/papers').then(r => r.json()).then(d => d.length),
      fetch('/api/tasks').then(r => r.json()).then(d => d.length),
      fetch('/api/agents/habit?action=get_habits').then(r => r.json()).then(d => d.data?.length ?? 0),
      fetch('/api/agents/scheduler?action=get_alerts').then(r => r.json()).then(d => d.data?.length ?? 0),
    ]).then(([deepseek, chroma, papers, tasks, habits, alerts]) => setSys({
      deepseek: deepseek.status  === 'fulfilled' ? deepseek.value as boolean : false,
      chroma:  chroma.status  === 'fulfilled' ? chroma.value  as boolean : false,
      papers:  papers.status  === 'fulfilled' ? papers.value  as number  : 0,
      tasks:   tasks.status   === 'fulfilled' ? tasks.value   as number  : 0,
      habits:  habits.status  === 'fulfilled' ? habits.value  as number  : 0,
      alerts:  alerts.status  === 'fulfilled' ? alerts.value  as number  : 0,
    }))
    loadStatus()
  }, [loadStatus])

  const controlAgent = useCallback(async (agentId: string, action: 'start' | 'stop', e: React.MouseEvent) => {
    e.stopPropagation()
    setControlling(agentId)
    // Optimistically update UI immediately so stop doesn't flicker back to running
    if (action === 'stop') setAgentStatus(prev => ({ ...prev, [agentId]: false }))
    await fetch('/api/agents/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: agentId, action }),
    })
    // Wait for port to fully release before re-polling
    await new Promise(r => setTimeout(r, action === 'stop' ? 3000 : 800))
    await loadStatus()
    setControlling(null)
  }, [loadStatus])

  const filtered = AGENTS.filter(a =>
    !filter || a.name.toLowerCase().includes(filter.toLowerCase()) ||
    a.tags.some(t => t.includes(filter.toLowerCase()))
  )

  function go(agent: AgentDef) {
    agent.external ? window.open(agent.route, '_blank') : router.push(agent.route)
  }

  const Dot = ({ ok }: { ok: boolean | null }) => (
    <div style={{ width: 7, height: 7, borderRadius: '50%', background: ok === null ? '#94a3b8' : ok ? '#22c55e' : '#ef4444', flexShrink: 0 }} />
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', ...S }}>

      {/* Header */}
      <div style={{ padding: '28px 32px 0', background: 'var(--panel)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.03em' }}>Agent Hub</h1>
              <p style={{ margin: '5px 0 0', fontSize: 13, color: 'var(--muted)', fontFamily: 'Lato' }}>
                10 specialist agents · DeepSeek V3 + R1 + Jina embeddings
              </p>
            </div>
            {/* Status pills */}
            <div style={{ display: 'flex', gap: 8 }}>
              {[{ label: 'DeepSeek', ok: sys.deepseek }, { label: 'ChromaDB', ok: sys.chroma }, { label: 'Server', ok: true as boolean }].map(s => (
                <div key={s.label} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px',
                  borderRadius: 8, border: '1px solid var(--border)', background: 'var(--faint)',
                }}>
                  <Dot ok={s.ok as boolean | null} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick stats */}
          <div style={{ display: 'flex', gap: 28, paddingBottom: 20 }}>
            {[
              { label: 'Open Tasks', val: sys.tasks,  icon: CheckCircle2, color: '#0F766E' },
              { label: 'Papers',     val: sys.papers,  icon: BookOpen,     color: '#7C3AED' },
              { label: 'Habits',     val: sys.habits,  icon: Flame,        color: '#065F46' },
              { label: 'Alerts',     val: sys.alerts,  icon: AlertTriangle, color: sys.alerts ? '#B45309' : '#94a3b8' },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <s.icon size={14} color={s.color} />
                <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--text)' }}>{s.val}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato' }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 32px' }}>

        {/* Search */}
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search agents…"
          style={{
            padding: '9px 14px', borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--panel)', color: 'var(--text)', fontSize: 13,
            fontFamily: 'Lato', outline: 'none', width: 260, display: 'block', marginBottom: 20,
          }}
        />

        {/* Agent cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {filtered.map(agent => {
            const Icon = agent.icon
            return (
              <div key={agent.id} onClick={() => go(agent)} style={{
                background: 'var(--panel)', borderRadius: 16, padding: '20px',
                border: '1px solid var(--border)', cursor: 'pointer',
                transition: 'all .15s', position: 'relative', overflow: 'hidden',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = `${agent.color}60`
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = `0 8px 24px ${agent.color}18`
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.transform = 'none'
                e.currentTarget.style.boxShadow = 'none'
              }}>
                {/* Color accent top strip */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: agent.color, borderRadius: '16px 16px 0 0' }} />

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 13, flexShrink: 0,
                    background: `${agent.color}12`, border: `1.5px solid ${agent.color}28`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={20} color={agent.color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{agent.name}</h3>
                      <ChevronRight size={14} color="var(--muted)" />
                    </div>
                    <p style={{ margin: '3px 0 10px', fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato', lineHeight: 1.4 }}>
                      {agent.shortDesc}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {agent.tags.slice(0, 3).map(t => (
                          <span key={t} style={{
                            padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                            background: `${agent.color}10`, color: agent.color, border: `1px solid ${agent.color}20`,
                          }}>{t}</span>
                        ))}
                        {agent.external && <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: 'var(--faint)', color: 'var(--muted)' }}>↗ external</span>}
                      </div>
                      {CONTROLLABLE.includes(agent.id) && (() => {
                        const running = agentStatus[agent.id] ?? false
                        const busy = controlling === agent.id
                        return (
                          <button
                            onClick={e => controlAgent(agent.id, running ? 'stop' : 'start', e)}
                            disabled={busy}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 4,
                              padding: '4px 10px', borderRadius: 7, fontSize: 10, fontWeight: 700,
                              fontFamily: 'Raleway', cursor: busy ? 'wait' : 'pointer',
                              border: `1px solid ${running ? '#22c55e40' : agent.color + '40'}`,
                              background: running ? '#22c55e10' : `${agent.color}10`,
                              color: running ? '#16a34a' : agent.color,
                              opacity: busy ? 0.6 : 1, flexShrink: 0,
                            }}>
                            <div style={{ width: 5, height: 5, borderRadius: '50%', background: running ? '#22c55e' : '#94a3b8', flexShrink: 0 }} />
                            {busy ? '…' : running ? 'Stop' : 'Start'}
                          </button>
                        )
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Daily loop */}
        <div style={{ marginTop: 28, padding: 20, borderRadius: 16, border: '1px solid var(--border)', background: 'var(--panel)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Zap size={15} color="#B45309" />
            <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>Daily Loop</span>
            <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato' }}>— your morning → work → evening workflow</span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              { label: '☀️ Morning Brief',   route: '/briefing/morning',      color: '#B45309' },
              { label: '📋 Plan Today',       route: '/agents/assistant',      color: '#0F766E' },
              { label: '📓 Journal',          route: '/agents/journal',        color: '#0369A1' },
              { label: '🔥 Habits',           route: '/agents/habit-tracker',  color: '#065F46' },
              { label: '📈 Trading',          route: '/agents/trading',        color: '#B45309' },
              { label: '🌙 Evening Summary',  route: '/briefing/evening',      color: '#6D28D9' },
            ].map(item => (
              <button key={item.label} onClick={() => router.push(item.route)} style={{
                padding: '8px 14px', borderRadius: 10, border: `1px solid ${item.color}30`,
                background: `${item.color}08`, color: item.color, fontFamily: 'Raleway',
                fontWeight: 700, fontSize: 12, cursor: 'pointer', transition: 'background .1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = `${item.color}18`}
              onMouseLeave={e => e.currentTarget.style.background = `${item.color}08`}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
