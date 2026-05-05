'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Task, Project } from '@/lib/types'
import { format, parseISO } from 'date-fns'
import {
  ArrowLeft, CheckCircle2, Circle, Clock, Trash2,
  Plus, Layers, TrendingUp, AlertCircle, CheckSquare,
  Calendar, BarChart2, Edit2, Archive, RotateCcw
} from 'lucide-react'
import ConfirmDialog from '@/components/ConfirmDialog'
import TaskDrawer from '@/components/TaskDrawer'

const PS: Record<string, { bg: string; text: string }> = {
  urgent: { bg: 'rgba(255,92,122,.15)',  text: '#ff5c7a' },
  high:   { bg: 'rgba(255,204,102,.12)', text: '#ffcc66' },
  medium: { bg: 'rgba(61,214,208,.12)',  text: '#3dd6d0' },
  low:    { bg: 'rgba(39,217,138,.12)',  text: '#27d98a' },
}

const STATUS_SECTIONS = [
  { key: 'in_progress', label: 'In Progress',  icon: TrendingUp,  color: '#3dd6d0' },
  { key: 'todo',        label: 'Backlog',       icon: Circle,      color: '#a6b3d6' },
  { key: 'deferred',   label: 'Blocked',       icon: AlertCircle, color: '#ffcc66' },
  { key: 'done',       label: 'Completed',     icon: CheckCircle2, color: '#27d98a' },
]

