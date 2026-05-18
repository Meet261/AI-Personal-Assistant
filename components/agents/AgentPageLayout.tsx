'use client'
import { useState, useRef, useEffect, type ReactNode } from 'react'
import { Send, X, Loader2, Bot, User, ChevronRight, AlertTriangle, MessageSquare, LayoutDashboard, Zap, History, Settings, Terminal, Eye, EyeOff, Trash2, Activity } from 'lucide-react'
import { useAgentChat, type ChatMessage } from './useAgentChat'

const S = { fontFamily: 'Raleway, sans-serif' }

function renderInlineMd(s: string, isUser: boolean): ReactNode {
  const parts = s.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i} style={{ fontWeight: 800 }}>{p.slice(2,-2)}</strong>
    if (p.startsWith('*') && p.endsWith('*')) return <em key={i}>{p.slice(1,-1)}</em>
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i} style={{ fontFamily: 'monospace', fontSize: 11, background: isUser ? 'rgba(255,255,255,0.15)' : 'var(--faint)', padding: '1px 4px', borderRadius: 3 }}>{p.slice(1,-1)}</code>
    return p
  })
}

function MarkdownContent({ text, isUser }: { text: string; isUser: boolean }) {
  if (!text) return null
  const base: React.CSSProperties = { fontSize: 13, lineHeight: 1.65, fontFamily: 'Lato, sans-serif', margin: 0, color: isUser ? '#fff' : 'var(--text)' }
  const lines = text.split('\n')
  const els: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('```')) { // skip tool/code fences
      i++; while (i < lines.length && !lines[i].startsWith('```')) i++; i++; continue
    }
    if (/^---+$/.test(line.trim())) { els.push(<hr key={i} style={{ border: 'none', borderTop: `1px solid ${isUser ? 'rgba(255,255,255,0.2)' : 'var(--border)'}`, margin: '8px 0' }} />); i++; continue }
    const hm = line.match(/^(#{1,3})\s+(.+)/)
    if (hm) { els.push(<div key={i} style={{ fontWeight: 800, fontSize: hm[1].length === 1 ? 15 : 13, margin: '8px 0 3px', fontFamily: 'Raleway', color: isUser ? '#fff' : 'var(--text)' }}>{renderInlineMd(hm[2], isUser)}</div>); i++; continue }
    const bm = line.match(/^[-*•]\s+(.+)/)
    if (bm) {
      const items = [bm[1]]
      i++; while (i < lines.length && /^[-*•]\s+/.test(lines[i])) { items.push(lines[i].replace(/^[-*•]\s+/,'')); i++ }
      els.push(<ul key={i} style={{ margin: '4px 0', paddingLeft: 16 }}>{items.map((it,bi)=><li key={bi} style={{...base,marginBottom:2}}>{renderInlineMd(it,isUser)}</li>)}</ul>); continue
    }
    const nm = line.match(/^(\d+)\.\s+(.+)/)
    if (nm) {
      const items = [nm[2]]
      i++; while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s+/,'')); i++ }
      els.push(<ol key={i} style={{ margin: '4px 0', paddingLeft: 18 }}>{items.map((it,ni)=><li key={ni} style={{...base,marginBottom:3}}>{renderInlineMd(it,isUser)}</li>)}</ol>); continue
    }
    if (!line.trim()) { els.push(<div key={i} style={{ height: 5 }} />); i++; continue }
    els.push(<p key={i} style={{ ...base, marginBottom: 3 }}>{renderInlineMd(line, isUser)}</p>)
    i++
  }
  return <>{els}</>
}

export type AgentTab = 'dashboard' | 'today' | 'actions' | 'chat' | 'history' | 'settings'

interface Props {
  agentId: string
  agentName: string
  agentColor: string        // e.g. '#B45309'
  agentIcon: React.ReactNode
  description: string
  tabs: AgentTab[]          // which tabs to show
  starters?: string[]       // suggested chat starters
  // Tab content renderers
  dashboard?: React.ReactNode
  today?: React.ReactNode
  actions?: React.ReactNode
  history?: React.ReactNode
  settings?: React.ReactNode
  // Command center — agent-specific context snapshot
  commandCenter?: React.ReactNode
}

const TAB_META: Record<AgentTab, { label: string; icon: React.ElementType }> = {
  dashboard: { label: 'Dashboard', icon: LayoutDashboard },
  today:     { label: 'Today',     icon: Activity },
  actions:   { label: 'Actions',   icon: Zap },
  chat:      { label: 'Chat',      icon: MessageSquare },
  history:   { label: 'History',   icon: History },
  settings:  { label: 'Settings',  icon: Settings },
}

