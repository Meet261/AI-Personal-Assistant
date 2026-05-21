'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, X, CheckCircle2 } from 'lucide-react'

interface Project { id: string; name: string; color: string }

const PRIORITIES = [
  { value: 'urgent', label: 'Urgent',  color: '#ff5c7a' },
  { value: 'high',   label: 'High',    color: '#ffcc66' },
  { value: 'medium', label: 'Medium',  color: '#3dd6d0' },
  { value: 'low',    label: 'Low',     color: '#27d98a' },
]

export default function QuickAddTask() {
  const [open, setOpen]         = useState(false)
  const [title, setTitle]       = useState('')
  const [projectId, setProjectId] = useState('')
  const [priority, setPriority] = useState('medium')
  const [projects, setProjects] = useState<Project[]>([])
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load projects once
  useEffect(() => {
    fetch('/api/projects').then(r => r.json())
      .then(d => setProjects(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  // Global ⌘+Shift+N shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Focus + reset on open/close
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 40)
    } else {
      setTitle(''); setProjectId(''); setPriority('medium'); setSaved(false)
    }
  }, [open])

  const save = useCallback(async () => {
    if (!title.trim() || saving) return
    setSaving(true)
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        priority,
        project_id: projectId || null,
        status: 'todo',
      }),
    }).catch(() => {})
    setSaving(false)
    setSaved(true)
    setTimeout(() => setOpen(false), 700)
  }, [title, priority, projectId, saving])

  const selectedPriority = PRIORITIES.find(p => p.value === priority)!
  const selectedProject  = projects.find(p => p.id === projectId)

  if (!open) return null

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(10,20,30,0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '18vh',
        animation: 'fadeIn .12s ease-out',
      }}
    >
      <form
        onSubmit={e => { e.preventDefault(); save() }}
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(540px,92vw)',
          background: 'var(--panel)',
          borderRadius: 18,
          border: '1px solid var(--border2)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
          overflow: 'hidden',
          animation: 'slideDown .15s ease-out',
        }}
      >
        {/* Input row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <Plus size={16} color="var(--muted)" style={{ flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="New task…"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              fontSize: 16, fontWeight: 600, color: 'var(--text)',
              fontFamily: 'Raleway, sans-serif',
            }}
          />
          <button type="button" onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2 }}>
            <X size={15} />
          </button>
        </div>

        {/* Options row */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 18px', flexWrap: 'wrap' }}>
          {/* Priority pills */}
          {PRIORITIES.map(p => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPriority(p.value)}
              style={{
                padding: '5px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700,
                fontFamily: 'Raleway, sans-serif', cursor: 'pointer',
                border: `1.5px solid ${priority === p.value ? p.color : 'var(--border)'}`,
                background: priority === p.value ? `${p.color}18` : 'var(--faint)',
                color: priority === p.value ? p.color : 'var(--muted)',
                transition: 'all .12s',
              }}
            >
              {p.label}
            </button>
          ))}

          {/* Project picker */}
          <div style={{ marginLeft: 'auto' }}>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              style={{
                padding: '5px 10px', borderRadius: 8, fontSize: 12,
                border: '1.5px solid var(--border)',
                background: 'var(--faint)', color: selectedProject ? selectedProject.color : 'var(--muted)',
                fontFamily: 'Lato, sans-serif', fontWeight: 600, outline: 'none', cursor: 'pointer',
              }}
            >
              <option value="">No project</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 18px 14px', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato, sans-serif' }}>
            <kbd style={{ padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 10, background: 'var(--faint)' }}>↵</kbd>
            {' '}save &nbsp;·&nbsp;
            <kbd style={{ padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 10, background: 'var(--faint)' }}>Esc</kbd>
            {' '}cancel
          </span>
          <button
            onClick={save}
            disabled={!title.trim() || saving}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 18px', borderRadius: 10, border: 'none',
              background: saved ? '#22c55e' : title.trim() ? selectedPriority.color : 'var(--faint)',
              color: title.trim() ? '#fff' : 'var(--muted)',
              fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 13,
              cursor: title.trim() && !saving ? 'pointer' : 'default',
              transition: 'all .15s',
            }}
          >
            {saved
              ? <><CheckCircle2 size={14} /> Saved!</>
              : saving
              ? 'Saving…'
              : <><Plus size={14} /> Add Task</>
            }
          </button>
        </div>
      </form>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-12px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
    </div>
  )
}
