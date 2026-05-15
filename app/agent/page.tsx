'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Bot, Send, Trash2, ChevronDown, Zap, User, CheckCircle2, XCircle,
  Loader2, History, MessageSquare, Plus, Clock, Layers, CheckSquare,
  Edit2, X, BookOpen, TrendingUp,
} from 'lucide-react'
import { useCmdK } from '@/components/CmdKProvider'
import type { AgentMessage } from '@/components/CmdKProvider'
import { AGENTS, getAgent, type AgentId } from '@/lib/agents'

const S = { fontFamily: 'Raleway, sans-serif' }

type Role = 'user' | 'assistant'
interface ToolResult { ok: boolean; message: string; data?: unknown }

interface AgentSession {
  id: string
  title: string | null
  summary: string | null
  message_count: number
  started_at: string
  last_message_at: string | null
  agent_id: string
}

interface ActivityItem {
  id: string
  type: string
  entity_type: string
  entity_title: string
  meta: Record<string, unknown> | null
  source: string
  created_at: string
}

const MODELS = [
  { id: 'deepseek-r1:7b', label: 'DeepSeek R1 7b', desc: 'Fast · Local · All features' },
]

const AGENT_ICONS: Record<AgentId, React.ElementType> = {
  assistant: Bot,
  research: BookOpen,
  trading: TrendingUp,
  journal: Bot,
  scheduler: Bot,
  knowledge: BookOpen,
  'paper-digester': BookOpen,
  'habit-tracker': Bot,
  memory: Bot,
  email: Bot,
}

function uid() { return Math.random().toString(36).slice(2) }

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const ACTIVITY_ICONS: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  task_created:    { icon: CheckSquare, color: '#27d98a', label: 'Task created' },
  task_updated:    { icon: Edit2,       color: '#3dd6d0', label: 'Task updated' },
  task_deleted:    { icon: X,           color: '#ff5c7a', label: 'Task deleted' },
  project_created: { icon: Layers,      color: '#ffcc66', label: 'Project created' },
  project_deleted: { icon: X,           color: '#ff5c7a', label: 'Project deleted' },
}