export default function AgentPageLayout({
  agentId, agentName, agentColor, agentIcon, description,
  tabs, starters = [], dashboard, today, actions, history, settings, commandCenter,
}: Props) {
  const [activeTab, setActiveTab] = useState<AgentTab>(tabs[0] ?? 'dashboard')
  const [chatOpen, setChatOpen] = useState(false)
  const [showToolCalls, setShowToolCalls] = useState(false)
  const [safetyLock, setSafetyLock] = useState(true)
  const chat = useAgentChat(agentId)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat.messages])

  const colorBg = `${agentColor}12`
  const colorBorder = `${agentColor}30`
  const colorText = agentColor

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', ...S }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, padding: '14px 24px', display: 'flex', alignItems: 'center',
        gap: 14, background: 'var(--panel)', borderBottom: '1px solid var(--border)',
      }}>
        {/* Agent icon + name */}
        <div style={{
          width: 38, height: 38, borderRadius: 12, display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: colorBg, border: `1.5px solid ${colorBorder}`,
          flexShrink: 0,
        }}>
          <span style={{ color: colorText }}>{agentIcon}</span>
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.02em' }}>{agentName}</h1>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato, sans-serif' }}>{description}</p>
        </div>

        {/* Tabs */}
        <div style={{ marginLeft: 24, display: 'flex', gap: 2, background: 'var(--faint)', borderRadius: 10, padding: 3 }}>
          {tabs.map(tab => {
            const { label, icon: Icon } = TAB_META[tab]
            const active = activeTab === tab
            return (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                borderRadius: 8, border: 'none', cursor: 'pointer',
                background: active ? 'var(--panel)' : 'transparent',
                color: active ? colorText : 'var(--muted)',
                fontFamily: 'Raleway, sans-serif', fontWeight: active ? 800 : 600, fontSize: 12,
                boxShadow: active ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                transition: 'all .15s',
              }}>
                <Icon size={13} />{label}
              </button>
            )
          })}
        </div>

        {/* Right controls */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Safety lock */}
          <button onClick={() => setSafetyLock(s => !s)} title={safetyLock ? 'Safety lock ON — write actions require confirm' : 'Safety lock OFF'}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
              borderRadius: 8, border: `1px solid ${safetyLock ? '#059669' : '#dc2626'}40`,
              background: safetyLock ? 'rgba(5,150,105,.08)' : 'rgba(220,38,38,.08)',
              color: safetyLock ? '#059669' : '#dc2626',
              fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 11, cursor: 'pointer',
            }}>
            {safetyLock ? <Eye size={12} /> : <EyeOff size={12} />}
            {safetyLock ? 'Safe' : 'Unlocked'}
          </button>

          {/* Ask agent button */}
          <button onClick={() => { setChatOpen(o => !o); setActiveTab('chat') }} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
            borderRadius: 10, border: `1px solid ${colorBorder}`, cursor: 'pointer',
            background: chatOpen ? colorText : colorBg,
            color: chatOpen ? '#fff' : colorText,
            fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 12,
            transition: 'all .15s',
          }}>
            <MessageSquare size={13} />
            Ask Agent
            {chat.messages.length > 0 && (
              <span style={{
                background: chatOpen ? 'rgba(255,255,255,0.3)' : colorText,
                color: chatOpen ? '#fff' : '#fff',
                borderRadius: '50%', width: 16, height: 16, fontSize: 10, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{chat.messages.filter(m => m.role === 'assistant').length}</span>
            )}
          </button>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Main content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {activeTab === 'dashboard' && dashboard}
          {activeTab === 'today' && today}
          {activeTab === 'actions' && actions}
          {activeTab === 'history' && history}
          {activeTab === 'settings' && settings}
          {activeTab === 'chat' && (
            <div style={{ maxWidth: 720, margin: '0 auto' }}>
              <ChatView
                messages={chat.messages} input={chat.input} setInput={chat.setInput}
                send={chat.send} streaming={chat.streaming} clear={chat.clear}
                starters={starters} agentColor={agentColor}
                showToolCalls={showToolCalls} setShowToolCalls={setShowToolCalls}
                inputRef={inputRef} bottomRef={bottomRef}
              />
            </div>
          )}
        </div>

        {/* Command center + chat panel */}
        {(chatOpen || commandCenter) && (
          <div style={{
            width: chatOpen ? 400 : 280, flexShrink: 0,
            background: 'var(--panel)', borderLeft: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            transition: 'width .2s',
          }}>
            {/* Command center */}
            {commandCenter && (
              <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Terminal size={11} /> Context
                </div>
                {commandCenter}
              </div>
            )}

            {/* Slide-in chat */}
            {chatOpen && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Chat</span>
                    <button onClick={() => setShowToolCalls(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--muted)', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'Raleway' }}>
                      <Terminal size={10} /> {showToolCalls ? 'Hide' : 'Show'} tools
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {chat.messages.length > 0 && (
                      <button onClick={chat.clear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, borderRadius: 6 }}>
                        <Trash2 size={13} />
                      </button>
                    )}
                    <button onClick={() => setChatOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, borderRadius: 6 }}>
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <ChatView
                    messages={chat.messages} input={chat.input} setInput={chat.setInput}
                    send={chat.send} streaming={chat.streaming} clear={chat.clear}
                    starters={starters} agentColor={agentColor} compact
                    showToolCalls={showToolCalls} setShowToolCalls={setShowToolCalls}
                    inputRef={inputRef} bottomRef={bottomRef}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Chat view (shared between tab and slide-in panel) ─────────────────────
function ChatView({ messages, input, setInput, send, streaming, clear, starters, agentColor, compact = false, showToolCalls, setShowToolCalls, inputRef, bottomRef }: {
  messages: ChatMessage[]
  input: string
  setInput: (v: string) => void
  send: (text?: string) => void
  streaming: boolean
  clear: () => void
  starters: string[]
  agentColor: string
  compact?: boolean
  showToolCalls: boolean
  setShowToolCalls: (v: boolean) => void
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  bottomRef: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: compact ? '12px 16px' : '0 0 16px' }}>
        {messages.length === 0 && starters.length > 0 && (
          <div style={{ padding: compact ? 0 : '24px 0' }}>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12, fontFamily: 'Lato' }}>Suggested questions:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {starters.map(s => (
                <button key={s} onClick={() => send(s)} style={{
                  textAlign: 'left', padding: '8px 12px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--faint)',
                  color: 'var(--text)', cursor: 'pointer', fontSize: 12,
                  fontFamily: 'Lato', transition: 'background .1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = `${agentColor}10`}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--faint)'}
                >{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
              <div style={{
                width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                background: msg.role === 'user' ? agentColor : 'var(--faint)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
              }}>
                {msg.role === 'user' ? <User size={13} color="#fff" /> : <Bot size={13} color="var(--muted)" />}
              </div>
              <div style={{
                maxWidth: '85%', padding: '10px 14px', borderRadius: 12,
                background: msg.role === 'user' ? agentColor : 'var(--panel2)',
                color: msg.role === 'user' ? '#fff' : 'var(--text)',
                border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                fontSize: 13, fontFamily: 'Lato', lineHeight: 1.6,
                borderTopRightRadius: msg.role === 'user' ? 4 : 12,
                borderTopLeftRadius: msg.role === 'assistant' ? 4 : 12,
              }}>
                {msg.isLoading ? (
                  <Loader2 size={14} style={{ animation: 'spin .8s linear infinite', color: 'var(--muted)' }} />
                ) : (
                  <MarkdownContent text={msg.content} isUser={msg.role === 'user'} />
                )}
              </div>
            </div>
            {/* Tool calls */}
            {showToolCalls && msg.toolResults && msg.toolResults.length > 0 && (
              <div style={{ marginLeft: 34, marginTop: 6 }}>
                {msg.toolResults.map((t, i) => (
                  <div key={i} style={{
                    padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
                    background: 'var(--faint)', fontSize: 11, fontFamily: 'monospace',
                    color: (t as {ok:boolean}).ok ? 'var(--muted)' : '#dc2626',
                    display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
                  }}>
                    <Terminal size={10} />
                    {(t as {ok:boolean; message:string}).ok ? '✓' : '✗'} {(t as {message:string}).message?.slice(0, 80)}
                  </div>
                ))}
              </div>
            )}
            {/* Routed to badge */}
            {msg.routedTo && msg.routedTo !== 'assistant' && (
              <div style={{ marginLeft: 34, marginTop: 4 }}>
                <span style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ChevronRight size={10} /> routed to {msg.routedTo}
                </span>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        flexShrink: 0, padding: compact ? '12px 16px' : '12px 0 0',
        borderTop: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }}}
            placeholder="Ask the agent…"
            rows={1}
            style={{
              flex: 1, padding: '9px 12px', borderRadius: 10, resize: 'none',
              border: '1px solid var(--border)', background: 'var(--faint)',
              color: 'var(--text)', fontFamily: 'Lato, sans-serif', fontSize: 13,
              outline: 'none', lineHeight: 1.5, maxHeight: 120, overflowY: 'auto',
            }}
          />
          <button onClick={() => send()} disabled={!input.trim() || streaming} style={{
            width: 36, height: 36, borderRadius: 10, border: 'none', flexShrink: 0,
            background: input.trim() && !streaming ? agentColor : 'var(--faint)',
            color: input.trim() && !streaming ? '#fff' : 'var(--muted)',
            cursor: input.trim() && !streaming ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all .15s',
          }}>
            {streaming ? <Loader2 size={14} style={{ animation: 'spin .8s linear infinite' }} /> : <Send size={14} />}
          </button>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 10, color: 'var(--muted)', fontFamily: 'Lato' }}>
          Enter to send · Shift+Enter for new line
        </p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
