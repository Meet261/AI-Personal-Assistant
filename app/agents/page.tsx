'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Bot, BookOpen, TrendingUp, ExternalLink, Play, Square,
  RefreshCw, Terminal, CheckCircle2, XCircle, Loader2, ChevronDown, RotateCcw, Hammer,
} from 'lucide-react'

const S = { fontFamily: 'Raleway, sans-serif' }

interface AgentStatus {
  running: boolean
  url: string
  port: number
  managedByPA: boolean
  startedAt: string | null
  logs: string[]
}

interface AgentConfig {
  id: string
  label: string
  description: string
  icon: React.ElementType
  color: string
  url: string
  note: string
  alwaysOn?: boolean
}

const AGENTS: AgentConfig[] = [
  {
    id: 'assistant',
    label: 'Personal Assistant',
    description: 'Task management, projects, journaling & AI agent chat.',
    icon: Bot,
    color: '#0F766E',
    url: 'http://localhost:3000',
    note: 'This app — always running.',
    alwaysOn: true,
  },
  {
    id: 'research',
    label: 'Research Assistant',
    description: 'Academic paper library, highlights, and research project management.',
    icon: BookOpen,
    color: '#7C3AED',
    url: '/api/research-app',
    note: 'Served by PA · data in Supabase · PDFs from dist/',
  },
  {
    id: 'trading',
    label: 'Trading Agent',
    description: 'Live trading signals for XAUUSD/XAGUSD via MT5. FastAPI on port 8000.',
    icon: TrendingUp,
    color: '#B45309',
    url: 'http://localhost:8000',
    note: 'Python · uvicorn · port 8000',
  },
]

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

