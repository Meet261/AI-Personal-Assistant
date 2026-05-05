'use client'
import React, { useEffect, useState, useCallback } from 'react'
import type { Task, Project } from '@/lib/types'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { Plus, CheckCircle2, Circle, Clock, Trash2, LayoutList, Columns, Table2, Command, ChevronRight, MoreVertical, Edit2 } from 'lucide-react'
import { useCmdK } from '@/components/CmdKProvider'
import ConfirmDialog from '@/components/ConfirmDialog'
import TaskDrawer from '@/components/TaskDrawer'

type ViewMode = 'list' | 'kanban' | 'table'

const PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const
const EFFORTS    = ['S', 'M', 'L', 'XL'] as const

const PS: Record<string, { bg: string; text: string }> = {
  urgent: { bg: 'rgba(255,92,122,.15)',  text: '#ff5c7a' },
  high:   { bg: 'rgba(255,204,102,.12)', text: '#ffcc66' },
  medium: { bg: 'rgba(61,214,208,.12)',  text: '#3dd6d0' },
  low:    { bg: 'rgba(39,217,138,.12)',  text: '#27d98a' },
}
const SCORE: Record<string, number> = { urgent: 95, high: 75, medium: 55, low: 30 }

const KANBAN_COLS = [
  { key: 'todo',        label: 'Backlog'  },
  { key: 'in_progress', label: 'Doing'   },
  { key: 'deferred',    label: 'Blocked' },
  { key: 'done',        label: 'Done'    },
]

const inp: React.CSSProperties = {
  background: 'var(--faint)', border: '1px solid var(--border)', color: 'var(--text)',
  borderRadius: 10, padding: '9px 13px', fontSize: 13, fontFamily: 'Lato, sans-serif', outline: 'none', width: '100%',
}

function DelBtn({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <button onClick={onClick} title="Delete"
      style={{ background: 'none', border: '1px solid transparent', borderRadius: 8, cursor: 'pointer', color: 'var(--muted)', padding: '4px 6px', display: 'flex', alignItems: 'center', transition: 'all .15s', flexShrink: 0 }}
      onMouseEnter={e => { e.currentTarget.style.color = '#ff5c7a'; e.currentTarget.style.borderColor = 'rgba(255,92,122,.3)'; e.currentTarget.style.background = 'rgba(255,92,122,.08)' }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'none' }}>
      <Trash2 size={13} />
    </button>
  )
}

const ALL_STATUSES: { key: string; label: string }[] = [
  { key: 'todo',        label: 'Backlog'     },
  { key: 'in_progress', label: 'Doing'       },
  { key: 'deferred',    label: 'Blocked'     },
  { key: 'done',        label: 'Done'        },
]

function KanbanCardMenu({ task, onEdit, onDelete, onMove }: {
  task: Task
  onEdit: () => void
  onDelete: (e: React.MouseEvent) => void
  onMove: (status: string, e: React.MouseEvent) => void
}) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        style={{ background: 'none', border: '1px solid transparent', borderRadius: 8, cursor: 'pointer', color: 'var(--muted)', padding: '4px 6px', display: 'flex', alignItems: 'center', transition: 'all .15s' }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--faint)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'none' }}>
        <MoreVertical size={14} />
      </button>
      {open && (
        <div onClick={e => e.stopPropagation()} style={{
          position: 'absolute', right: 0, top: '110%', zIndex: 100, minWidth: 160,
          background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,.25)', overflow: 'hidden',
        }}>
          <button onClick={e => { e.stopPropagation(); setOpen(false); onEdit() }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'Raleway, sans-serif', fontWeight: 700, color: 'var(--text)', textAlign: 'left' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--faint)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
            <Edit2 size={12} /> Edit Task
          </button>
          <div style={{ height: 1, background: 'var(--border)' }} />
          <p style={{ fontSize: 10, fontWeight: 800, fontFamily: 'Raleway, sans-serif', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', padding: '8px 14px 4px', margin: 0 }}>Move to</p>
          {ALL_STATUSES.filter(s => s.key !== task.status).map(s => (
            <button key={s.key} onClick={e => { setOpen(false); onMove(s.key, e) }}
              style={{ display: 'block', width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'Raleway, sans-serif', fontWeight: 600, color: 'var(--muted)', textAlign: 'left' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--faint)'; e.currentTarget.style.color = 'var(--text)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--muted)' }}>
              → {s.label}
            </button>
          ))}
          <div style={{ height: 1, background: 'var(--border)' }} />
          <button onClick={e => { setOpen(false); onDelete(e) }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'Raleway, sans-serif', fontWeight: 700, color: '#ff5c7a', textAlign: 'left' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,92,122,.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
            <Trash2 size={12} /> Delete
          </button>
        </div>
      )}
    </div>
  )
}