export default function AgentPage() {
  const { agentMessages: messages, setAgentMessages: setMessages, agentSessionId: sessionId, setAgentSessionId: setSessionId } = useCmdK()

  const [activeAgentId, setActiveAgentId] = useState<AgentId>('assistant')
  const [tab, setTab] = useState<'chat' | 'history'>('chat')
  const [input, setInput] = useState('')
  const [model, setModel] = useState('deepseek-r1:7b')
  const [streaming, setStreaming] = useState(false)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [showAgentMenu, setShowAgentMenu] = useState(false)

  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [loadingSession, setLoadingSession] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  const activeAgent = getAgent(activeAgentId)
  const AgentIcon = AGENT_ICONS[activeAgentId]

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true)
    const [sessRes, actRes] = await Promise.all([
      fetch(`/api/agent-history?agent_id=${activeAgentId}`),
      fetch('/api/activity?limit=40'),
    ])
    setSessions(await sessRes.json())
    setActivity(await actRes.json())
    setLoadingHistory(false)
  }, [activeAgentId])

  useEffect(() => {
    if (tab === 'history') loadHistory()
  }, [tab, loadHistory])

  // When switching agents: clear chat, clear session
  function switchAgent(id: AgentId) {
    if (id === activeAgentId) return
    setActiveAgentId(id)
    setMessages([] as AgentMessage[])
    setSessionId(null)
    setStreaming(false)
    setTab('chat')
  }

  async function startNewSession() {
    const res = await fetch('/api/agent-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create_session', agent_id: activeAgentId }),
    })
    const data = await res.json()
    setSessionId(data.id)
    setMessages([] as AgentMessage[])
    return data.id as string
  }

  async function loadSession(session: AgentSession) {
    setLoadingSession(true)
    setTab('chat')
    setSessionId(session.id)
    const res = await fetch(`/api/agent-history?mode=messages&session_id=${session.id}`)
    const msgs: Array<{ id: string; role: Role; content: string; tool_results: ToolResult[] | null; created_at: string }> = await res.json()
    setMessages(msgs.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      ts: new Date(m.created_at),
      toolResults: m.tool_results || [],
    })) as AgentMessage[])
    setLoadingSession(false)
  }

  async function deleteSession(sid: string, e: React.MouseEvent) {
    e.stopPropagation()
    await fetch(`/api/agent-history?session_id=${sid}`, { method: 'DELETE' })
    loadHistory()
  }

  async function maybeSetTitle(sid: string, userMsg: string) {
    const title = userMsg.slice(0, 60) + (userMsg.length > 60 ? '…' : '')
    await fetch('/api/agent-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save_summary', session_id: sid, title }),
    })
  }

  const send = useCallback(async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || streaming) return
    setInput('')

    let sid = sessionId
    if (!sid) sid = await startNewSession()

    const userMsg: AgentMessage = { id: uid(), role: 'user', content, ts: new Date() }
    const loadingId = uid()
    const loadingMsg: AgentMessage = { id: loadingId, role: 'assistant', content: '', ts: new Date(), isLoading: true }

    setMessages(prev => [...prev, userMsg, loadingMsg])
    setStreaming(true)

    const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }))
    history.push({ role: 'user', content })

    try {
      // Use orchestrator for auto-routing, direct agent otherwise
      const useOrchestrator = activeAgentId === 'assistant' // orchestrator routes from PA
      const endpoint = useOrchestrator ? '/api/orchestrator' : '/api/ai/agent'
      const body = useOrchestrator
        ? { messages: history, model, session_id: sid }
        : { messages: history, model, agentId: activeAgentId, session_id: sid }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json()
        setMessages(prev => prev.map(m =>
          m.id === loadingId ? { ...m, content: err.error || 'Something went wrong.', isLoading: false } : m
        ))
        return
      }

      const { reply, toolResults, intent } = await res.json()
      setMessages(prev => prev.map(m =>
        m.id === loadingId ? { ...m, content: reply || '', toolResults: toolResults || [], isLoading: false, routedTo: intent?.primaryAgent } : m
      ))

      if (messages.length === 0 && sid) maybeSetTitle(sid, content)
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === loadingId ? { ...m, content: '⚠️ Could not reach Ollama. Make sure it is running.', isLoading: false } : m
      ))
    } finally {
      setStreaming(false)
    }
  }, [input, messages, model, streaming, activeAgentId, sessionId])

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  function newChat() {
    setMessages([] as AgentMessage[])
    setSessionId(null)
    setStreaming(false)
    setTab('chat')
  }

  const menuStyle = (active: boolean): React.CSSProperties => ({
    position: 'absolute', right: 0, top: '100%', marginTop: 4,
    background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14,
    boxShadow: 'var(--shadow-lg)', zIndex: 50, overflow: 'hidden', minWidth: 200,
    display: active ? 'block' : 'none',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>

      {/* ── Agent switcher bar ── */}
      <div style={{ flexShrink: 0, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--panel)', borderBottom: '1px solid var(--border)' }}>

        {/* Agent dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowAgentMenu(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px',
              borderRadius: 10, border: '1px solid var(--border)', background: `${activeAgent.color}12`,
              cursor: 'pointer', fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 13,
              color: activeAgent.color, minWidth: 160,
            }}
          >
            <AgentIcon size={15} />
            {activeAgent.shortLabel}
            <ChevronDown size={12} style={{ marginLeft: 'auto', opacity: 0.6 }} />
          </button>
          {showAgentMenu && (
            <div onClick={() => setShowAgentMenu(false)} style={{
              position: 'fixed', inset: 0, zIndex: 99,
            }} />
          )}
          {showAgentMenu && (
            <div style={{
              position: 'absolute', top: '110%', left: 0, zIndex: 100,
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 6, minWidth: 240,
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2,
            }}>
              {AGENTS.map(agent => {
                const Icon = AGENT_ICONS[agent.id]
                const active = agent.id === activeAgentId
                return (
                  <button key={agent.id} onClick={() => { switchAgent(agent.id); setShowAgentMenu(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7, padding: '8px 10px',
                      borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left',
                      background: active ? `${agent.color}18` : 'transparent',
                      color: active ? agent.color : 'var(--text)',
                      fontFamily: 'Raleway, sans-serif', fontWeight: active ? 800 : 600, fontSize: 12,
                      transition: 'background .1s',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--faint)' }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ width: 22, height: 22, borderRadius: 6, background: `${agent.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={12} style={{ color: agent.color }} />
                    </div>
                    <span style={{ flex: 1 }}>{agent.shortLabel}</span>
                    {active && <div style={{ width: 6, height: 6, borderRadius: '50%', background: agent.color, flexShrink: 0 }} />}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Tab switcher */}
          <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
            {([['chat', MessageSquare, 'Chat'], ['history', History, 'History']] as const).map(([t, Icon, label]) => (
              <button key={t} onClick={() => setTab(t)}
                style={{
                  padding: '7px 12px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                  ...S, fontWeight: 700, fontSize: 12,
                  background: tab === t ? 'var(--active)' : 'var(--faint)',
                  color: tab === t ? 'var(--brand)' : 'var(--muted)',
                  borderRight: t === 'chat' ? '1px solid var(--border)' : 'none',
                }}>
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>

          {/* Model picker */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowModelMenu(s => !s)}
              className="btn-ghost" style={{ padding: '7px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={11} style={{ color: 'var(--brand2)' }} />
              {MODELS.find(m => m.id === model)?.label} <ChevronDown size={11} />
            </button>
            <div style={menuStyle(showModelMenu)}>
              {MODELS.map(m => (
                <button key={m.id} onClick={() => { setModel(m.id); setShowModelMenu(false) }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: model === m.id ? 'var(--chip-bg)' : 'transparent', border: 'none', cursor: 'pointer' }}>
                  <p style={{ ...S, fontWeight: 700, fontSize: 12, color: model === m.id ? 'var(--brand)' : 'var(--text)', margin: 0 }}>{m.label}</p>
                  <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 0' }}>{m.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <button onClick={newChat} className="btn-ghost" style={{ padding: '7px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Plus size={13} /> New Chat
          </button>
        </div>
      </div>

      {/* ── Agent identity bar ── */}
      <div style={{ flexShrink: 0, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--panel)', borderBottom: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${activeAgent.color}18`, border: `1px solid ${activeAgent.color}40` }}>
          <AgentIcon size={17} style={{ color: activeAgent.color }} />
        </div>
        <div>
          <p style={{ ...S, fontWeight: 800, fontSize: 13, color: 'var(--text)', margin: 0 }}>{activeAgent.label}</p>
          <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>{activeAgent.description} · 100% local</p>
        </div>
      </div>

      {/* ── CHAT TAB ── */}
      {tab === 'chat' && (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {messages.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
                <div style={{ width: 64, height: 64, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${activeAgent.color}18`, border: `1px solid ${activeAgent.color}40`, marginBottom: 20 }}>
                  <AgentIcon size={30} style={{ color: activeAgent.color }} />
                </div>
                <h2 style={{ ...S, fontSize: 20, fontWeight: 900, color: 'var(--text)', margin: '0 0 8px' }}>{activeAgent.label}</h2>
                <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 28px', lineHeight: 1.6 }}>
                  {activeAgent.description}. Running locally on {MODELS.find(m => m.id === model)?.label}.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  {activeAgent.starters.map(s => (
                    <button key={s} onClick={() => send(s)}
                      style={{ padding: '8px 14px', borderRadius: 12, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--muted)', fontFamily: 'Lato, sans-serif', transition: 'all .15s' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = activeAgent.color; e.currentTarget.style.color = 'var(--text)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : messages.map(msg => (
              <div key={msg.id} style={{ display: 'flex', gap: 10, justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-start' }}>
                {msg.role === 'assistant' && (
                  <div style={{ width: 30, height: 30, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${activeAgent.color}18`, border: `1px solid ${activeAgent.color}40`, flexShrink: 0, marginTop: 2 }}>
                    <AgentIcon size={14} style={{ color: activeAgent.color }} />
                  </div>
                )}
                <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className={msg.role === 'user' ? 'bubble-user' : 'bubble-ai'} style={{ padding: '11px 15px' }}>
                    {msg.isLoading ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                        <Loader2 size={14} style={{ color: activeAgent.color, animation: 'spin .8s linear infinite' }} />
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Thinking…</span>
                      </div>
                    ) : (
                      <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'Lato, sans-serif' }}>
                        {msg.content || (msg.toolResults?.length ? '' : '…')}
                      </p>
                    )}
                    <p style={{ fontSize: 10, opacity: 0.45, margin: '6px 0 0', fontFamily: 'Lato, sans-serif', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                      {msg.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {msg.routedTo && msg.routedTo !== 'assistant' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--muted)', fontFamily: 'Raleway, sans-serif', fontWeight: 600, marginTop: 2 }}>
                      <span style={{ opacity: 0.5 }}>routed to</span>
                      <span style={{ background: 'var(--chip-bg)', padding: '1px 7px', borderRadius: 8, color: 'var(--brand2)' }}>{msg.routedTo}</span>
                    </div>
                  )}
                  {(msg.toolResults && msg.toolResults.length > 0 ? msg.toolResults : []).map((tr, ri) => (
                    <div key={ri} style={{
                      padding: '10px 14px', borderRadius: 12,
                      background: tr.ok ? 'rgba(39,217,138,.10)' : 'rgba(255,92,122,.10)',
                      border: `1px solid ${tr.ok ? 'rgba(39,217,138,.30)' : 'rgba(255,92,122,.30)'}`,
                      display: 'flex', alignItems: 'flex-start', gap: 8,
                    }}>
                      {tr.ok ? <CheckCircle2 size={15} style={{ color: '#27d98a', flexShrink: 0, marginTop: 1 }} /> : <XCircle size={15} style={{ color: '#ff5c7a', flexShrink: 0, marginTop: 1 }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ ...S, fontSize: 12, fontWeight: 700, color: tr.ok ? '#27d98a' : '#ff5c7a', margin: 0 }}>{tr.ok ? '✓ Done' : '✗ Failed'}</p>
                        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0', fontFamily: 'Lato, sans-serif' }}>{tr.message}</p>
                        {tr.ok && Array.isArray(tr.data) && tr.data.length > 0 && (
                          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {(tr.data as Record<string, unknown>[]).slice(0, 12).map((item, i) => (
                              <div key={i} style={{ fontSize: 11, color: 'var(--text)', padding: '3px 8px', borderRadius: 7, background: 'var(--faint)', fontFamily: 'Lato, sans-serif', display: 'flex', gap: 6 }}>
                                <span>{'title' in item ? String(item.title) : 'name' in item ? String(item.name) : JSON.stringify(item)}</span>
                                {'priority' in item && <span style={{ opacity: 0.5 }}>[{String(item.priority)}]</span>}
                                {'status' in item && <span style={{ opacity: 0.5 }}>{String(item.status)}</span>}
                              </div>
                            ))}
                            {tr.data.length > 12 && <p style={{ fontSize: 10, color: 'var(--muted)', margin: 0 }}>+{tr.data.length - 12} more</p>}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {msg.role === 'user' && (
                  <div style={{ width: 30, height: 30, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--brand)', flexShrink: 0, marginTop: 2 }}>
                    <User size={14} color="#fff" />
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div style={{ flexShrink: 0, padding: '14px 20px', background: 'var(--panel)', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', maxWidth: 860, margin: '0 auto' }}>
              <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey} suppressHydrationWarning
                placeholder={`Message ${activeAgent.label}…`}
                rows={1} disabled={streaming} className="input-field"
                style={{ resize: 'none', minHeight: 44, maxHeight: 160, overflowY: 'auto', lineHeight: 1.5, paddingTop: 11, paddingBottom: 11 }} />
              <button onClick={() => send()} disabled={!input.trim() || streaming} className="btn-primary"
                style={{ flexShrink: 0, width: 44, height: 44, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: activeAgent.color, opacity: (!input.trim() || streaming) ? 0.35 : 1 }}>
                {streaming ? <Loader2 size={16} style={{ animation: 'spin .8s linear infinite' }} /> : <Send size={16} />}
              </button>
            </div>
            <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', marginTop: 8, fontFamily: 'Lato, sans-serif' }}>
              Enter to send · Shift+Enter for new line · {sessionId ? 'Session saved' : 'Saves on first message'} · {MODELS.find(m => m.id === model)?.label}
            </p>
          </div>
        </>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === 'history' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ ...S, fontWeight: 800, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>
              {activeAgent.label} · Conversations
            </p>
            {loadingHistory ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                <Loader2 size={20} style={{ color: activeAgent.color, animation: 'spin .8s linear infinite' }} />
              </div>
            ) : sessions.length === 0 ? (
              <div className="card" style={{ borderRadius: 'var(--r-lg)', padding: '32px 20px', textAlign: 'center' }}>
                <AgentIcon size={28} style={{ color: 'var(--muted)', opacity: 0.3, display: 'block', margin: '0 auto 8px' }} />
                <p style={{ ...S, fontWeight: 600, color: 'var(--muted)', fontSize: 13 }}>No conversations yet</p>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Start chatting — sessions are saved automatically</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sessions.map(s => (
                  <div key={s.id} onClick={() => loadSession(s)}
                    style={{ padding: '12px 16px', borderRadius: 'var(--r-lg)', background: 'var(--panel)', border: '1px solid var(--border)', cursor: 'pointer', transition: 'all .15s', position: 'relative' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = activeAgent.color; (e.currentTarget as HTMLElement).style.background = 'var(--faint)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--panel)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ ...S, fontWeight: 700, fontSize: 13, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.title || 'Conversation'}
                        </p>
                        {s.summary && (
                          <p style={{ fontSize: 11, color: 'var(--muted)', margin: '3px 0 0', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {s.summary}
                          </p>
                        )}
                        <div style={{ display: 'flex', gap: 10, marginTop: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                            <Clock size={9} /> {timeAgo(s.last_message_at || s.started_at)}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                            <MessageSquare size={9} /> {s.message_count} messages
                          </span>
                        </div>
                      </div>
                      <button onClick={e => deleteSession(s.id, e)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '2px 4px', borderRadius: 6, flexShrink: 0, transition: 'color .15s' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#ff5c7a')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity log — only shown for assistant */}
          {activeAgentId === 'assistant' && (
            <div style={{ width: 320, flexShrink: 0 }}>
              <p style={{ ...S, fontWeight: 800, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>
                Task &amp; Project Activity
              </p>
              {activity.length === 0 ? (
                <div className="card" style={{ borderRadius: 'var(--r-lg)', padding: '24px 16px', textAlign: 'center' }}>
                  <p style={{ fontSize: 12, color: 'var(--muted)' }}>No activity yet</p>
                </div>
              ) : (
                <div className="card" style={{ borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
                  {activity.map((item, i) => {
                    const def = ACTIVITY_ICONS[item.type] || { icon: CheckSquare, color: 'var(--muted)', label: item.type }
                    const Icon = def.icon
                    return (
                      <div key={item.id} style={{ padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-start', borderBottom: i < activity.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ width: 24, height: 24, borderRadius: 8, background: `${def.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                          <Icon size={12} style={{ color: def.color }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ ...S, fontWeight: 700, fontSize: 12, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.entity_title}
                          </p>
                          <div style={{ display: 'flex', gap: 6, marginTop: 2, alignItems: 'center' }}>
                            <span style={{ fontSize: 10, color: def.color, fontWeight: 700, ...S }}>{def.label}</span>
                            {item.source === 'agent' && <span style={{ fontSize: 9, color: 'var(--brand2)', fontWeight: 700, ...S, background: 'var(--chip-bg)', padding: '1px 5px', borderRadius: 4 }}>AI</span>}
                            <span style={{ fontSize: 10, color: 'var(--muted)' }}>{timeAgo(item.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {loadingSession && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40 }}>
          <Loader2 size={28} style={{ color: activeAgent.color, animation: 'spin .8s linear infinite' }} />
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