function AgentCard({ agent, status, onAction, actionLoading, onReconcile, reconciling, onImport, building, onBuild }: {
  agent: AgentConfig
  status: AgentStatus | null
  onAction: (agentId: string, action: 'start' | 'stop') => void
  actionLoading: boolean
  onReconcile?: () => void
  reconciling?: boolean
  onImport?: (file: File) => void
  building?: boolean
  onBuild?: () => void
}) {
  const [showLogs, setShowLogs] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const Icon = agent.icon

  const running = agent.alwaysOn ? true : (status?.running ?? false)
  const managed = status?.managedByPA ?? false

  useEffect(() => {
    if (showLogs && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [status?.logs, showLogs])

  return (
    <div style={{
      background: 'var(--panel)',
      border: `1px solid ${running ? `${agent.color}40` : 'var(--border)'}`,
      borderRadius: 'var(--r-lg)',
      overflow: 'hidden',
      transition: 'border-color .2s',
    }}>
      {/* Card header */}
      <div style={{ padding: '20px 20px 16px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        {/* Icon */}
        <div style={{
          width: 44, height: 44, borderRadius: 14, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${agent.color}18`, border: `1px solid ${agent.color}40`,
        }}>
          <Icon size={20} style={{ color: agent.color }} />
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <p style={{ ...S, fontWeight: 800, fontSize: 15, color: 'var(--text)', margin: 0 }}>
              {agent.label}
            </p>
            {/* Status pill */}
            <span style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, fontFamily: 'Raleway, sans-serif',
              background: running ? 'rgba(39,217,138,.12)' : 'rgba(148,163,184,.10)',
              color: running ? '#27d98a' : 'var(--muted)',
              border: `1px solid ${running ? 'rgba(39,217,138,.25)' : 'var(--border)'}`,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: running ? '#27d98a' : 'var(--muted)', display: 'inline-block' }} />
              {running ? 'Running' : 'Stopped'}
            </span>
            {managed && (
              <span style={{ fontSize: 9, color: agent.color, fontWeight: 700, fontFamily: 'Raleway, sans-serif', background: `${agent.color}14`, padding: '2px 6px', borderRadius: 8 }}>
                PA managed
              </span>
            )}
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 4px', lineHeight: 1.5, fontFamily: 'Lato, sans-serif' }}>
            {agent.description}
          </p>
          <p style={{ fontSize: 11, color: 'var(--subtle)', margin: 0, fontFamily: 'Lato, sans-serif' }}>
            {agent.note}
            {status?.startedAt && running && managed && ` · started ${timeAgo(status.startedAt)}`}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div style={{ padding: '0 20px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        {!agent.alwaysOn && (
          <>
            {running ? (
              <button
                onClick={() => onAction(agent.id, 'stop')}
                disabled={actionLoading}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 10, border: 'none', cursor: actionLoading ? 'not-allowed' : 'pointer',
                  background: 'rgba(255,92,122,.12)', color: '#ff5c7a',
                  fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 12,
                  opacity: actionLoading ? 0.6 : 1, transition: 'opacity .15s',
                }}
              >
                {actionLoading ? <Loader2 size={13} style={{ animation: 'spin .8s linear infinite' }} /> : <Square size={13} />}
                Stop
              </button>
            ) : (
              <button
                onClick={() => onAction(agent.id, 'start')}
                disabled={actionLoading}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 10, border: 'none', cursor: actionLoading ? 'not-allowed' : 'pointer',
                  background: agent.color, color: '#fff',
                  fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 12,
                  opacity: actionLoading ? 0.6 : 1, transition: 'opacity .15s',
                }}
              >
                {actionLoading ? <Loader2 size={13} style={{ animation: 'spin .8s linear infinite' }} /> : <Play size={13} />}
                Start
              </button>
            )}
          </>
        )}

        {agent.id === 'research' && (
          <button
            onClick={building ? undefined : onBuild}
            disabled={building}
            title="Rebuild the research app from source (after adding new papers or code changes)"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 10, border: '1px solid var(--border)',
              background: 'var(--faint)', color: 'var(--text)', cursor: building ? 'not-allowed' : 'pointer',
              fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 12,
              opacity: building ? 0.6 : 1,
            }}
          >
            {building ? <Loader2 size={13} style={{ animation: 'spin .8s linear infinite' }} /> : <Hammer size={13} />}
            {building ? 'Building…' : 'Rebuild'}
          </button>
        )}

        {onImport && (
          <>
            <input ref={fileRef} type="file" accept=".csv,.htm,.html" className="hidden" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) { onImport(f); e.target.value = '' } }} />
            <button
              onClick={() => fileRef.current?.click()}
              title="Import MT5 history CSV — File > Save As Report in MT5 History tab"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 10, border: '1px solid var(--border)',
                background: 'var(--faint)', color: 'var(--text)', cursor: 'pointer',
                fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 12,
              }}
            >
              <RefreshCw size={13} /> Import MT5
            </button>
          </>
        )}

        {onReconcile && (
          <button
            onClick={onReconcile}
            disabled={reconciling || !running}
            title="Sync any missed trades from MT5 into the trade log"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 10, border: '1px solid var(--border)',
              background: 'var(--faint)', color: 'var(--text)', cursor: reconciling || !running ? 'not-allowed' : 'pointer',
              fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 12,
              opacity: !running ? 0.4 : reconciling ? 0.6 : 1,
            }}
          >
            {reconciling ? <Loader2 size={13} style={{ animation: 'spin .8s linear infinite' }} /> : <RotateCcw size={13} />}
            {reconciling ? 'Syncing…' : 'Sync Trades'}
          </button>
        )}

        <a
          href={agent.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 10, textDecoration: 'none',
            background: 'var(--faint)', border: '1px solid var(--border)',
            color: running ? 'var(--text)' : 'var(--muted)',
            fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 12,
            opacity: running ? 1 : 0.5, pointerEvents: running ? 'auto' : 'none',
            transition: 'all .15s',
          }}
        >
          <ExternalLink size={13} /> Open
        </a>

        {!agent.alwaysOn && status?.logs && status.logs.length > 0 && (
          <button
            onClick={() => setShowLogs(s => !s)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              marginLeft: 'auto', padding: '7px 12px', borderRadius: 10,
              background: 'var(--faint)', border: '1px solid var(--border)',
              color: 'var(--muted)', cursor: 'pointer',
              fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 11,
            }}
          >
            <Terminal size={12} /> Logs
            <ChevronDown size={11} style={{ transform: showLogs ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
          </button>
        )}
      </div>

      {/* Log panel */}
      {showLogs && status?.logs && (
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
          <div
            ref={logRef}
            style={{
              height: 180, overflowY: 'auto', padding: '10px 14px',
              fontFamily: 'monospace', fontSize: 11, color: '#a3e635',
              lineHeight: 1.6,
            }}
          >
            {status.logs.length === 0 ? (
              <span style={{ color: 'var(--muted)' }}>No logs yet…</span>
            ) : status.logs.map((line, i) => (
              <div key={i} style={{ color: line.includes('error') || line.includes('Error') ? '#ff5c7a' : line.includes('warn') ? '#fbbf24' : '#a3e635' }}>
                {line}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AgentsPage() {
  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({})
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionResult, setActionResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [reconciling, setReconciling] = useState(false)
  const [building, setBuilding] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/agents/launch')
      const data = await res.json()
      setStatuses(data)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 5000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  async function handleBuild() {
    setBuilding(true)
    setActionResult(null)
    try {
      const res = await fetch('/api/agents/build', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent: 'research' }) })
      const data = await res.json()
      setActionResult({ ok: data.ok ?? true, message: data.message })
      const poll = setInterval(async () => {
        const r = await fetch('/api/agents/build')
        const d = await r.json()
        if (!d.building) { clearInterval(poll); setBuilding(false); setActionResult({ ok: true, message: 'Research app rebuilt successfully' }) }
      }, 2000)
    } catch (e) { setActionResult({ ok: false, message: String(e) }); setBuilding(false) }
  }

  async function handleImport(file: File) {
    setActionResult(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/agents/import-trades', { method: 'POST', body: formData })
      const data = await res.json()
      setActionResult({ ok: data.ok ?? !data.error, message: data.message || data.error })
    } catch (e) {
      setActionResult({ ok: false, message: String(e) })
    }
  }

  async function handleReconcile() {
    setReconciling(true)
    setActionResult(null)
    try {
      const res = await fetch('/api/agents/reconcile', { method: 'POST' })
      const data = await res.json()
      setActionResult({ ok: !data.error, message: data.message || data.error })
    } catch (e) {
      setActionResult({ ok: false, message: String(e) })
    } finally {
      setReconciling(false)
    }
  }

  async function handleAction(agentId: string, action: 'start' | 'stop') {
    setActionLoading(agentId)
    setActionResult(null)
    try {
      const res = await fetch('/api/agents/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: agentId, action }),
      })
      const data = await res.json()
      setActionResult({ ok: data.ok ?? !data.error, message: data.message || data.error })
      // Optimistically update status for stop actions
      if (action === 'stop' && (data.ok ?? !data.error)) {
        setStatuses(prev => ({
          ...prev,
          [agentId]: { ...prev[agentId], running: false, managedByPA: false },
        }))
      }
      // Re-poll to confirm actual state
      setTimeout(fetchStatus, 1500)
      setTimeout(fetchStatus, 4000)
    } catch (e) {
      setActionResult({ ok: false, message: String(e) })
    } finally {
      setActionLoading(null)
    }
  }

  const runningCount = Object.values(statuses).filter(s => s.running).length + 1 // +1 for PA itself

  return (
    <div style={{ padding: '28px 32px', maxWidth: 860, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ ...S, fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: '0 0 4px' }}>
              Agents Hub
            </h1>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, fontFamily: 'Lato, sans-serif' }}>
              Manage and launch your AI agents from one place.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 10, background: 'var(--faint)', border: '1px solid var(--border)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#27d98a', boxShadow: '0 0 6px #27d98a80', display: 'inline-block' }} />
              <span style={{ ...S, fontWeight: 700, fontSize: 12, color: 'var(--text)' }}>
                {loading ? '…' : runningCount} / {AGENTS.length} running
              </span>
            </div>
            <button
              onClick={fetchStatus}
              style={{ padding: '7px', borderRadius: 10, background: 'var(--faint)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--muted)', display: 'flex', alignItems: 'center' }}
              title="Refresh status"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Action result toast */}
      {actionResult && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 16px', borderRadius: 12, marginBottom: 20,
          background: actionResult.ok ? 'rgba(39,217,138,.10)' : 'rgba(255,92,122,.10)',
          border: `1px solid ${actionResult.ok ? 'rgba(39,217,138,.25)' : 'rgba(255,92,122,.25)'}`,
        }}>
          {actionResult.ok
            ? <CheckCircle2 size={16} style={{ color: '#27d98a', flexShrink: 0 }} />
            : <XCircle size={16} style={{ color: '#ff5c7a', flexShrink: 0 }} />}
          <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, fontFamily: 'Lato, sans-serif' }}>
            {actionResult.message}
          </p>
          <button onClick={() => setActionResult(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Agent cards */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Loader2 size={24} style={{ color: 'var(--brand2)', animation: 'spin .8s linear infinite' }} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {AGENTS.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              status={agent.alwaysOn ? { running: true, url: agent.url, port: 3000, managedByPA: true, startedAt: null, logs: [] } : (statuses[agent.id] ?? null)}
              onAction={handleAction}
              actionLoading={actionLoading === agent.id}
              onReconcile={agent.id === 'trading' ? handleReconcile : undefined}
              reconciling={agent.id === 'trading' ? reconciling : false}
              onImport={agent.id === 'trading' ? handleImport : undefined}
              building={agent.id === 'research' ? building : false}
              onBuild={agent.id === 'research' ? handleBuild : undefined}
            />
          ))}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
