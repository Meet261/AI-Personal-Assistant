'use client'
import { useState, useEffect, useCallback } from 'react'
import { Bot, Plus, CheckSquare, FolderKanban, RefreshCw, Trash2, Circle, CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import AgentPageLayout from '@/components/agents/AgentPageLayout'

const COLOR = '#0F766E'

interface Task {
  id: string
  title: string
  status: 'todo' | 'in_progress' | 'done'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  project_id: string | null
  deadline: string | null
  effort: number | null
}

interface Project {
  id: string
  name: string
  description: string | null
  status: string
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e',
}

const STATUS_ICON: Record<string, React.ElementType> = {
  todo: Circle, in_progress: Clock, done: CheckCircle2,
}

function TaskRow({ task, projects, onToggle, onDelete }: {
  task: Task
  projects: Project[]
  onToggle: (id: string, status: string) => void
  onDelete: (id: string) => void
}) {
  const Icon = STATUS_ICON[task.status] ?? Circle
  const project = projects.find(p => p.id === task.project_id)
  const isDone = task.status === 'done'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--faint)' }}>
      <button onClick={() => onToggle(task.id, task.status)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: isDone ? '#22c55e' : 'var(--muted)', flexShrink: 0 }}>
        <Icon size={18} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: isDone ? 'var(--muted)' : 'var(--text)', textDecoration: isDone ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.title}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 3, alignItems: 'center' }}>
          {project && <span style={{ fontSize: 10, color: COLOR, fontWeight: 700 }}>{project.name}</span>}
          {task.deadline && <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'Lato' }}>{new Date(task.deadline).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>}
        </div>
      </div>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: PRIORITY_COLOR[task.priority] ?? '#94a3b8', flexShrink: 0 }} />
      <button onClick={() => onDelete(task.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2, flexShrink: 0 }}
        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}>
        <Trash2 size={13} />
      </button>
    </div>
  )
}

