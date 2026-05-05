'use client'
import React, { useEffect, useState, useCallback } from 'react'
import type { Project } from '@/lib/types'
import { supabase } from '@/lib/supabase'
import { Plus, Layers, Trash2, ChevronRight, MoreVertical, Archive, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ConfirmDialog from '@/components/ConfirmDialog'

const COLORS = ['#0F766E', '#14b8a6', '#3dd6d0', '#27d98a', '#ffcc66', '#ff5c7a', '#f97316', '#a855f7']
const STATUSES = ['active', 'on_hold', 'completed', 'archived'] as const

const statusStyle: Record<string, { bg: string; text: string }> = {
  active:    { bg: 'rgba(39,217,138,.15)',   text: '#27d98a' },
  on_hold:   { bg: 'rgba(255,204,102,.15)',  text: '#ffcc66' },
  completed: { bg: 'rgba(61,214,208,.15)',   text: '#3dd6d0' },
  archived:  { bg: 'rgba(166,179,214,.12)',  text: '#a6b3d6' },
}

const inputBase: React.CSSProperties = {
  background: 'var(--faint)', border: '1px solid var(--border)', color: 'var(--text)',
  borderRadius: 10, padding: '9px 13px', fontSize: 13, fontFamily: 'Lato, sans-serif', outline: 'none', width: '100%',
}

interface DeleteTarget { project: Project; taskCount: number }

function ProjectMenu({ project, onArchive, onUnarchive, onDelete }: {
  project: Project
  onArchive: () => void
  onUnarchive: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        style={{ background: 'none', border: '1px solid transparent', borderRadius: 8, cursor: 'pointer', color: 'var(--muted)', padding: '5px 6px', transition: 'all .15s' }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--faint)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'none' }}>
        <MoreVertical size={15} />
      </button>
      {open && (
        <div onClick={e => e.stopPropagation()} style={{
          position: 'absolute', right: 0, top: '110%', zIndex: 100, minWidth: 170,
          background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12,
          boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
        }}>
          {project.status === 'archived' ? (
            <button onClick={() => { setOpen(false); onUnarchive() }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'Raleway, sans-serif', fontWeight: 700, color: 'var(--brand)', textAlign: 'left' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--faint)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              <RotateCcw size={13} /> Restore to Active
            </button>
          ) : (
            <button onClick={() => { setOpen(false); onArchive() }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'Raleway, sans-serif', fontWeight: 700, color: 'var(--text)', textAlign: 'left' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--faint)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              <Archive size={13} /> Archive Project
            </button>
          )}
          <div style={{ height: 1, background: 'var(--border)' }} />
          <button onClick={() => { setOpen(false); onDelete() }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'Raleway, sans-serif', fontWeight: 700, color: '#ff5c7a', textAlign: 'left' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,92,122,.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
            <Trash2 size={13} /> Delete Permanently
          </button>
        </div>
      )}
    </div>
  )
}

