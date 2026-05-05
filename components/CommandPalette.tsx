'use client'
import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface ParsedTask {
  title: string
  project: string
  priority: string
  effort: string
  due: string
  score: number
}

interface Suggestion {
  icon: string
  title: string
  desc: string
  action: 'create' | 'create_tomorrow' | 'reprioritize' | 'nav'
  parsed?: ParsedTask
  href?: string
}

const QUICK_COMMANDS = [
  { icon: '📊', title: 'Go to Dashboard', href: '/' },
  { icon: '🗂️', title: 'Go to Projects', href: '/projects' },
  { icon: '✅', title: 'Go to Tasks', href: '/tasks' },
  { icon: '📓', title: 'Open Journal', href: '/journal' },
  { icon: '🌅', title: 'Morning Briefing', href: '/briefing/morning' },
  { icon: '🌙', title: 'Evening Summary', href: '/briefing/evening' },
  { icon: '✏️', title: 'Start Check-in', href: '/checkin' },
  { icon: '🤖', title: 'Talk to AI Agent', href: '/agent' },
]

export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [parsing, setParsing] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [selected, setSelected] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (!query.trim()) { setSuggestions([]); return }

    // Debounce NLP parsing
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      // If it looks like a task creation command, call Ollama to parse it
      const looksLikeTask = /\b(add|create|new|make|task|todo|remind|fix|build|write|finish|complete|update|review|call|schedule|send)\b/i.test(query)
      if (looksLikeTask) {
        setParsing(true)
        try {
          const res = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'deepseek-r1:7b',
              systemPrompt: 'You parse natural language task descriptions. Always respond with valid JSON only. No explanation.',
              messages: [{
                role: 'user',
                content: `Parse this task: "${query}"

Return JSON only:
{"title":"short task title","project":"project name or empty string","priority":"urgent|high|medium|low","effort":"S|M|L|XL","due":"YYYY-MM-DD or empty string","score":0-100}`
              }]
            })
          })
          const reader = res.body!.getReader()
          const decoder = new TextDecoder()
          let raw = ''
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            raw += decoder.decode(value)
          }
          const match = raw.match(/\{[\s\S]*?\}/)
          if (match) {
            const parsed: ParsedTask = JSON.parse(match[0])
            setSuggestions([
              {
                icon: '+',
                title: `Create task: "${parsed.title}"`,
                desc: `Project: ${parsed.project || 'none'} · Due: ${parsed.due || 'none'} · Effort: ${parsed.effort} · Priority score: ${parsed.score}`,
                action: 'create',
                parsed,
              },
              {
                icon: '→',
                title: `Schedule for tomorrow: "${parsed.title}"`,
                desc: 'Place in Next and timebox 90 min tomorrow morning',
                action: 'create_tomorrow',
                parsed,
              },
              {
                icon: '↻',
                title: 'Re-run AI prioritization (7B)',
                desc: 'Recalculate today\'s top 3 based on deadlines, blocks, and effort',
                action: 'reprioritize',
              },
            ])
          }
        } catch {
          setSuggestions([])
        } finally {
          setParsing(false)
        }
      } else {
        // Nav search
        const filtered = QUICK_COMMANDS.filter(c => c.title.toLowerCase().includes(query.toLowerCase()))
        setSuggestions(filtered.map(c => ({ icon: c.icon, title: c.title, desc: '', action: 'nav', href: c.href })))
      }
    }, 500)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query])

  async function execute(s: Suggestion) {
    if (s.action === 'nav' && s.href) {
      window.location.href = s.href
      onClose()
      return
    }

    if ((s.action === 'create' || s.action === 'create_tomorrow') && s.parsed) {
      setSaving(true)
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
      const tomorrowStr = tomorrow.toISOString().slice(0, 10)

      await supabase.from('tasks').insert({
        title: s.parsed.title,
        priority: s.parsed.priority || 'medium',
        effort: s.parsed.effort || 'M',
        status: s.action === 'create_tomorrow' ? 'todo' : 'todo',
        deadline: s.parsed.due || null,
        scheduled_for: s.action === 'create_tomorrow' ? tomorrowStr : new Date().toISOString().slice(0, 10),
        description: `Created via Cmd+K: "${query}"`,
      })
      setSaving(false)
      setSaved(true)
      setTimeout(() => { setSaved(false); onClose() }, 1200)
      return
    }

    if (s.action === 'reprioritize') {
      onClose()
      window.location.href = '/briefing/morning'
    }
  }

  function onKey(e: React.KeyboardEvent) {
    const list = suggestions.length ? suggestions : QUICK_COMMANDS.map(c => ({ ...c, action: 'nav' as const, desc: '' }))
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(i => (i + 1) % list.length) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(i => (i - 1 + list.length) % list.length) }
    if (e.key === 'Enter' && list[selected]) { execute(list[selected]) }
  }

  const displayList: Suggestion[] = suggestions.length
    ? suggestions
    : QUICK_COMMANDS.map(c => ({ icon: c.icon, title: c.title, desc: 'Navigate', action: 'nav', href: c.href }))

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette-box" onClick={e => e.stopPropagation()}>
        {/* Input */}
        <div style={{ padding: '12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--muted)', fontSize: 18, flexShrink: 0 }}>
            {parsing ? '⏳' : '⌘'}
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected(0) }}
            onKeyDown={onKey}
            placeholder='Add a task to WebApp to fix login bug by Friday…'
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text)', fontSize: 14, fontFamily: 'Lato, sans-serif',
            }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
          )}
          <kbd style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)', border: '1px solid var(--border)', background: 'var(--faint)', padding: '3px 7px', borderRadius: 7, flexShrink: 0 }}>Esc</kbd>
        </div>

        {/* Label */}
        {!query && (
          <div style={{ padding: '8px 14px 4px', fontSize: 11, color: 'var(--muted)', fontFamily: 'Raleway, sans-serif', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>
            Quick navigation
          </div>
        )}
        {query && parsing && (
          <div style={{ padding: '8px 14px 4px', fontSize: 11, color: 'var(--muted)', fontFamily: 'Raleway, sans-serif', fontWeight: 700 }}>
            🤖 Parsing with DeepSeek R1 7b…
          </div>
        )}
        {query && !parsing && suggestions.length > 0 && (
          <div style={{ padding: '8px 14px 4px', fontSize: 11, color: 'var(--muted)', fontFamily: 'Raleway, sans-serif', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>
            AI suggestions
          </div>
        )}

        {/* List */}
        <div style={{ padding: 10, maxHeight: 380, overflowY: 'auto' }}>
          {saved ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--good)', fontFamily: 'Raleway, sans-serif', fontWeight: 700 }}>
              ✓ Task created successfully!
            </div>
          ) : displayList.map((s, i) => (
            <button key={i} onClick={() => execute(s)}
              style={{
                width: '100%', textAlign: 'left', background: i === selected ? 'var(--active)' : 'var(--faint)',
                border: `1px solid ${i === selected ? 'var(--brand2)' : 'var(--border)'}`,
                borderRadius: 14, padding: '11px 13px', marginBottom: 8, cursor: 'pointer',
                display: 'flex', alignItems: 'flex-start', gap: 12, transition: 'all 0.1s',
              }}
              onMouseEnter={() => setSelected(i)}>
              <div style={{
                width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                background: i === selected ? 'var(--chip-bg)' : 'var(--faint2)',
                border: '1px solid var(--border2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 900,
              }}>
                {s.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 13, fontFamily: 'Raleway, sans-serif', color: 'var(--text)' }}>{s.title}</div>
                {s.desc && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3, lineHeight: 1.4 }}>{s.desc}</div>}
                {s.parsed && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {s.parsed.project && <span className="badge">📁 {s.parsed.project}</span>}
                    {s.parsed.due && <span className="badge">📅 {s.parsed.due}</span>}
                    <span className="badge">Effort: {s.parsed.effort}</span>
                    <span className="badge">Priority: {s.parsed.score}</span>
                    <span className="badge"><span className="spark" /> DeepSeek</span>
                  </div>
                )}
              </div>
              {saving && i === selected && (
                <div style={{ color: 'var(--muted)', fontSize: 12, flexShrink: 0 }}>Saving…</div>
              )}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato, sans-serif' }}>↑↓ navigate</span>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato, sans-serif' }}>↵ select</span>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato, sans-serif', marginLeft: 'auto' }}>
            Local AI · DeepSeek R1 7b
          </span>
        </div>
      </div>
    </div>
  )
}
