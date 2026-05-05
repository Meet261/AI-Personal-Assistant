'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import type { Task, Project, TaskComment } from '@/lib/types'
import { supabase } from '@/lib/supabase'
import { format, parseISO } from 'date-fns'
import {
  X, Trash2, CheckCircle2, Circle, Calendar, Zap,
  Send, Loader2, Clock, Layers, AlignLeft, Tag, BarChart2
} from 'lucide-react'
import ConfirmDialog from './ConfirmDialog'

const PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const
const EFFORTS    = ['S', 'M', 'L', 'XL'] as const
const STATUSES = [
  { key: 'todo',        label: 'Backlog'  },
  { key: 'in_progress', label: 'Doing'    },
  { key: 'done',        label: 'Done'     },
  { key: 'deferred',    label: 'Blocked'  },
] as const

const PS: Record<string, { bg: string; color: string }> = {
  urgent: { bg: 'rgba(255,92,122,.15)',  color: '#ff5c7a' },
  high:   { bg: 'rgba(255,204,102,.12)', color: '#ffcc66' },
  medium: { bg: 'rgba(61,214,208,.12)',  color: '#3dd6d0' },
  low:    { bg: 'rgba(39,217,138,.12)',  color: '#27d98a' },
}

const inp: React.CSSProperties = {
  background: 'var(--faint)', border: '1px solid var(--border)', color: 'var(--text)',
  borderRadius: 10, padding: '8px 12px', fontSize: 13, fontFamily: 'Lato, sans-serif',
  outline: 'none', width: '100%', transition: 'border-color .2s',
}

interface Props {
  task: Task
  projects: Project[]
  onClose: () => void
  onUpdated: () => void
  onDeleted: () => void
}

