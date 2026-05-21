'use client'
import { useState, useCallback, useRef, useEffect } from 'react'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  ts: Date
  toolResults?: { ok: boolean; message: string; data?: unknown }[]
  isLoading?: boolean
  routedTo?: string
}

function uid() { return Math.random().toString(36).slice(2) }

export function useAgentChat(agentId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const abortRef = useRef<AbortController | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const sessionKey = `agent-session-${agentId}`

  const setSession = (sid: string | null) => {
    sessionIdRef.current = sid
    setSessionId(sid)
  }

  // ── Load a specific session by ID ─────────────────────────────────────────
  const loadSession = useCallback(async (sid: string) => {
    setLoadingHistory(true)
    setMessages([])
    setSession(sid)
    try {
      const res = await fetch(`/api/agent-history?mode=messages&session_id=${sid}`)
      if (res.ok) {
        const msgs = await res.json()
        if (Array.isArray(msgs)) {
          setMessages(msgs.map((m: { id: string; role: string; content: string; tool_results: unknown[] | null; created_at: string }) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            ts: new Date(m.created_at),
            toolResults: (m.tool_results ?? []) as { ok: boolean; message: string; data?: unknown }[],
          })))
        }
      }
    } catch { /* ignore */ }
    localStorage.setItem(sessionKey, JSON.stringify({ sid, agentId }))
    setLoadingHistory(false)
  }, [agentId, sessionKey])

  // ── Load most recent session on mount ─────────────────────────────────────
  useEffect(() => {
    sessionIdRef.current = null
    setSessionId(null)
    setMessages([])
    setLoadingHistory(true)

    async function init() {
      const saved = localStorage.getItem(sessionKey)
      if (saved) {
        try {
          const { sid } = JSON.parse(saved)
          await loadSession(sid)
          return
        } catch { /* stale */ }
      }
      setLoadingHistory(false)
    }
    init()
  }, [agentId, sessionKey, loadSession])

  // ── Create a new session ──────────────────────────────────────────────────
  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current

    const res = await fetch('/api/agent-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create_session', agent_id: agentId }),
    })
    const data = await res.json()
    const sid = data.id as string
    setSession(sid)
    localStorage.setItem(sessionKey, JSON.stringify({ sid, agentId }))
    return sid
  }, [agentId, sessionKey])

  // ── Send a message ────────────────────────────────────────────────────────
  const send = useCallback(async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || streaming) return
    setInput('')

    const userMsg: ChatMessage = { id: uid(), role: 'user', content, ts: new Date() }
    const loadingId = uid()
    const loadingMsg: ChatMessage = { id: loadingId, role: 'assistant', content: '', ts: new Date(), isLoading: true }
    setMessages(prev => [...prev, userMsg, loadingMsg])
    setStreaming(true)

    abortRef.current = new AbortController()
    try {
      const sid = await ensureSession()

      const res = await fetch('/api/orchestrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages.slice(-10), userMsg].map(m => ({ role: m.role, content: m.content })),
          agentId,
          session_id: sid,
        }),
        signal: abortRef.current.signal,
      })
      if (!res.ok) throw new Error('Request failed')
      const data = await res.json()

      const assistantMsg: ChatMessage = {
        id: uid(),
        role: 'assistant',
        content: data.reply || '',
        ts: new Date(),
        toolResults: data.toolResults || [],
        routedTo: data.intent?.primaryAgent,
      }

      setMessages(prev => prev.map(m => m.id === loadingId ? { ...m, ...assistantMsg, isLoading: false } : m))

      // Auto-title after first user message
      if (messages.length === 0) {
        fetch('/api/agent-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'save_summary', session_id: sid, title: content.slice(0, 60) }),
        }).catch(() => {})
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        setMessages(prev => prev.filter(m => m.id !== loadingId))
      } else {
        const errMsg = (e as Error).message ?? ''
        const hint = errMsg.includes('timeout') || errMsg.includes('504') || errMsg.includes('AbortError')
          ? '⚠️ The model took too long to respond. Ollama is running but the request timed out — try again or ask something shorter.'
          : '⚠️ Could not reach the agent. Check your DeepSeek API key is set.'
        setMessages(prev => prev.map(m => m.id === loadingId ? { ...m, content: hint, isLoading: false } : m))
      }
    } finally {
      setStreaming(false)
    }
  }, [input, messages, streaming, agentId, ensureSession])

  // ── Start a new blank chat ────────────────────────────────────────────────
  const newChat = useCallback(() => {
    setMessages([])
    setSession(null)
    localStorage.removeItem(sessionKey)
  }, [sessionKey])

  // ── Delete a session ──────────────────────────────────────────────────────
  const deleteSession = useCallback(async (sid: string) => {
    await fetch(`/api/agent-history?session_id=${sid}`, { method: 'DELETE' })
    if (sessionIdRef.current === sid) newChat()
  }, [newChat])

  const cancel = useCallback(() => abortRef.current?.abort(), [])

  // Keep clear as alias for newChat for backward compat
  const clear = newChat

  return {
    messages, input, setInput, send, streaming,
    clear, newChat, cancel, loadingHistory, sessionId,
    loadSession, deleteSession,
  }
}