const inp: React.CSSProperties = {
  background: 'var(--faint)', border: '1px solid var(--border)', color: 'var(--text)',
  borderRadius: 10, padding: '8px 12px', fontSize: 13, fontFamily: 'Lato, sans-serif', outline: 'none', width: '100%',
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [project, setProject]       = useState<Project | null>(null)
  const [tasks, setTasks]           = useState<Task[]>([])
  const [allProjects, setAllProjects] = useState<Project[]>([])
  const [drawerTask, setDrawerTask] = useState<Task | null>(null)
  const [deleteTaskTarget, setDeleteTaskTarget] = useState<Task | null>(null)
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false)
  const [archiveProjectOpen, setArchiveProjectOpen] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [desc, setDesc]             = useState('')
  const [showAddTask, setShowAddTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')        // top "Add Task" button input
  const [sectionTaskTitle, setSectionTaskTitle] = useState('') // per-section inline input
  const [addingTask, setAddingTask] = useState(false)
  const [activeSection, setActiveSection] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [pRes, tRes, allP] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase.from('tasks').select('*, project:projects(id,name,color)').eq('project_id', id).order('priority').order('created_at', { ascending: false }),
      supabase.from('projects').select('*').eq('status', 'active'),
    ])
    setProject(pRes.data)
    setDesc(pRes.data?.description || '')
    setTasks(tRes.data || [])
    setAllProjects(allP.data || [])
  }, [id])

  useEffect(() => { load() }, [load])

  async function saveDesc() {
    await supabase.from('projects').update({ description: desc, updated_at: new Date().toISOString() }).eq('id', id)
    setEditingDesc(false)
    load()
  }

  async function quickAddTask(status = 'todo', fromSection = false) {
    const title = fromSection ? sectionTaskTitle.trim() : newTaskTitle.trim()
    if (!title) return
    setAddingTask(true)
    const { data } = await supabase.from('tasks')
      .insert({ title, project_id: id, priority: 'medium', effort: 'M', status })
      .select('*, project:projects(id,name,color)').single()
    if (fromSection) setSectionTaskTitle('')
    else setNewTaskTitle('')
    setShowAddTask(false)
    setActiveSection(null)
    setAddingTask(false)
    load()
    if (data) setDrawerTask(data as Task)
  }

  async function toggleDone(task: Task) {
    const next = task.status === 'done' ? 'todo' : 'done'
    await supabase.from('tasks').update({ status: next, completed_at: next === 'done' ? new Date().toISOString() : null }).eq('id', task.id)
    load()
  }

  async function deleteTask() {
    if (!deleteTaskTarget) return
    await supabase.from('tasks').delete().eq('id', deleteTaskTarget.id)
    setDeleteTaskTarget(null)
    load()
  }

  async function archiveProject() {
    await supabase.from('projects').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', id)
    router.push('/projects')
  }

  async function deleteProject() {
    await supabase.from('tasks').delete().eq('project_id', id)
    await supabase.from('projects').delete().eq('id', id)
    router.push('/projects')
  }

  function handleDrawerUpdated() {
    load()
  }

  if (!project) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--faint)', borderTopColor: 'var(--brand)', animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  const total = tasks.length
  const done  = tasks.filter(t => t.status === 'done').length
  const pct   = total ? Math.round((done / total) * 100) : 0
  const urgent = tasks.filter(t => t.priority === 'urgent' && t.status !== 'done').length
  const overdue = tasks.filter(t => t.deadline && t.deadline < format(new Date(), 'yyyy-MM-dd') && t.status !== 'done').length
  const today = format(new Date(), 'yyyy-MM-dd')

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000, margin: '0 auto' }}>

      {/* Drawers / dialogs */}
      {drawerTask && (
        <TaskDrawer task={drawerTask} projects={allProjects}
          onClose={() => setDrawerTask(null)}
          onUpdated={handleDrawerUpdated}
          onDeleted={() => { setDrawerTask(null); load() }} />
      )}
      {deleteTaskTarget && (
        <ConfirmDialog title={`Delete "${deleteTaskTarget.title}"?`}
          message="This task will be permanently removed."
          confirmLabel="Delete Task"
          onConfirm={deleteTask} onCancel={() => setDeleteTaskTarget(null)} />
      )}
      {archiveProjectOpen && (
        <ConfirmDialog title={`Archive "${project.name}"?`}
          message="The project and all its tasks will be archived. Nothing is deleted — you can restore it anytime from the Projects page."
          confirmLabel="Archive Project"
          onConfirm={archiveProject} onCancel={() => setArchiveProjectOpen(false)} />
      )}
      {deleteProjectOpen && (
        <ConfirmDialog title={`Delete "${project.name}"?`}
          message="This project will be permanently removed. This cannot be undone."
          warning={total > 0 ? `All ${total} task${total > 1 ? 's' : ''} inside this project will also be permanently deleted.` : undefined}
          confirmLabel="Delete Project"
          onConfirm={deleteProject} onCancel={() => setDeleteProjectOpen(false)} />
      )}

      {/* Back */}
      <button onClick={() => router.push('/projects')}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 13, fontFamily: 'Raleway, sans-serif', fontWeight: 600, marginBottom: 20, padding: 0 }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}>
        <ArrowLeft size={15} /> All Projects
      </button>

      {/* ── Project Header ── */}
      <div className="card" style={{ borderRadius: 20, overflow: 'hidden', marginBottom: 20 }}>
        {/* Color bar */}
        <div style={{ height: 4, background: project.color }} />
        <div style={{ padding: '22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${project.color}20`, flexShrink: 0 }}>
                <Layers size={22} style={{ color: project.color }} />
              </div>
              <div>
                <h1 style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 900, fontSize: 22, color: 'var(--text)', margin: 0 }}>{project.name}</h1>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', background: 'rgba(39,217,138,.12)', color: '#27d98a' }}>
                    {project.status.replace('_', ' ')}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Created {format(parseISO(project.created_at), 'MMM d, yyyy')}
                  </span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowAddTask(true)} className="btn-primary"
                style={{ padding: '8px 16px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Plus size={14} /> Add Task
              </button>
              {project.status === 'archived' ? (
                <button onClick={() => { supabase.from('projects').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', id).then(() => load()) }}
                  style={{ padding: '8px 14px', borderRadius: 10, background: 'none', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--brand)', fontSize: 12, fontFamily: 'Raleway, sans-serif', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, transition: 'all .15s' }}>
                  <RotateCcw size={13} /> Restore
                </button>
              ) : (
                <button onClick={() => setArchiveProjectOpen(true)}
                  style={{ padding: '8px 14px', borderRadius: 10, background: 'none', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--muted)', fontSize: 12, fontFamily: 'Raleway, sans-serif', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, transition: 'all .15s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--border2)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
                  <Archive size={13} /> Archive
                </button>
              )}
              <button onClick={() => setDeleteProjectOpen(true)}
                style={{ padding: '8px 10px', borderRadius: 10, background: 'none', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--muted)', transition: 'all .15s' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#ff5c7a'; e.currentTarget.style.borderColor = 'rgba(255,92,122,.3)'; e.currentTarget.style.background = 'rgba(255,92,122,.08)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'none' }}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {/* Description */}
          {editingDesc ? (
            <div style={{ marginBottom: 16 }}>
              <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3}
                style={{ ...inp, resize: 'none', marginBottom: 8 }} autoFocus />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={saveDesc} className="btn-primary" style={{ padding: '7px 16px', fontSize: 12 }}>Save</button>
                <button onClick={() => { setEditingDesc(false); setDesc(project.description) }} className="btn-ghost" style={{ padding: '7px 12px', fontSize: 12 }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 16 }}
              onClick={() => setEditingDesc(true)}>
              <p style={{ fontSize: 13, color: project.description ? 'var(--text)' : 'var(--muted)', lineHeight: 1.6, margin: 0, flex: 1, cursor: 'text' }}>
                {project.description || 'Click to add a description…'}
              </p>
              <Edit2 size={13} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 2, cursor: 'pointer' }} />
            </div>
          )}

          {/* Progress bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'Raleway, sans-serif', fontWeight: 600 }}>{done} of {total} tasks completed</span>
              <span style={{ fontSize: 12, fontWeight: 800, fontFamily: 'Raleway, sans-serif', color: 'var(--text)' }}>{pct}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 99, background: 'var(--faint)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 99, background: project.color, width: `${pct}%`, transition: 'width .4s' }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Tasks',  value: total,   icon: CheckSquare, color: 'var(--brand)' },
          { label: 'Completed',    value: done,     icon: CheckCircle2, color: '#27d98a' },
          { label: 'Urgent',       value: urgent,   icon: AlertCircle, color: '#ff5c7a' },
          { label: 'Overdue',      value: overdue,  icon: Clock,       color: '#ffcc66' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card" style={{ borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Icon size={16} style={{ color }} />
              <span style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 900, fontSize: 22, color: 'var(--text)' }}>{value}</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, fontFamily: 'Raleway, sans-serif', fontWeight: 600 }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Quick add at top if button clicked */}
      {showAddTask && (
        <div className="card" style={{ borderRadius: 16, padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
          <Plus size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          <input autoFocus placeholder="New task title…" value={newTaskTitle}
            onChange={e => setNewTaskTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') quickAddTask(); if (e.key === 'Escape') { setShowAddTask(false); setNewTaskTitle('') } }}
            style={{ ...inp, flex: 1 }} />
          <button onClick={() => quickAddTask()} disabled={addingTask || !newTaskTitle.trim()} className="btn-primary"
            style={{ padding: '7px 14px', fontSize: 12, flexShrink: 0, opacity: !newTaskTitle.trim() ? 0.4 : 1 }}>
            {addingTask ? 'Adding…' : 'Add'}
          </button>
          <button onClick={() => { setShowAddTask(false); setNewTaskTitle('') }} className="btn-ghost"
            style={{ padding: '7px 10px', fontSize: 12, flexShrink: 0 }}>Cancel</button>
        </div>
      )}

      {/* ── Task Sections by Status ── */}
      {STATUS_SECTIONS.map(section => {
        const sectionTasks = tasks.filter(t => t.status === section.key)
        const Icon = section.icon
        const isAdding = activeSection === section.key

        return (
          <div key={section.key} className="card" style={{ borderRadius: 'var(--r-lg)', overflow: 'hidden', marginBottom: 14 }}>
            {/* Section header */}
            <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--faint)', borderBottom: sectionTasks.length > 0 || isAdding ? '1px solid var(--border)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon size={15} style={{ color: section.color }} />
                <span style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 800, fontSize: 13, color: 'var(--text)' }}>{section.label}</span>
                <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: `${section.color}18`, color: section.color, fontFamily: 'Raleway, sans-serif' }}>
                  {sectionTasks.length}
                </span>
              </div>
              <button onClick={() => setActiveSection(isAdding ? null : section.key)}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--muted)', padding: '4px 10px', fontSize: 11, fontFamily: 'Raleway, sans-serif', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, transition: 'all .15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.color = 'var(--brand)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}>
                <Plus size={11} /> Add here
              </button>
            </div>

            {/* Inline add in this section */}
            {isAdding && (
              <div style={{ padding: '10px 18px', display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                <input autoFocus placeholder={`Add to ${section.label}…`} value={sectionTaskTitle}
                  onChange={e => setSectionTaskTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') quickAddTask(section.key, true); if (e.key === 'Escape') { setActiveSection(null); setSectionTaskTitle('') } }}
                  style={{ ...inp, flex: 1 }} />
                <button onClick={() => quickAddTask(section.key, true)} disabled={addingTask || !sectionTaskTitle.trim()}
                  className="btn-primary" style={{ padding: '7px 14px', fontSize: 12, flexShrink: 0, opacity: !sectionTaskTitle.trim() ? 0.4 : 1 }}>
                  Add
                </button>
                <button onClick={() => { setActiveSection(null); setSectionTaskTitle('') }} className="btn-ghost"
                  style={{ padding: '7px 10px', fontSize: 12, flexShrink: 0 }}>✕</button>
              </div>
            )}

            {/* Task rows */}
            {sectionTasks.length === 0 && !isAdding ? (
              <div style={{ padding: '16px 18px', color: 'var(--muted)', fontSize: 12, fontFamily: 'Lato, sans-serif', fontStyle: 'italic' }}>
                No tasks here
              </div>
            ) : sectionTasks.map((task, idx) => (
              <div key={task.id}
                onClick={() => setDrawerTask(task)}
                style={{ padding: '11px 18px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', borderBottom: idx < sectionTasks.length - 1 ? '1px solid var(--border)' : 'none', transition: 'background .12s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

                <button onClick={e => { e.stopPropagation(); toggleDone(task) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                  {task.status === 'done'
                    ? <CheckCircle2 size={17} style={{ color: '#27d98a' }} />
                    : <Circle size={17} style={{ color: 'var(--muted)' }} />}
                </button>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Raleway, sans-serif', color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: task.status === 'done' ? 'line-through' : 'none', opacity: task.status === 'done' ? 0.45 : 1 }}>
                    {task.title}
                  </p>
                  {task.description && (
                    <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 500 }}>
                      {task.description}
                    </p>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {task.deadline && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: task.deadline < today ? '#ff5c7a' : 'var(--muted)', padding: '2px 7px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--faint)' }}>
                      <Clock size={9} /> {task.deadline}
                    </span>
                  )}
                  {task.scheduled_for && (
                    <span style={{ fontSize: 11, color: 'var(--brand2)', padding: '2px 7px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--faint)' }}>
                      📅 {task.scheduled_for}
                    </span>
                  )}
                  <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', background: PS[task.priority].bg, color: PS[task.priority].text }}>
                    {task.priority}
                  </span>
                  <span style={{ padding: '3px 8px', borderRadius: 8, fontSize: 11, fontWeight: 800, fontFamily: 'monospace', background: 'var(--faint)', color: 'var(--muted)' }}>
                    {task.effort}
                  </span>
                  <button onClick={e => { e.stopPropagation(); setDeleteTaskTarget(task) }}
                    style={{ background: 'none', border: '1px solid transparent', borderRadius: 8, cursor: 'pointer', color: 'var(--muted)', padding: '3px 5px', transition: 'all .15s' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#ff5c7a'; e.currentTarget.style.borderColor = 'rgba(255,92,122,.3)'; e.currentTarget.style.background = 'rgba(255,92,122,.08)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'none' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      })}

      {tasks.length === 0 && (
        <div className="card" style={{ borderRadius: 'var(--r-lg)', padding: '48px 0', textAlign: 'center' }}>
          <CheckSquare size={34} style={{ color: 'var(--muted)', opacity: 0.2, display: 'block', margin: '0 auto 12px' }} />
          <p style={{ fontFamily: 'Raleway, sans-serif', color: 'var(--muted)', fontWeight: 600, margin: 0 }}>No tasks yet</p>
          <button onClick={() => setShowAddTask(true)} style={{ marginTop: 12, background: 'none', border: 'none', color: 'var(--brand)', fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            + Add first task
          </button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
