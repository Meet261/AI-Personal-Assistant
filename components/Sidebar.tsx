'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard, FolderKanban, CheckSquare,
  BookOpen, MessageSquare, Sunrise, Moon, Bot,
  Leaf, Command, Timer, Layers, Flame,
} from 'lucide-react'
import { useCmdK } from './CmdKProvider'

const nav = [
  { href: '/',                 label: 'Dashboard',      icon: LayoutDashboard },
  { href: '/projects',         label: 'Projects',       icon: FolderKanban },
  { href: '/tasks',            label: 'Tasks',          icon: CheckSquare },
  { href: '/journal',          label: 'Journal',        icon: BookOpen },
  { href: '/checkin',          label: 'Daily Review',   icon: MessageSquare },
  { href: '/briefing/morning', label: 'Morning Brief',  icon: Sunrise },
  { href: '/briefing/evening', label: 'Evening Summary',icon: Moon },
  { href: '/agent',            label: 'AI Agent',       icon: Bot },
  { href: '/agents',           label: 'Agents Hub',     icon: Layers },
  { href: '/habits',           label: 'Habits',         icon: Flame },
  { href: '/timer',            label: 'Work Timer',     icon: Timer },
]

type Theme = 'nordic' | 'midnight' | 'calm' | 'paper'
const THEMES: { id: Theme; label: string }[] = [
  { id: 'nordic',   label: 'Light' },
  { id: 'midnight', label: 'Dark' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { setOpen, theme, setTheme, morning, evening } = useCmdK()
  const anyGenerating = morning.streaming || evening.streaming
  const [ollamaOk, setOllamaOk] = useState(false)

  useEffect(() => {
    let cancelled = false
    function check() {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 2000)
      fetch('http://localhost:11434/api/tags', { signal: controller.signal })
        .then(r => { if (!cancelled) setOllamaOk(r.ok) })
        .catch(() => { if (!cancelled) setOllamaOk(false) })
        .finally(() => clearTimeout(timeout))
    }
    check()
    const interval = setInterval(check, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  return (
    <>
    <aside style={{
      width: 228,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--panel)',
      borderRight: '1px solid var(--border)',
      boxShadow: '2px 0 16px rgba(10,46,44,.06)',
    }}>

      {/* ── Logo ── */}
      <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg, #134E4A 0%, #0F766E 60%, #2DD4BF 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(19,78,74,.35)',
          }}>
            <Leaf size={18} color="#fff" strokeWidth={2.5} />
          </div>
          <div>
            <p style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 900, fontSize: 14, color: 'var(--text)', margin: 0, lineHeight: 1.2 }}>
              Personal OS
            </p>
            <p style={{ fontFamily: 'Lato, sans-serif', fontSize: 11, color: 'var(--muted)', margin: 0 }}>
              AI-powered
            </p>
          </div>
        </div>
      </div>

      {/* ── Cmd+K Search ── */}
      <div style={{ padding: '12px 14px 8px' }}>
        <button onClick={() => setOpen(true)} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 12px', borderRadius: 10,
          background: 'var(--faint)', border: '1px solid var(--border)',
          cursor: 'pointer', transition: 'all .15s',
        }}
          onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = 'var(--brand2)'; el.style.background = 'var(--faint2)' }}
          onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = 'var(--border)'; el.style.background = 'var(--faint)' }}>
          <Command size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          <span style={{ fontFamily: 'Lato, sans-serif', fontSize: 12, color: 'var(--subtle)', flex: 1, textAlign: 'left' }}>
            Search or add task…
          </span>
          <kbd style={{ fontSize: 10, fontFamily: 'monospace', background: 'var(--faint2)', border: '1px solid var(--border)', borderRadius: 5, padding: '1px 5px', color: 'var(--muted)', flexShrink: 0 }}>
            ⌘K
          </kbd>
        </button>
      </div>

      {/* ── Nav ── */}
      <nav style={{ flex: 1, padding: '4px 10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href))
          return (
            <Link key={href} href={href} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 10, textDecoration: 'none',
              fontFamily: 'Raleway, sans-serif', fontWeight: active ? 700 : 500,
              fontSize: 13, transition: 'all .15s',
              background: active ? 'var(--active)' : 'transparent',
              color: active ? 'var(--brand)' : 'var(--muted)',
              borderLeft: `3px solid ${active ? 'var(--brand)' : 'transparent'}`,
            }}
              onMouseEnter={e => { if (!active) { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--hover)'; el.style.color = 'var(--brand)' } }}
              onMouseLeave={e => { if (!active) { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.color = 'var(--muted)' } }}>
              <Icon size={15} style={{ flexShrink: 0, color: active ? 'var(--brand)' : 'var(--muted)', transition: 'color .15s' }} />
              {label}
              {((href === '/briefing/morning' && morning.streaming) || (href === '/briefing/evening' && evening.streaming)) && (
                <span style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: 'var(--brand2)', boxShadow: '0 0 6px var(--brand2)', flexShrink: 0, animation: 'pulse 1.5s ease-in-out infinite' }} />
              )}
            </Link>
          )
        })}
      </nav>

      {/* ── Ollama status ── */}
      <div style={{ padding: '0 12px 10px' }}>
        <div style={{
          padding: '10px 12px', borderRadius: 10,
          background: 'rgba(45,212,191,.08)',
          border: '1px solid rgba(45,212,191,.20)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: ollamaOk ? '#059669' : '#ff5c7a', boxShadow: ollamaOk ? '0 0 5px #05966980' : '0 0 5px #ff5c7a80', flexShrink: 0 }} />
            <span style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 11, color: ollamaOk ? 'var(--brand)' : '#ff5c7a' }}>
              Ollama · {ollamaOk ? 'Running' : 'Offline'}
            </span>
          </div>
          <p style={{ fontFamily: 'Lato, sans-serif', fontSize: 10, color: 'var(--muted)', margin: '3px 0 0' }}>
            deepseek-r1:7b
          </p>
        </div>
      </div>

      {/* ── Theme switcher ── */}
      <div style={{ padding: '0 12px 10px' }}>
        <div style={{ display: 'flex', gap: 3, padding: 4, borderRadius: 10, background: 'var(--faint)', border: '1px solid var(--border)' }}>
          {THEMES.map(t => (
            <button key={t.id} onClick={() => setTheme(t.id)}
              style={{
                flex: 1, padding: '5px 0', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 10, transition: 'all .15s',
                background: theme === t.id ? 'var(--brand)' : 'transparent',
                color: theme === t.id ? '#fff' : 'var(--muted)',
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── User ── */}
      <div style={{ padding: '12px 16px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10, flexShrink: 0,
          background: 'linear-gradient(135deg, #134E4A, #2DD4BF)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Raleway, sans-serif', fontWeight: 900, fontSize: 14, color: '#fff',
        }}>
          M
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 12, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Mangroliya
          </p>
          <p style={{ fontFamily: 'Lato, sans-serif', fontSize: 10, color: 'var(--muted)', margin: 0 }}>
            Local AI · Private
          </p>
        </div>
      </div>
    </aside>
    <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }`}</style>
    </>
  )
}