export default function ProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [taskCounts, setTaskCounts] = useState<Record<string, { total: number; done: number }>>({})
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', color: '#0F766E', status: 'active' })
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)

  const load = useCallback(async () => {
    const [pRes, tRes] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('tasks').select('project_id, status'),
    ])
    setProjects(pRes.data || [])
    const counts: Record<string, { total: number; done: number }> = {}
    for (const t of tRes.data || []) {
      if (!t.project_id) continue
      if (!counts[t.project_id]) counts[t.project_id] = { total: 0, done: 0 }
      counts[t.project_id].total++
      if (t.status === 'done') counts[t.project_id].done++
    }
    setTaskCounts(counts)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function addProject() {
    if (!form.name.trim()) return
    setSaving(true)
    await supabase.from('projects').insert(form)
    setForm({ name: '', description: '', color: '#0F766E', status: 'active' })
    setShowNew(false)
    setSaving(false)
    load()
  }

  async function archiveProject(project: Project) {
    await supabase.from('projects').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', project.id)
    load()
  }

  async function unarchiveProject(project: Project) {
    await supabase.from('projects').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', project.id)
    load()
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    await supabase.from('tasks').delete().eq('project_id', deleteTarget.project.id)
    await supabase.from('projects').delete().eq('id', deleteTarget.project.id)
    setDeleteTarget(null)
    load()
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 960, margin: '0 auto' }}>

      {/* Confirm dialog */}
      {deleteTarget && (
        <ConfirmDialog
          title={`Delete "${deleteTarget.project.name}"?`}
          message="This project will be permanently removed. This action cannot be undone."
          warning={
            deleteTarget.taskCount > 0
              ? `${deleteTarget.taskCount} task${deleteTarget.taskCount > 1 ? 's' : ''} inside this project will also be permanently deleted.`
              : undefined
          }
          confirmLabel="Delete Project"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 900, fontSize: 24, color: 'var(--text)', margin: 0 }}>Projects</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
            {projects.filter(p => p.status !== 'archived').length} active · {projects.filter(p => p.status === 'archived').length} archived
          </p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', fontSize: 13 }}>
          <Plus size={15} /> New Project
        </button>
      </div>

      {/* New Project form */}
      {showNew && (
        <div className="card animate-fade-in" style={{ borderRadius: 'var(--r-lg)', padding: 24, marginBottom: 24 }}>
          <p style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 800, fontSize: 14, color: 'var(--text)', marginBottom: 16 }}>New Project</p>
          <input autoFocus placeholder="Project name…" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ ...inputBase, marginBottom: 10 }} />
          <textarea placeholder="Description (optional)…" value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={2} style={{ ...inputBase, resize: 'none', marginBottom: 16 }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 32, marginBottom: 20 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Color</p>
              <div style={{ display: 'flex', gap: 8 }}>
                {COLORS.map(c => (
                  <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                    style={{
                      width: 26, height: 26, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer',
                      outline: form.color === c ? `3px solid var(--text)` : '3px solid transparent',
                      outlineOffset: 2, transition: 'transform .15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.15)')}
                    onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                  />
                ))}
              </div>
            </div>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Status</p>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                style={{ ...inputBase, width: 'auto', padding: '8px 12px' }}>
                {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowNew(false)} className="btn-ghost" style={{ padding: '9px 18px', fontSize: 13 }}>Cancel</button>
            <button onClick={addProject} disabled={saving || !form.name.trim()} className="btn-primary" style={{ padding: '9px 18px', fontSize: 13, opacity: (saving || !form.name.trim()) ? 0.4 : 1 }}>
              {saving ? 'Creating…' : 'Create Project'}
            </button>
          </div>
        </div>
      )}

      {/* Projects grid */}
      {/* ── Active projects ── */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card" style={{ borderRadius: 'var(--r-lg)', padding: 20, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--border)', borderRadius: 2 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--faint)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ height: 13, borderRadius: 6, background: 'var(--faint)', animation: 'pulse 1.5s ease-in-out infinite', marginBottom: 6, width: '65%' }} />
                  <div style={{ height: 10, borderRadius: 6, background: 'var(--faint)', animation: 'pulse 1.5s ease-in-out infinite', width: '40%' }} />
                </div>
              </div>
              <div style={{ height: 5, borderRadius: 99, background: 'var(--faint)', animation: 'pulse 1.5s ease-in-out infinite', marginBottom: 8 }} />
              <div style={{ height: 10, borderRadius: 6, background: 'var(--faint)', animation: 'pulse 1.5s ease-in-out infinite', width: '50%' }} />
            </div>
          ))}
        </div>
      ) : projects.filter(p => p.status !== 'archived').length === 0 ? (
        <div className="card" style={{ borderRadius: 20, padding: '56px 0', textAlign: 'center' }}>
          <Layers size={36} style={{ color: 'var(--muted)', opacity: 0.3, display: 'block', margin: '0 auto 12px' }} />
          <p style={{ fontFamily: 'Raleway, sans-serif', color: 'var(--muted)', fontWeight: 600 }}>No active projects. Create your first one.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {projects.filter(p => p.status !== 'archived').map(project => {
            const counts = taskCounts[project.id] || { total: 0, done: 0 }
            const pct = counts.total ? Math.round((counts.done / counts.total) * 100) : 0
            const ss = statusStyle[project.status] || statusStyle.archived
            return (
              <div key={project.id} className="card card-hover"
                onClick={() => router.push(`/projects/${project.id}`)}
                style={{ borderRadius: 'var(--r-lg)', padding: 20, position: 'relative', overflow: 'hidden', cursor: 'pointer' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: project.color }} />
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: `${project.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Layers size={19} style={{ color: project.color }} />
                    </div>
                    <div>
                      <p style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 800, fontSize: 14, color: 'var(--text)', margin: 0 }}>{project.name}</p>
                      <span style={{ ...ss, padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', marginTop: 4, display: 'inline-block' }}>
                        {project.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                  <ProjectMenu project={project}
                    onArchive={() => archiveProject(project)}
                    onUnarchive={() => unarchiveProject(project)}
                    onDelete={() => setDeleteTarget({ project, taskCount: counts.total })} />
                </div>
                {project.description && (
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {project.description}
                  </p>
                )}
                <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', color: 'var(--muted)' }}>
                  <span>{counts.total} tasks · {counts.done} done</span>
                  <span>{pct}%</span>
                </div>
                <div style={{ height: 5, borderRadius: 99, background: 'var(--faint)', overflow: 'hidden', marginBottom: 14 }}>
                  <div style={{ height: '100%', borderRadius: 99, background: project.color, width: `${pct}%`, transition: 'width .3s' }} />
                </div>
                <Link href={`/projects/${project.id}`} onClick={e => e.stopPropagation()}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, fontFamily: 'Raleway, sans-serif', color: 'var(--brand)', textDecoration: 'none' }}>
                  Open project <ChevronRight size={13} />
                </Link>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Archived projects ── */}
      {projects.filter(p => p.status === 'archived').length > 0 && (
        <div style={{ marginTop: 32 }}>
          <button onClick={() => setShowArchived(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0', marginBottom: 14 }}
          >
            <Archive size={14} style={{ color: 'var(--muted)' }} />
            <span style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 13, color: 'var(--muted)' }}>
              Archived ({projects.filter(p => p.status === 'archived').length})
            </span>
            <ChevronRight size={13} style={{ color: 'var(--muted)', transform: showArchived ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} />
          </button>
          {showArchived && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {projects.filter(p => p.status === 'archived').map(project => {
                const counts = taskCounts[project.id] || { total: 0, done: 0 }
                return (
                  <div key={project.id} className="card"
                    onClick={() => router.push(`/projects/${project.id}`)}
                    style={{ borderRadius: 'var(--r-lg)', padding: 20, position: 'relative', overflow: 'hidden', cursor: 'pointer', opacity: 0.65 }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--border)' }} />
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Archive size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                        <p style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 13, color: 'var(--muted)', margin: 0 }}>{project.name}</p>
                      </div>
                      <ProjectMenu project={project}
                        onArchive={() => archiveProject(project)}
                        onUnarchive={() => unarchiveProject(project)}
                        onDelete={() => setDeleteTarget({ project, taskCount: counts.total })} />
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>{counts.total} tasks · {counts.done} done</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
