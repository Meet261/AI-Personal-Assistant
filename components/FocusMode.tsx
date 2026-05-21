'use client'
import { useEffect, useState } from 'react'
import { useCmdK } from './CmdKProvider'
import { loadActive, netElapsed } from '@/lib/timer'
import { X, Clock, Focus } from 'lucide-react'

function msToHHMMSS(ms: number) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export default function FocusMode() {
  const { focusMode, setFocusMode } = useCmdK()
  const [elapsed, setElapsed] = useState(0)
  const [session, setSession] = useState(() => loadActive())

  // Toggle on Ctrl+Shift+F
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setFocusMode(!focusMode)
      }
      if (e.key === 'Escape' && focusMode) setFocusMode(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [focusMode, setFocusMode])

  // Tick the timer and watch for session changes
  useEffect(() => {
    function sync() { setSession(loadActive()) }
    window.addEventListener('timer:update', sync)
    const tick = setInterval(() => {
      const active = loadActive()
      setSession(active)
      setElapsed(active ? netElapsed(active, Date.now()) : 0)
    }, 1000)
    return () => { window.removeEventListener('timer:update', sync); clearInterval(tick) }
  }, [])

  // Apply/remove sidebar + main dim via CSS classes on <body>
  useEffect(() => {
    if (focusMode) {
      document.body.classList.add('focus-mode')
    } else {
      document.body.classList.remove('focus-mode')
    }
    return () => document.body.classList.remove('focus-mode')
  }, [focusMode])

  if (!focusMode) return (
    <style>{`
      .focus-mode aside { opacity: 0.08 !important; pointer-events: none !important; transition: opacity .3s; }
      .focus-mode main  { filter: brightness(0.35); pointer-events: none; transition: filter .3s; }
    `}</style>
  )

  return (
    <>
      <style>{`
        .focus-mode aside { opacity: 0.08 !important; pointer-events: none !important; transition: opacity .3s; }
        .focus-mode main  { filter: brightness(0.35); pointer-events: none; transition: filter .3s; }
      `}</style>

      {/* Focus overlay — centred panel with task + timer */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 900,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <div style={{
          pointerEvents: 'auto',
          background: 'var(--panel)',
          borderRadius: 24,
          border: '1px solid var(--border2)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
          padding: '32px 44px',
          textAlign: 'center',
          minWidth: 340,
        }}>
          {/* Focus icon */}
          <div style={{ marginBottom: 16 }}>
            <Focus size={28} color="var(--brand)" style={{ opacity: 0.8 }} />
          </div>

          {/* Task name */}
          <div style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 900, fontSize: 20, color: 'var(--text)', marginBottom: 8, maxWidth: 320 }}>
            {session?.taskTitle ?? 'Deep work session'}
          </div>
          {session?.projectName && (
            <div style={{ fontSize: 13, color: 'var(--muted)', fontFamily: 'Lato, sans-serif', marginBottom: 20 }}>
              {session.projectName}
            </div>
          )}

          {/* Timer */}
          <div style={{
            fontSize: 48, fontWeight: 900, fontFamily: 'Raleway, sans-serif',
            color: session ? 'var(--brand)' : 'var(--muted)',
            letterSpacing: '-0.03em', marginBottom: 24,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {session ? msToHHMMSS(elapsed) : '00:00:00'}
          </div>

          {!session && (
            <p style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato, sans-serif', marginBottom: 20 }}>
              No task running — press Ctrl+S to start one
            </p>
          )}

          {/* Exit hint */}
          <button
            onClick={() => setFocusMode(false)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 18px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--faint)',
              color: 'var(--muted)', fontFamily: 'Raleway, sans-serif',
              fontWeight: 700, fontSize: 12, cursor: 'pointer',
            }}
          >
            <X size={13} /> Exit focus mode
            <kbd style={{ marginLeft: 4, padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 10, background: 'var(--panel)' }}>Esc</kbd>
          </button>
        </div>
      </div>
    </>
  )
}