export default function TaskDrawer({ task, projects, onClose, onUpdated, onDeleted }: Props) {
  const [form, setForm] = useState({
    title:        task.title,
    description:  task.description || '',
    priority:     task.priority,
    effort:       task.effort,
    status:       task.status,
    deadline:     task.deadline || '',
    scheduled_for: task.scheduled_for || '',
    project_id:   task.project_id || '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [comments, setComments] = useState<TaskComment[]>([])
  const [newComment, setNewComment] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [scheduleMsg, setScheduleMsg] = useState('')
  const [showDelete, setShowDelete] = useState(false)
  const commentRef = useRef<HTMLTextAreaElement>(null)
  const commentsEndRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  const loadComments = useCallback(async () => {
    const res = await fetch(`/api/comments?task_id=${task.id}`)
    if (res.ok) setComments(await res.json())
  }, [task.id])

  useEffect(() => { loadComments() }, [loadComments])

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments])

  async function save() {
    setSaving(true)
    await supabase.from('tasks').update({
      ...form,
      project_id: form.project_id || null,
      deadline: form.deadline || null,
      scheduled_for: form.scheduled_for || null,
      updated_at: new Date().toISOString(),
    }).eq('id', task.id)
    setSaving(false)
    onClose()
    onUpdated()
  }

  async function aiSchedule() {
    setScheduling(true)
    setScheduleMsg('')
    try {
      const res = await fetch('/api/ai/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: task.id }),
      })
      const data = await res.json()
      if (data.scheduled_for) {
        setForm(f => ({ ...f, scheduled_for: data.scheduled_for }))
        setScheduleMsg(`AI scheduled for ${data.scheduled_for}`)
        onUpdated()
      }
    } catch {
      setScheduleMsg('Could not reach Ollama')
    } finally {
      setScheduling(false)
    }
  }

  async function postComment() {
    if (!newComment.trim()) return
    setPostingComment(true)
    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: task.id, body: newComment.trim() }),
    })
    if (res.ok) {
      setNewComment('')
      await loadComments()
      commentRef.current?.focus()
    } else {
      const err = await res.json().catch(() => ({}))
      console.error('Comment post failed:', err)
    }
    setPostingComment(false)
  }

  async function deleteComment(id: string) {
    const res = await fetch(`/api/comments?id=${id}`, { method: 'DELETE' })
    if (res.ok) setComments(c => c.filter(x => x.id !== id))
  }

  async function confirmDeleteTask() {
    await supabase.from('tasks').delete().eq('id', task.id)
    onDeleted()
    onClose()
  }

  const ps = PS[form.priority]

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(3px)', zIndex: 50, animation: 'fadeIn .15s ease-out' }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(560px, 100vw)',
        background: 'var(--panel)', borderLeft: '1px solid var(--border)',
        boxShadow: '-24px 0 80px rgba(0,0,0,.4)',
        zIndex: 51, display: 'flex', flexDirection: 'column',
        animation: 'slideInRight .2s ease-out',
      }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <button
            onClick={() => { form.status === 'done'
              ? setForm(f => ({ ...f, status: 'todo' }))
              : setForm(f => ({ ...f, status: 'done' }))
            }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
            {form.status === 'done'
              ? <CheckCircle2 size={20} style={{ color: 'var(--good)' }} />
              : <Circle size={20} style={{ color: 'var(--muted)' }} />}
          </button>
          <span style={{ flex: 1, fontFamily: 'Raleway, sans-serif', fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>
            Edit Task
          </span>
          <button onClick={() => setShowDelete(true)} title="Delete task"
            style={{ background: 'none', border: '1px solid transparent', borderRadius: 8, cursor: 'pointer', color: 'var(--muted)', padding: '5px 7px', transition: 'all .15s' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#ff5c7a'; e.currentTarget.style.borderColor = 'rgba(255,92,122,.3)'; e.currentTarget.style.background = 'rgba(255,92,122,.08)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'none' }}>
            <Trash2 size={15} />
          </button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

          {/* Title */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
              <AlignLeft size={11} /> Title
            </label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              style={{ ...inp, fontSize: 14, fontWeight: 700, fontFamily: 'Raleway, sans-serif' }}
              onFocus={e => (e.target.style.borderColor = 'var(--brand)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
          </div>

          {/* Description */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
              <AlignLeft size={11} /> Description
            </label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3} placeholder="Add details, context, links…"
              style={{ ...inp, resize: 'none' }}
              onFocus={e => (e.target.style.borderColor = 'var(--brand)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
          </div>

          {/* Grid fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            {/* Priority */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <BarChart2 size={11} /> Priority
              </label>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {PRIORITIES.map(p => (
                  <button key={p} onClick={() => setForm(f => ({ ...f, priority: p }))}
                    style={{
                      padding: '5px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', cursor: 'pointer', border: 'none', transition: 'all .15s',
                      background: form.priority === p ? PS[p].bg : 'var(--faint)',
                      color: form.priority === p ? PS[p].color : 'var(--muted)',
                      outline: form.priority === p ? `1px solid ${PS[p].color}` : 'none',
                    }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Effort */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <Zap size={11} /> Effort
              </label>
              <div style={{ display: 'flex', gap: 5 }}>
                {EFFORTS.map(e => (
                  <button key={e} onClick={() => setForm(f => ({ ...f, effort: e }))}
                    style={{
                      padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 800, fontFamily: 'monospace', cursor: 'pointer', border: '1px solid', transition: 'all .15s',
                      background: form.effort === e ? 'var(--brand)' : 'var(--faint)',
                      color: form.effort === e ? '#fff' : 'var(--muted)',
                      borderColor: form.effort === e ? 'var(--brand)' : 'var(--border)',
                    }}>
                    {e}
                  </button>
                ))}
              </div>
            </div>

            {/* Status */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <Tag size={11} /> Status
              </label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as typeof form.status }))} style={inp}>
                {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>

            {/* Project */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <Layers size={11} /> Project
              </label>
              <select value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))} style={inp}>
                <option value="">No project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {/* Deadline */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <Clock size={11} /> Deadline
              </label>
              <input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} style={inp} />
            </div>

            {/* Scheduled for */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <Calendar size={11} /> Scheduled for
              </label>
              <input type="date" value={form.scheduled_for} onChange={e => setForm(f => ({ ...f, scheduled_for: e.target.value }))} style={inp} />
            </div>
          </div>

          {/* AI Schedule button */}
          <div style={{ marginBottom: 20, padding: '12px 14px', borderRadius: 12, background: 'var(--ai-bg)', border: '1px solid var(--ai-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <p style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 12, color: 'var(--text)', margin: 0 }}>
                🤖 AI Smart Scheduling
              </p>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                {form.deadline
                  ? 'Will schedule 2 days before deadline'
                  : 'AI picks the best day based on priority & effort'}
              </p>
              {scheduleMsg && (
                <p style={{ fontSize: 11, color: 'var(--good)', marginTop: 3, fontWeight: 700, fontFamily: 'Raleway, sans-serif' }}>
                  ✓ {scheduleMsg}
                </p>
              )}
            </div>
            <button onClick={aiSchedule} disabled={scheduling}
              style={{
                padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, fontFamily: 'Raleway, sans-serif',
                background: 'var(--brand)', color: '#fff', border: 'none', cursor: scheduling ? 'not-allowed' : 'pointer',
                opacity: scheduling ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                boxShadow: '0 2px 10px rgba(124,92,255,.3)',
              }}>
              {scheduling ? <><Loader2 size={12} className="animate-spin" /> Scheduling…</> : <><Zap size={12} /> Auto-schedule</>}
            </button>
          </div>

          {/* Metadata */}
          <div style={{ marginBottom: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              Created {format(parseISO(task.created_at), 'MMM d, yyyy')}
            </span>
            {task.updated_at !== task.created_at && (
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                · Updated {format(parseISO(task.updated_at), 'MMM d')}
              </span>
            )}
          </div>

          {/* Comments */}
          <div>
            <p style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 800, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
              💬 Comments ({comments.length})
            </p>

            {comments.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12, fontStyle: 'italic' }}>
                No comments yet. Add context, blockers, or updates.
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {comments.map(c => (
                <div key={c.id} style={{
                  padding: '10px 12px', borderRadius: 12, background: 'var(--faint)',
                  border: '1px solid var(--border)', position: 'relative',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, margin: 0, flex: 1, whiteSpace: 'pre-wrap' }}>
                      {c.body}
                    </p>
                    <button onClick={() => deleteComment(c.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '2px 4px', borderRadius: 6, flexShrink: 0, transition: 'color .15s' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#ff5c7a')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                  <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 5 }}>
                    {format(parseISO(c.created_at), 'MMM d, yyyy · h:mm a')}
                  </p>
                </div>
              ))}
              <div ref={commentsEndRef} />
            </div>

            {/* Add comment */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea
                ref={commentRef}
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) postComment() }}
                placeholder="Add a comment… (Cmd+Enter to post)"
                rows={2}
                style={{ ...inp, resize: 'none', flex: 1 }}
              />
              <button onClick={postComment} disabled={postingComment || !newComment.trim()}
                style={{
                  padding: '10px 12px', borderRadius: 10, background: 'var(--brand)', color: '#fff',
                  border: 'none', cursor: 'pointer', opacity: (!newComment.trim() || postingComment) ? 0.4 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                {postingComment ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              </button>
            </div>
          </div>
        </div>

        {/* Footer — save */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, flexShrink: 0 }}>
          <button onClick={onClose} className="btn-ghost" style={{ padding: '9px 16px', fontSize: 13 }}>Discard</button>
          <button onClick={save} disabled={saving || !form.title.trim()}
            className="btn-primary"
            style={{ padding: '9px 20px', fontSize: 13, flex: 1, opacity: (!form.title.trim() || saving) ? 0.5 : 1 }}>
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Confirm delete */}
      {showDelete && (
        <div style={{ zIndex: 60, position: 'fixed', inset: 0 }}>
          <ConfirmDialog
            title={`Delete "${task.title}"?`}
            message="This task and all its comments will be permanently removed."
            confirmLabel="Delete Task"
            onConfirm={confirmDeleteTask}
            onCancel={() => setShowDelete(false)}
          />
        </div>
      )}

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        .animate-spin { animation: spin .8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  )
}
