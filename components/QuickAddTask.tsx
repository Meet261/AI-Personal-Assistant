'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, X, CheckCircle2 } from 'lucide-react'

interface Project { id: string; name: string; color: string }

const PRIORITIES = [
  { value: 'urgent', label: 'Urgent', color: '#ff5c7a' },
  { value: 'high',   label: 'High',   color: '#ffcc66' },
  { value: 'medium', label: 'Medium', color: '#3dd6d0' },
  { value: 'low',    label: 'Low',    color: '#27d98a' },
]

export default function QuickAddTask() {
  const [open, setOpen]           = useState(false)
  const [title, setTitle]         = useState('')
  const [description, setDesc]    = useState('')
  const [projectId, setProjectId] = useState('')
  const [priority, setPriority]   = useState('medium')
  const [projects, setProjects]   = useState<Project[]>([])
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/projects').then(r => r.json())
      .then(d => setProjects(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  // Global Ctrl+N shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input/textarea (other than our own)
      const tag = (e.target as HTMLElement)?.tagName
      if (e.ctrlKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'n') {
        if (!open && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')) return
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false) }
    }
    window.addEventListener('keydown', onKey, true) // capture phase so we beat other listeners
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  // Focus title on open; reset all fields on close
  useEffect(() => {
    if (open) {
      // Use requestAnimationFrame to ensure the element is painted before focusing
      requestAnimationFrame(() => titleRef.current?.focus())
    } else {
      setTitle(''); setDesc(''); setProjectId(''); setPriority('medium'); setSaved(false)
    }
  }, [open])

  const save = useCallback(async () => {
    if (!title.trim() || saving) return
    setSaving(true)
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || '',
        priority,
        project_id: projectId || null,
        status: 'todo',
      }),
    }).catch(() => null)
    setSaving(false)
    if (res?.ok !== false) {
      setSaved(true)
      setTimeout(() => setOpen(false), 600)
    }
  }, [title, description, priority, projectId, saving])

  const selectedPriority = PRIORITIES.find(p => p.value === priority)!
  const selectedProject  = projects.find(p => p.id === projectId)
  const canSave = title.trim().length > 0 && !saving

  if (!open) return null

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(10,20,30,0.6)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '14vh',
        animation: 'qaFadeIn .12s ease-out',
      }}
    >
      <form
        onSubmit={e => { e.preventDefault(); save() }}
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(560px,94vw)',
          background: 'var(--panel)',
          borderRadius: 20,
          border: '1px solid var(--border2)',
          boxShadow: '0 28px 72px rgba(0,0,0,0.4)',
          overflow: 'hidden',
          animation: 'qaSlideDown .16s ease-out',
        }}
      >
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px 10px' }}>
          <Plus size={17} color={canSave ? selectedPriority.color : 'var(--muted)'} style={{ flexShrink: 0, transition: 'color .2s' }} />
          <input
            ref={titleRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Task title…"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              fontSize: 17, fontWeight: 700, color: 'var(--text)',
              fontFamily: 'Raleway, sans-serif',
            }}
          />
          <button type="button" onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, borderRadius: 6, lineHeight: 0 }}>
            <X size={15} />
          </button>
        </div>

        {/* Description row */}
        <div style={{ padding: '0 20px 14px 49px' }}>
          <textarea
            value={description}
            onChange={e => setDesc(e.target.value)}
            placeholder="Add a description… (optional)"
            rows={2}
            style={{
              width: '100%', background: 'none', border: 'none', outline: 'none', resize: 'none',
              fontSize: 13, color: 'var(--text)', fontFamily: 'Lato, sans-serif', lineHeight: 1.5,
              opacity: 0.75, boxSizing: 'border-box',
            }}
            onKeyDown={e => {
              // Don't let Enter in description textarea submit the form
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save() }
            }}
          />
        </div>

        <div style={{ height: 1, background: 'var(--border)', margin: '0 0 12px' }} />

        {/* Priority + project row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 20px 14px', flexWrap: 'wrap' }}>
          {PRIORITIES.map(p => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPriority(p.value)}
              style={{
                padding: '5px 13px', borderRadius: 99, fontSize: 12, fontWeight: 700,
                fontFamily: 'Raleway, sans-serif', cursor: 'pointer',
                border: `1.5px solid ${priority === p.value ? p.color : 'var(--border)'}`,
                background: priority === p.value ? `${p.color}1a` : 'transparent',
                color: priority === p.value ? p.color : 'var(--muted)',
                transition: 'all .12s',
              }}
            >
              {p.label}
            </button>
          ))}

          <select
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            style={{
              marginLeft: 'auto', padding: '5px 10px', borderRadius: 8, fontSize: 12,
              border: '1.5px solid var(--border)',
              background: 'var(--faint)',
              color: selectedProject ? selectedProject.color : 'var(--muted)',
              fontFamily: 'Lato, sans-serif', fontWeight: 600, outline: 'none', cursor: 'pointer',
            }}
          >
            <option value="">No project</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px 16px', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato, sans-serif' }}>
            <kbd style={{ padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 10, background: 'var(--faint)' }}>↵</kbd>
            {' '}save &nbsp;·&nbsp;
            <kbd style={{ padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 10, background: 'var(--faint)' }}>Esc</kbd>
            {' '}cancel &nbsp;·&nbsp;
            <kbd style={{ padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 10, background: 'var(--faint)' }}>^N</kbd>
            {' '}toggle
          </span>

          <button
            type="submit"
            disabled={!canSave}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 20px', borderRadius: 11, border: 'none',
              background: saved ? '#22c55e' : canSave ? selectedPriority.color : 'var(--faint)',
              color: canSave ? '#fff' : 'var(--muted)',
              fontFamily: 'Raleway, sans-serif', fontWeight: 800, fontSize: 13,
              cursor: canSave ? 'pointer' : 'not-allowed',
              transition: 'all .15s',
              opacity: canSave ? 1 : 0.6,
            }}
          >
            {saved
              ? <><CheckCircle2 size={14} /> Saved!</>
              : saving ? 'Saving…'
              : <><Plus size={14} /> Add Task</>}
          </button>
        </div>
      </form>

      <style>{`
        @keyframes qaFadeIn   { from { opacity: 0 } to { opacity: 1 } }
        @keyframes qaSlideDown { from { opacity: 0; transform: translateY(-10px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
    </div>
  )
}