export default function AssistantAgentPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'todo' | 'in_progress' | 'done'>('todo')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [newTask, setNewTask] = useState('')
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [taskRes, projRes] = await Promise.all([
      fetch('/api/tasks').then(r => r.json()).catch(() => []),
      fetch('/api/projects').then(r => r.json()).catch(() => []),
    ])
    setTasks(Array.isArray(taskRes) ? taskRes : [])
    setProjects(Array.isArray(projRes) ? projRes : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const toggleTask = useCallback(async (id: string, currentStatus: string) => {
    const next = currentStatus === 'done' ? 'todo' : currentStatus === 'todo' ? 'in_progress' : 'done'
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: next as Task['status'] } : t))
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    }).catch(() => {})
  }, [])

  const deleteTask = useCallback(async (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id))
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' }).catch(() => {})
  }, [])

  const addTask = useCallback(async () => {
    if (!newTask.trim()) return
    setAdding(true)
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTask.trim(), priority: newPriority, status: 'todo' }),
    })
    if (res.ok) {
      setNewTask('')
      await load()
    }
    setAdding(false)
  }, [newTask, newPriority, load])

  const filtered = tasks.filter(t => {
    if (filter !== 'all' && t.status !== filter) return false
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false
    return true
  })

  const stats = {
    total: tasks.length,
    todo: tasks.filter(t => t.status === 'todo').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
    urgent: tasks.filter(t => t.priority === 'urgent' && t.status !== 'done').length,
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────
  const dashboard = (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'Raleway', fontWeight: 700, fontSize: 12 }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Open Tasks', value: stats.todo, color: COLOR, icon: CheckSquare },
          { label: 'In Progress', value: stats.inProgress, color: '#0369A1', icon: Clock },
          { label: 'Completed', value: stats.done, color: '#22c55e', icon: CheckCircle2 },
          { label: 'Urgent', value: stats.urgent, color: stats.urgent > 0 ? '#ef4444' : '#94a3b8', icon: AlertCircle },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--panel)', borderRadius: 14, padding: '18px 20px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{s.label}</span>
              <s.icon size={14} color="var(--muted)" />
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: s.color, fontFamily: 'Raleway' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Projects */}
      <div style={{ background: 'var(--panel)', borderRadius: 14, border: '1px solid var(--border)', marginBottom: 20, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <FolderKanban size={14} color={COLOR} />
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>Projects ({projects.length})</h3>
        </div>
        {loading ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading…</div> : projects.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No projects yet. Ask the assistant to create one.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 0 }}>
            {projects.map(p => {
              const projectTasks = tasks.filter(t => t.project_id === p.id)
              const done = projectTasks.filter(t => t.status === 'done').length
              const pct = projectTasks.length ? Math.round(done / projectTasks.length * 100) : 0
              return (
                <div key={p.id} style={{ padding: '14px 18px', borderBottom: '1px solid var(--faint)', borderRight: '1px solid var(--faint)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato', marginBottom: 8 }}>{projectTasks.length} tasks · {pct}% done</div>
                  <div style={{ height: 4, borderRadius: 2, background: 'var(--faint)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: COLOR, borderRadius: 2, transition: 'width .3s' }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Urgent tasks */}
      {stats.urgent > 0 && (
        <div style={{ background: '#ef444408', borderRadius: 14, border: '1px solid #ef444430', overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #ef444420', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={14} color="#ef4444" />
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#dc2626' }}>Urgent ({stats.urgent})</h3>
          </div>
          {tasks.filter(t => t.priority === 'urgent' && t.status !== 'done').map(t => (
            <TaskRow key={t.id} task={t} projects={projects} onToggle={toggleTask} onDelete={deleteTask} />
          ))}
        </div>
      )}
    </div>
  )

  // ── Actions (task manager) ────────────────────────────────────────────────
  const actions = (
    <div style={{ maxWidth: 800 }}>
      {/* Add task */}
      <div style={{ background: 'var(--panel)', borderRadius: 14, padding: 20, border: '1px solid var(--border)', marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Add Task</h3>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            value={newTask} onChange={e => setNewTask(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTask()}
            placeholder="Task title…"
            style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--text)', fontSize: 13, fontFamily: 'Lato', outline: 'none' }}
          />
          <select value={newPriority} onChange={e => setNewPriority(e.target.value as Task['priority'])}
            style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--text)', fontSize: 12, fontFamily: 'Raleway', fontWeight: 700, cursor: 'pointer' }}>
            {['low', 'medium', 'high', 'urgent'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button onClick={addTask} disabled={adding || !newTask.trim()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, background: COLOR, color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'Raleway', fontWeight: 700, fontSize: 13, opacity: adding || !newTask.trim() ? 0.5 : 1 }}>
            <Plus size={15} /> Add
          </button>
        </div>
      </div>

      {/* Task list */}
      <div style={{ background: 'var(--panel)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4, background: 'var(--faint)', borderRadius: 8, padding: 3 }}>
            {(['all', 'todo', 'in_progress', 'done'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'Raleway', fontWeight: 700, fontSize: 10, textTransform: 'capitalize', background: filter === f ? 'var(--panel)' : 'transparent', color: filter === f ? COLOR : 'var(--muted)', boxShadow: filter === f ? '0 1px 3px rgba(0,0,0,.08)' : 'none' }}>
                {f.replace('_', ' ')}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, background: 'var(--faint)', borderRadius: 8, padding: 3 }}>
            {(['all', 'urgent', 'high', 'medium', 'low'] as const).map(p => (
              <button key={p} onClick={() => setPriorityFilter(p)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'Raleway', fontWeight: 700, fontSize: 10, textTransform: 'capitalize', background: priorityFilter === p ? 'var(--panel)' : 'transparent', color: priorityFilter === p ? (PRIORITY_COLOR[p] ?? COLOR) : 'var(--muted)', boxShadow: priorityFilter === p ? '0 1px 3px rgba(0,0,0,.08)' : 'none' }}>
                {p}
              </button>
            ))}
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>{filtered.length} tasks</span>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading tasks…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No tasks match this filter.</div>
        ) : (
          filtered.slice(0, 100).map(t => (
            <TaskRow key={t.id} task={t} projects={projects} onToggle={toggleTask} onDelete={deleteTask} />
          ))
        )}
      </div>
    </div>
  )

  const commandCenter = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[
        { label: 'Open Tasks', value: stats.todo, color: COLOR },
        { label: 'In Progress', value: stats.inProgress, color: '#0369A1' },
        { label: 'Projects', value: projects.length, color: 'var(--text)' },
        { label: 'Urgent', value: stats.urgent, color: stats.urgent > 0 ? '#ef4444' : 'var(--muted)' },
      ].map(item => (
        <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>{item.label}</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: item.color, fontFamily: 'Raleway' }}>{item.value}</span>
        </div>
      ))}
    </div>
  )

  const settings = (
    <div style={{ maxWidth: 500 }}>
      <div style={{ background: 'var(--panel)', borderRadius: 14, padding: 20, border: '1px solid var(--border)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Personal Assistant Settings</h3>
        {[
          { label: 'Model', value: 'deepseek-r1:7b (local via Ollama)' },
          { label: 'Storage', value: 'Supabase (tasks + projects + meetings)' },
          { label: 'Tool calls', value: 'Read/write tasks, projects, meetings' },
          { label: 'Memory extraction', value: 'Every 4 messages automatically' },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--faint)' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato' }}>{s.label}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', fontFamily: 'Lato' }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <AgentPageLayout
      agentId="assistant"
      agentName="Personal Assistant"
      agentColor={COLOR}
      agentIcon={<Bot size={20} />}
      description="Tasks, projects, meetings & daily workflow · 100% local"
      tabs={['dashboard', 'actions', 'chat', 'settings']}
      starters={[
        'What should I focus on today?',
        'Show me my urgent tasks',
        'Create a task to review my trading strategy',
        'What projects am I working on?',
        'Add a meeting for tomorrow at 10am',
      ]}
      dashboard={dashboard}
      actions={actions}
      settings={settings}
      commandCenter={commandCenter}
    />
  )
}