export default function TasksPage() {
  const [tasks, setTasks]           = useState<Task[]>([])
  const [projects, setProjects]     = useState<Project[]>([])
  const [loading, setLoading]       = useState(true)
  const [view, setView]             = useState<ViewMode>('list')
  const [filter, setFilter]         = useState('all')
  const [projectFilter, setProjectFilter] = useState('all') // 'all' or project id
  const [showNew, setShowNew]       = useState(false)
  const [form, setForm]             = useState({ title: '', description: '', project_id: '', priority: 'medium', effort: 'M', deadline: '', scheduled_for: '' })
  const [saving, setSaving]         = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null)
  const [drawerTask, setDrawerTask]     = useState<Task | null>(null)
  const { setOpen } = useCmdK()

  const load = useCallback(async () => {
    const [t, p] = await Promise.all([
      supabase.from('tasks').select('*, project:projects(id, name, color)').order('priority').order('created_at', { ascending: false }),
      supabase.from('projects').select('*').eq('status', 'active'),
    ])
    setTasks(t.data || [])
    setProjects(p.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const today = format(new Date(), 'yyyy-MM-dd')

  // Apply both filters
  const byProject = projectFilter === 'all' ? tasks : tasks.filter(t => t.project_id === projectFilter)
  const filtered = filter === 'all'   ? byProject
    : filter === 'today'  ? byProject.filter(t => t.scheduled_for === today)
    : byProject.filter(t => t.status === filter)

  const emptyForm = { title: '', description: '', project_id: '', priority: 'medium', effort: 'M', deadline: '', scheduled_for: '' }

  async function addTask() {
    if (!form.title.trim()) return
    setSaving(true)
    const { data } = await supabase
      .from('tasks')
      .insert({
        title: form.title.trim(),
        description: form.description,
        project_id: form.project_id || null,
        priority: form.priority,
        effort: form.effort,
        deadline: form.deadline || null,
        scheduled_for: form.scheduled_for || null,
        status: 'todo',
      })
      .select('*, project:projects(id, name, color)')
      .single()
    setForm(emptyForm)
    setShowNew(false)
    setSaving(false)
    load()
    // Open drawer so they can further edit, comment, AI-schedule
    if (data) setDrawerTask(data as Task)
  }

  async function toggleDone(task: Task, e: React.MouseEvent) {
    e.stopPropagation()
    const next = task.status === 'done' ? 'todo' : 'done'
    await supabase.from('tasks').update({ status: next, completed_at: next === 'done' ? new Date().toISOString() : null }).eq('id', task.id)
    load()
  }


  async function moveStatus(task: Task, status: string, e: React.MouseEvent) {
    e.stopPropagation()
    await supabase.from('tasks').update({
      status,
      completed_at: status === 'done' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', task.id)
    load()
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    await supabase.from('tasks').delete().eq('id', deleteTarget.id)
    setDeleteTarget(null)
    load()
  }

  const tabs = [
    { key: 'all',         label: 'All'      },
    { key: 'today',       label: 'Today'    },
    { key: 'todo',        label: 'Backlog'  },
    { key: 'in_progress', label: 'Doing'    },
    { key: 'done',        label: 'Done'     },
  ]

  // Sync drawer task with latest data after saves
  function handleDrawerUpdated() {
    load()
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1080, margin: '0 auto' }}>

      {/* Drawer */}
      {drawerTask && (
        <TaskDrawer
          task={drawerTask}
          projects={projects}
          onClose={() => setDrawerTask(null)}
          onUpdated={handleDrawerUpdated}
          onDeleted={() => { setDrawerTask(null); load() }}
        />
      )}

      {/* Confirm delete */}
      {deleteTarget && (
        <ConfirmDialog
          title={`Delete "${deleteTarget.title}"?`}
          message="This task will be permanently removed."
          confirmLabel="Delete Task"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 900, fontSize: 24, color: 'var(--text)', margin: 0 }}>Tasks</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
            {tasks.filter(t => t.status !== 'done').length} open · {tasks.filter(t => t.status === 'done').length} done · click any task to edit
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* View switcher */}
          <div style={{ display: 'flex', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
            {([['list', LayoutList, 'List'], ['kanban', Columns, 'Kanban'], ['table', Table2, 'Table']] as [ViewMode, React.ElementType, string][]).map(([v, Icon, label]) => (
              <button key={v} onClick={() => setView(v)}
                style={{
                  padding: '8px 14px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                  fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 12,
                  background: view === v ? 'var(--active)' : 'var(--faint)',
                  color: view === v ? 'var(--brand)' : 'var(--muted)',
                  borderRight: '1px solid var(--border)', transition: 'background .15s',
                }}>
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
          <button onClick={() => setOpen(true)} className="btn-ghost" style={{ padding: '9px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Command size={13} /> Cmd+K
          </button>
          <button onClick={() => setShowNew(true)} className="btn-primary" style={{ padding: '9px 16px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> New Task
          </button>
        </div>
      </div>

      {/* ── 2 Filter Dropdowns ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Filter 1: Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Status</span>
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 10, padding: '7px 32px 7px 12px', fontSize: 13, fontFamily: 'Raleway, sans-serif', fontWeight: 700, cursor: 'pointer', outline: 'none', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a6b3d6' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}>
            <option value="all">All</option>
            <option value="today">Today</option>
            <option value="todo">Backlog</option>
            <option value="in_progress">Doing</option>
            <option value="deferred">Blocked</option>
            <option value="done">Done</option>
          </select>
        </div>

        <div style={{ width: 1, height: 28, background: 'var(--border)' }} />

        {/* Filter 2: Project */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Project</span>
          <select
            value={projectFilter}
            onChange={e => setProjectFilter(e.target.value)}
            style={{ background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 10, padding: '7px 32px 7px 12px', fontSize: 13, fontFamily: 'Raleway, sans-serif', fontWeight: 700, cursor: 'pointer', outline: 'none', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a6b3d6' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}>
            <option value="all">All Projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Active filter summary */}
        {(filter !== 'all' || projectFilter !== 'all') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{filtered.length} tasks</span>
            <button onClick={() => { setFilter('all'); setProjectFilter('all') }}
              style={{ fontSize: 11, color: 'var(--brand)', fontFamily: 'Raleway, sans-serif', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
              Clear filters ×
            </button>
          </div>
        )}
      </div>

      {/* Full add form */}
      {showNew && (
        <div className="card animate-fade-in" style={{ borderRadius: 'var(--r-lg)', padding: '20px 22px', marginBottom: 16 }}>
          <p style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 800, fontSize: 13, color: 'var(--text)', margin: '0 0 14px 0' }}>
            New Task
          </p>

          {/* Title — required */}
          <input
            autoFocus
            placeholder="Task title… *"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) addTask(); if (e.key === 'Escape') { setShowNew(false); setForm(emptyForm) } }}
            style={{ ...inp, fontSize: 14, fontWeight: 700, fontFamily: 'Raleway, sans-serif', marginBottom: 10 }}
          />

          {/* Description */}
          <textarea
            placeholder="Description (optional)"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={2}
            style={{ ...inp, resize: 'none', marginBottom: 14 }}
          />

          {/* Row 1: Priority + Effort + Project */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', color: 'var(--muted)', textTransform: 'uppercase', margin: '0 0 6px 0' }}>Priority</p>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {(['urgent','high','medium','low'] as const).map(p => (
                  <button key={p} onClick={() => setForm(f => ({ ...f, priority: p }))}
                    style={{
                      padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                      fontFamily: 'Raleway, sans-serif', cursor: 'pointer', border: 'none',
                      background: form.priority === p ? PS[p].bg : 'var(--faint)',
                      color: form.priority === p ? PS[p].text : 'var(--muted)',
                      outline: form.priority === p ? `1px solid ${PS[p].text}` : 'none',
                    }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', color: 'var(--muted)', textTransform: 'uppercase', margin: '0 0 6px 0' }}>Effort</p>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['S','M','L','XL'] as const).map(e => (
                  <button key={e} onClick={() => setForm(f => ({ ...f, effort: e }))}
                    style={{
                      padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 800,
                      fontFamily: 'monospace', cursor: 'pointer',
                      background: form.effort === e ? 'var(--brand)' : 'var(--faint)',
                      color: form.effort === e ? '#fff' : 'var(--muted)',
                      border: `1px solid ${form.effort === e ? 'var(--brand)' : 'var(--border)'}`,
                    }}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', color: 'var(--muted)', textTransform: 'uppercase', margin: '0 0 6px 0' }}>Project</p>
              <select value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))} style={inp}>
                <option value="">No project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          {/* Row 2: Deadline + Scheduled for */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', color: 'var(--muted)', textTransform: 'uppercase', margin: '0 0 6px 0' }}>Deadline</p>
              <input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} style={inp} />
            </div>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', color: 'var(--muted)', textTransform: 'uppercase', margin: '0 0 6px 0' }}>Schedule for</p>
              <input type="date" value={form.scheduled_for} onChange={e => setForm(f => ({ ...f, scheduled_for: e.target.value }))} style={inp} />
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={addTask} disabled={saving || !form.title.trim()} className="btn-primary"
              style={{ padding: '9px 20px', fontSize: 13, opacity: (!form.title.trim() || saving) ? 0.4 : 1 }}>
              {saving ? 'Adding…' : 'Add Task'}
            </button>
            <button onClick={() => { setShowNew(false); setForm(emptyForm) }} className="btn-ghost"
              style={{ padding: '9px 16px', fontSize: 13 }}>
              Cancel
            </button>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>
              Saves and opens drawer for comments &amp; AI scheduling
            </p>
          </div>
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {view === 'list' && (
        <div className="card" style={{ borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
          {loading ? (
            <>
              {[...Array(8)].map((_, i) => (
                <div key={i} style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--faint)', animation: 'pulse 1.5s ease-in-out infinite', flexShrink: 0 }} />
                  <div style={{ flex: 1, height: 13, borderRadius: 6, background: 'var(--faint)', animation: 'pulse 1.5s ease-in-out infinite', width: `${55 + (i % 4) * 10}%` }} />
                  <div style={{ width: 48, height: 18, borderRadius: 99, background: 'var(--faint)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                </div>
              ))}
            </>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '56px 0', textAlign: 'center' }}>
              <CheckCircle2 size={34} style={{ color: 'var(--muted)', opacity: 0.25, display: 'block', margin: '0 auto 10px' }} />
              <p style={{ color: 'var(--muted)', fontFamily: 'Raleway, sans-serif', margin: 0 }}>No tasks here</p>
              <button onClick={() => setShowNew(true)} style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--brand)', fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                + Add your first task
              </button>
            </div>
          ) : filtered.map((task, idx) => {
            const ps = PS[task.priority]
            return (
              <div key={task.id}
                onClick={() => setDrawerTask(task)}
                style={{
                  padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                  borderBottom: idx < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                  background: idx % 2 === 0 ? 'transparent' : 'var(--row)',
                  transition: 'background .12s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'var(--row)')}>

                <button onClick={e => toggleDone(task, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                  {task.status === 'done'
                    ? <CheckCircle2 size={18} style={{ color: 'var(--good)' }} />
                    : <Circle size={18} style={{ color: 'var(--muted)' }} />}
                </button>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: 13, fontWeight: 700, fontFamily: 'Raleway, sans-serif', color: 'var(--text)', margin: 0,
                    textDecoration: task.status === 'done' ? 'line-through' : 'none',
                    opacity: task.status === 'done' ? 0.45 : 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{task.title}</p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    {task.project && (
                      <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: (task.project as Project).color, display: 'inline-block', flexShrink: 0 }} />
                        {(task.project as Project).name}
                      </span>
                    )}
                    {task.deadline && (
                      <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: task.deadline < today ? 'var(--bad)' : 'var(--muted)' }}>
                        <Clock size={9} /> {task.deadline}
                      </span>
                    )}
                    {task.scheduled_for && (
                      <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        📅 {task.scheduled_for}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', background: ps.bg, color: ps.text }}>
                    {task.priority}
                  </span>
                  <span style={{ padding: '3px 8px', borderRadius: 8, fontSize: 11, fontWeight: 800, fontFamily: 'monospace', background: 'var(--faint)', color: 'var(--muted)' }}>
                    {task.effort}
                  </span>
                  <ChevronRight size={13} style={{ color: 'var(--muted)', opacity: 0.5 }} />
                  <DelBtn onClick={e => { e.stopPropagation(); setDeleteTarget(task) }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── KANBAN VIEW ── */}
      {view === 'kanban' && loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(220px, 1fr))', gap: 12 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="kanban-col">
              <div style={{ height: 13, borderRadius: 6, background: 'var(--faint)', animation: 'pulse 1.5s ease-in-out infinite', marginBottom: 14, width: '50%' }} />
              {[...Array(3)].map((__, j) => (
                <div key={j} className="card" style={{ borderRadius: 'var(--r)', padding: 12, marginBottom: 8 }}>
                  <div style={{ height: 12, borderRadius: 6, background: 'var(--faint)', animation: 'pulse 1.5s ease-in-out infinite', marginBottom: 8, width: '80%' }} />
                  <div style={{ height: 10, borderRadius: 6, background: 'var(--faint)', animation: 'pulse 1.5s ease-in-out infinite', width: '40%' }} />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {view === 'kanban' && !loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(220px, 1fr))', gap: 12, overflowX: 'auto' }}>
          {KANBAN_COLS.map(col => {
            const colTasks = filtered.filter(t => t.status === col.key)
            return (
              <div key={col.key} className="kanban-col">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 11, fontWeight: 800, fontFamily: 'Raleway, sans-serif', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.2em' }}>
                    {col.label}
                  </h3>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--muted)' }}>
                    {colTasks.length}
                  </span>
                </div>
                {colTasks.map(task => {
                  const ps = PS[task.priority]
                  return (
                    <div key={task.id} className="kcard" onClick={() => setDrawerTask(task)}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <p style={{ fontWeight: 800, fontSize: 13, fontFamily: 'Raleway, sans-serif', color: 'var(--text)', margin: 0, flex: 1 }}>{task.title}</p>
                        <KanbanCardMenu
                          task={task}
                          onEdit={() => setDrawerTask(task)}
                          onDelete={e => { e.stopPropagation(); setDeleteTarget(task) }}
                          onMove={async (status, e) => {
                            e.stopPropagation()
                            await supabase.from('tasks').update({
                              status,
                              completed_at: status === 'done' ? new Date().toISOString() : null,
                              updated_at: new Date().toISOString(),
                            }).eq('id', task.id)
                            load()
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                        {task.project && (
                          <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: (task.project as Project).color, display: 'inline-block' }} />
                            {(task.project as Project).name}
                          </span>
                        )}
                        {task.deadline && <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={9} /> {task.deadline}</span>}
                        <span className="badge">Effort: {task.effort}</span>
                        <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', background: ps.bg, color: ps.text }}>
                          {task.priority}
                        </span>
                      </div>
                    </div>
                  )
                })}
                {colTasks.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted)', fontSize: 12 }}>Empty</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── TABLE VIEW ── */}
      {view === 'table' && loading && (
        <div className="card" style={{ borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
          {[...Array(8)].map((_, i) => (
            <div key={i} style={{ padding: '12px 18px', display: 'flex', gap: 16, borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
              <div style={{ flex: 3, height: 12, borderRadius: 6, background: 'var(--faint)', animation: 'pulse 1.5s ease-in-out infinite', width: `${50 + (i % 4) * 10}%` }} />
              <div style={{ flex: 2, height: 12, borderRadius: 6, background: 'var(--faint)', animation: 'pulse 1.5s ease-in-out infinite' }} />
              <div style={{ flex: 1, height: 12, borderRadius: 6, background: 'var(--faint)', animation: 'pulse 1.5s ease-in-out infinite' }} />
              <div style={{ flex: 1, height: 18, borderRadius: 99, background: 'var(--faint)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            </div>
          ))}
        </div>
      )}
      {view === 'table' && !loading && (
        <div className="card" style={{ borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
          <table className="task-table">
            <thead>
              <tr>
                <th style={{ width: '32%' }}>Task</th>
                <th>Project</th>
                <th>Deadline</th>
                <th>Scheduled</th>
                <th>Effort</th>
                <th>Priority</th>
                <th style={{ textAlign: 'center', width: 90 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(task => {
                const ps   = PS[task.priority]
                const score = SCORE[task.priority] ?? 50
                const isOverdue = task.deadline && task.deadline < today
                return (
                  <tr key={task.id} onClick={() => setDrawerTask(task)}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td>
                      <div style={{ fontWeight: 800, fontSize: 13, fontFamily: 'Raleway, sans-serif', color: task.status === 'done' ? 'var(--muted)' : 'var(--text)', textDecoration: task.status === 'done' ? 'line-through' : 'none' }}>
                        {task.title}
                      </div>
                      {task.description && (
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                          {task.description}
                        </div>
                      )}
                    </td>
                    <td>
                      {task.project
                        ? <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: (task.project as Project).color, display: 'inline-block' }} />
                            {(task.project as Project).name}
                          </span>
                        : <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>}
                    </td>
                    <td>
                      {task.deadline
                        ? <span style={{ fontWeight: 800, fontSize: 12, color: isOverdue ? 'var(--bad)' : task.deadline === today ? 'var(--warn)' : 'var(--good)' }}>{task.deadline}</span>
                        : <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>}
                    </td>
                    <td>
                      {task.scheduled_for
                        ? <span style={{ fontSize: 12, color: 'var(--brand2)', fontWeight: 700 }}>📅 {task.scheduled_for}</span>
                        : <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>}
                    </td>
                    <td><span style={{ fontWeight: 900, fontFamily: 'monospace', fontSize: 13, color: 'var(--text)' }}>{task.effort}</span></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div className="prio-bar"><span className="prio-bar-fill" style={{ width: `${score}%` }} /></div>
                        <span style={{ fontWeight: 900, fontSize: 11, color: ps.text }}>{score}</span>
                      </div>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <button onClick={e => toggleDone(task, e)} title={task.status === 'done' ? 'Mark incomplete' : 'Mark done'}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: task.status === 'done' ? 'var(--good)' : 'var(--muted)', padding: 4, borderRadius: 6 }}>
                          {task.status === 'done' ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                        </button>
                        <DelBtn onClick={e => { e.stopPropagation(); setDeleteTarget(task) }} />
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontFamily: 'Raleway, sans-serif' }}>No tasks</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
