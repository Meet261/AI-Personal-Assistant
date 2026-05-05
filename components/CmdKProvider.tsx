'use client'
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import CommandPalette from './CommandPalette'

type Theme = 'nordic' | 'midnight' | 'calm' | 'paper'

export interface BriefingState {
  content: string
  priorities: string[]
  streaming: boolean
  done: boolean
  error: string | null
}

const EMPTY_BRIEFING: BriefingState = { content: '', priorities: [], streaming: false, done: false, error: null }

export interface AgentMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  ts: Date
  toolResults?: { ok: boolean; message: string; data?: unknown }[]
  isLoading?: boolean
}

interface CmdKCtx {
  open: boolean
  setOpen: (v: boolean) => void
  theme: Theme
  setTheme: (t: Theme) => void
  morning: BriefingState
  evening: BriefingState
  generateBriefing: (type: 'morning' | 'evening', date: string) => Promise<void>
  clearBriefing: (type: 'morning' | 'evening') => void
  // Agent state — persists across navigation
  agentMessages: AgentMessage[]
  setAgentMessages: React.Dispatch<React.SetStateAction<AgentMessage[]>>
  agentSessionId: string | null
  setAgentSessionId: (id: string | null) => void
}

const Ctx = createContext<CmdKCtx>({
  open: false, setOpen: () => {}, theme: 'nordic', setTheme: () => {},
  morning: EMPTY_BRIEFING, evening: EMPTY_BRIEFING,
  generateBriefing: async () => {}, clearBriefing: () => {},
  agentMessages: [], setAgentMessages: () => {},
  agentSessionId: null, setAgentSessionId: () => {},
})

export function useCmdK() { return useContext(Ctx) }

export default function CmdKProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [theme, setThemeState] = useState<Theme>('nordic')
  const [morning, setMorning] = useState<BriefingState>(EMPTY_BRIEFING)
  const [evening, setEvening] = useState<BriefingState>(EMPTY_BRIEFING)
  // Agent state — lives here so it persists when user navigates away from /agent
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([])
  const [agentSessionId, setAgentSessionId] = useState<string | null>(null)
  // Track active abort controllers so we can cancel on demand
  const abortRefs = useRef<{ morning?: AbortController; evening?: AbortController }>({})

  // Restore theme from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('theme') as Theme | null
    if (saved) {
      setThemeState(saved)
      document.documentElement.setAttribute('data-theme', saved)
    }
  }, [])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    document.documentElement.setAttribute('data-theme', t)
    localStorage.setItem('theme', t)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(o => !o) }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const clearBriefing = useCallback((type: 'morning' | 'evening') => {
    const set = type === 'morning' ? setMorning : setEvening
    set(EMPTY_BRIEFING)
  }, [])

  const generateBriefing = useCallback(async (type: 'morning' | 'evening', date: string) => {
    const set = type === 'morning' ? setMorning : setEvening

    // Cancel any in-progress generation for this type
    abortRefs.current[type]?.abort()
    const controller = new AbortController()
    abortRefs.current[type] = controller

    set({ content: '', priorities: [], streaming: true, done: false, error: null })

    try {
      const res = await fetch('/api/briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, date }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) throw new Error('Failed to start generation')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finalContent = ''
      let finalPriorities: string[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6))
            if (evt.token) {
              finalContent += evt.token
              set(prev => ({ ...prev, content: prev.content + evt.token }))
            }
            if (evt.done) {
              finalContent = evt.content
              finalPriorities = evt.top_priorities || []
              set({ content: evt.content, priorities: evt.top_priorities || [], streaming: false, done: true, error: null })
            }
            if (evt.error) throw new Error(evt.error)
          } catch { /* skip malformed */ }
        }
      }

      // Save to DB (fire-and-forget)
      if (finalContent) {
        fetch('/api/briefing', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, type, content: finalContent, top_priorities: finalPriorities }),
        })
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return // navigation away — keep partial content
      set(prev => ({ ...prev, streaming: false, done: false, error: 'Generation failed. Try again.' }))
    }
  }, [])

  return (
    <Ctx.Provider value={{ open, setOpen, theme, setTheme, morning, evening, generateBriefing, clearBriefing, agentMessages, setAgentMessages, agentSessionId, setAgentSessionId }}>
      {children}
      {open && <CommandPalette onClose={() => setOpen(false)} />}
    </Ctx.Provider>
  )
}
