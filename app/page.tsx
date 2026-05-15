'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Task, Project, DailyBriefing } from '@/lib/types'
import {
  CheckSquare, Clock, AlertCircle, TrendingUp,
  Sunrise, Moon, BookOpen, ChevronRight, ArrowUpRight,
  Calendar, Layers, CheckCircle2, Circle, X, Zap
} from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import TaskDrawer from '@/components/TaskDrawer'

const PP: Record<string, { bg: string; color: string }> = {
  urgent: { bg: 'rgba(255,92,122,.15)',  color: '#ff5c7a' },
  high:   { bg: 'rgba(255,204,102,.12)', color: '#ffcc66' },
  medium: { bg: 'rgba(61,214,208,.12)',  color: '#3dd6d0' },
  low:    { bg: 'rgba(39,217,138,.12)',  color: '#27d98a' },
}

/* ── Task Modal (grouped by project) ── */
function TaskModal({ title, subtitle, tasks, accentColor, onClose }: {
  title: string; subtitle: string; tasks: Task[]; accentColor: string; onClose: () => void
}) {
  const today = format(new Date(), 'yyyy-MM-dd')

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  const groups: Record<string, { project: Project; tasks: Task[] }> = {}
  const noProject: Task[] = []
  tasks.forEach(t => {
    if (t.project) {
      const p = t.project as Project
      if (!groups[p.id]) groups[p.id] = { project: p, tasks: [] }
      groups[p.id].tasks.push(t)
    } else noProject.push(t)
  })

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(10,46,44,.50)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: 'fadeIn .15s ease-out' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(660px,100%)', maxHeight: '82vh', display: 'flex', flexDirection: 'column', background: 'var(--panel)', borderRadius: 20, border: '1px solid var(--border2)', boxShadow: 'var(--shadow-xl)', overflow: 'hidden', animation: 'slideDown .18s ease-out' }}>

        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--faint)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: accentColor }} />
            <h2 style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 900, fontSize: 16, color: 'var(--text)', margin: 0 }}>{title}</h2>
            <span style={{ padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', background: `${accentColor}18`, color: accentColor }}>
              {tasks.length} tasks
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'Lato, sans-serif', fontSize: 12, color: 'var(--muted)' }}>{subtitle}</span>
            <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--muted)', padding: '5px 7px', transition: 'all .15s' }}
              onMouseEnter={e => { const el = e.currentTarget; el.style.background = 'rgba(220,38,38,.08)'; el.style.borderColor = '#DC2626'; el.style.color = '#DC2626' }}
              onMouseLeave={e => { const el = e.currentTarget; el.style.background = 'none'; el.style.borderColor = 'var(--border)'; el.style.color = 'var(--muted)' }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {tasks.length === 0 ? (
            <div style={{ padding: '52px 0', textAlign: 'center' }}>
              <CheckCircle2 size={36} style={{ color: 'var(--good)', opacity: 0.35, display: 'block', margin: '0 auto 10px' }} />
              <p style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 700, color: 'var(--muted)', margin: 0 }}>Nothing here — great job!</p>
            </div>
          ) : (
            <>
              {Object.values(groups).map(({ project: proj, tasks: ptasks }) => (
                <div key={proj.id}>
                  <div style={{ padding: '8px 22px', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--faint)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 1 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: proj.color }} />
                    <span style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 800, fontSize: 12, color: 'var(--text)' }}>{proj.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>· {ptasks.length}</span>
                    <Link href={`/projects/${proj.id}`} onClick={onClose}
                      style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', color: 'var(--brand)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 2 }}>
                      Open <ChevronRight size={11} />
                    </Link>
                  </div>
                  {ptasks.map((task, i) => <ModalRow key={task.id} task={task} idx={i} total={ptasks.length} today={today} />)}
                </div>
              ))}
              {noProject.length > 0 && (
                <div>
                  <div style={{ padding: '8px 22px', background: 'var(--faint)', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 800, fontSize: 12, color: 'var(--muted)' }}>No project</span>
                  </div>
                  {noProject.map((task, i) => <ModalRow key={task.id} task={task} idx={i} total={noProject.length} today={today} />)}
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ padding: '12px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--faint)', flexShrink: 0 }}>
          <span style={{ fontFamily: 'Lato, sans-serif', fontSize: 12, color: 'var(--muted)' }}>Esc to close</span>
          <Link href="/tasks" onClick={onClose} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 9, background: 'var(--brand)', color: '#fff', fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 12, textDecoration: 'none' }}>
            Open Tasks <ArrowUpRight size={12} />
          </Link>
        </div>
      </div>
    </div>
  )
}

function ModalRow({ task, idx, total, today }: { task: Task; idx: number; total: number; today: string }) {
  const pp = PP[task.priority] || PP.medium
  return (
    <div style={{ padding: '11px 22px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: idx < total - 1 ? '1px solid var(--border)' : 'none', transition: 'background .12s' }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--hover)')}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
      <Circle size={13} style={{ color: 'var(--subtle, var(--muted))', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 600, fontSize: 13, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</p>
        {task.description && <p style={{ fontFamily: 'Lato, sans-serif', fontSize: 11, color: 'var(--muted)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.description}</p>}
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
        {task.deadline && (
          <span style={{ fontSize: 11, color: task.deadline < today ? 'var(--bad, #DC2626)' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Clock size={9} />{task.deadline}
          </span>
        )}
        <span style={{ padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', background: pp.bg, color: pp.color }}>{task.priority}</span>
        <span style={{ padding: '2px 7px', borderRadius: 6, fontSize: 11, fontWeight: 700, fontFamily: 'monospace', background: 'var(--faint2, var(--faint))', color: 'var(--muted)' }}>{task.effort}</span>
      </div>
    </div>
  )
}

/* ── Reusable card header ── */
function CardHeader({ icon: Icon, title, count, href, color = 'var(--brand)', action }: {
  icon: React.ElementType; title: string; count?: number; href?: string; color?: string; action?: React.ReactNode
}) {
  return (
    <div style={{ padding: '13px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', background: 'var(--faint)', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: `${color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={14} style={{ color }} />
        </div>
        <span style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 800, fontSize: 13, color: 'var(--text)' }}>{title}</span>
        {count !== undefined && (
          <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', background: `${color}15`, color }}>{count}</span>
        )}
      </div>
      {action || (href && (
        <Link href={href} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 700, fontFamily: 'Raleway, sans-serif', color, textDecoration: 'none', opacity: 0.8 }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = '0.8')}>
          View all <ChevronRight size={12} />
        </Link>
      ))}
    </div>
  )
}

/* ── Empty state ── */
function Empty({ icon: Icon, message, sub, href, cta, color = 'var(--brand)' }: {
  icon: React.ElementType; message: string; sub?: string; href?: string; cta?: string; color?: string
}) {
  return (
    <div style={{ padding: '32px 20px', textAlign: 'center' }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: `${color}12`, border: `1px solid ${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
        <Icon size={22} style={{ color }} />
      </div>
      <p style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 14, color: 'var(--text)', margin: '0 0 4px' }}>{message}</p>
      {sub && <p style={{ fontFamily: 'Lato, sans-serif', fontSize: 12, color: 'var(--muted)', margin: '0 0 14px', lineHeight: 1.5 }}>{sub}</p>}
      {href && cta && (
        <Link href={href} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 10, background: color, color: '#fff', fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 12, textDecoration: 'none' }}>
          {cta} <ArrowUpRight size={12} />
        </Link>
      )}
    </div>
  )
}

/* ════════════════════════════════════════
   DASHBOARD
════════════════════════════════════════ */
export default function Dashboard() {
  const [tasks, setTasks]           = useState<Task[]>([])
  const [allTasks, setAllTasks]     = useState<Pick<Task, 'id' | 'project_id' | 'status' | 'priority'>[]>([])
  const [projects, setProjects]     = useState<Project[]>([])
  const [morningBrief, setMorningBrief] = useState<DailyBriefing | null>(null)
  const [eveningBrief, setEveningBrief] = useState<DailyBriefing | null>(null)
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState<{ title: string; subtitle: string; tasks: Task[]; color: string } | null>(null)
  const [drawerTask, setDrawerTask] = useState<Task | null>(null)
  const [trading, setTrading]       = useState<{
    running: boolean; total_trades: number; today_trades: number
    total_pnl: number; today_pnl: number; wins: number; losses: number
    win_rate: number; open_positions: number; symbols: string[]
  } | null>(null)
  const today = format(new Date(), 'yyyy-MM-dd')

  const load = useCallback(async () => {
    try {
      const [tasksRes, allTasksRes, projectsRes, briefingsRes] = await Promise.all([
        supabase.from('tasks').select('*, project:projects(*)').neq('status', 'done').order('priority'),
        supabase.from('tasks').select('id,project_id,status,priority').order('priority'),
        supabase.from('projects').select('*').eq('status', 'active'),
        supabase.from('daily_briefings').select('*').eq('date', today),
      ])
      setTasks(tasksRes.data || [])
      setAllTasks(allTasksRes.data || [])
      setProjects(projectsRes.data || [])
      const b: DailyBriefing[] = briefingsRes.data || []
      setMorningBrief(b.find(x => x.type === 'morning') || null)
      setEveningBrief(b.find(x => x.type === 'evening') || null)
    } finally {
      setLoading(false)
    }
  }, [today])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch('/api/trading/summary').then(r => r.ok ? r.json() : null).then(d => { if (d) setTrading(d) }).catch(() => {})
  }, [])

  const urgent     = tasks.filter(t => t.priority === 'urgent')
  const high       = tasks.filter(t => t.priority === 'high')
  const todayTasks = tasks.filter(t => t.scheduled_for === today)
  const overdue    = tasks.filter(t => t.deadline && t.deadline < today)
  const attention  = [...urgent, ...overdue.filter(t => t.priority !== 'urgent')]

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const stats = [
    { label: 'Tasks Today',   value: todayTasks.length, icon: Calendar,    color: 'var(--brand)', tasks: todayTasks, subtitle: 'Scheduled for today' },
    { label: 'Urgent',        value: urgent.length,     icon: AlertCircle, color: 'var(--bad)',   tasks: urgent,     subtitle: 'Immediate action needed' },
    { label: 'High Priority', value: high.length,       icon: TrendingUp,  color: 'var(--warn)',  tasks: high,       subtitle: 'Important items' },
    { label: 'Overdue',       value: overdue.length,    icon: Clock,       color: 'var(--bad)',   tasks: overdue,    subtitle: 'Past their deadline' },
  ]

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
      <div style={{ width: 38, height: 38, borderRadius: '50%', borderTop: '3px solid var(--brand2)', borderRight: '3px solid transparent', borderBottom: '3px solid transparent', borderLeft: '3px solid transparent', animation: 'spin .7s linear infinite' }} />
      <p style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 600, color: 'var(--muted)', fontSize: 13, margin: 0 }}>Loading workspace…</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ padding: '28px 32px 48px', maxWidth: 1360, margin: '0 auto' }}>

      {modal && <TaskModal title={modal.title} subtitle={modal.subtitle} tasks={modal.tasks} accentColor={modal.color} onClose={() => setModal(null)} />}
      {drawerTask && <TaskDrawer task={drawerTask} projects={projects} onClose={() => setDrawerTask(null)} onUpdated={() => { setDrawerTask(null); load() }} onDeleted={() => { setDrawerTask(null); load() }} />}

      {/* ══ HERO ══ */}
      <div style={{ borderRadius: 20, marginBottom: 20, overflow: 'hidden', position: 'relative', background: 'var(--hero)', boxShadow: 'var(--shadow-lg)' }}>
        {/* decorative blobs */}
        <div style={{ position: 'absolute', top: -50, right: -50, width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,.05)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -30, left: '35%', width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,.03)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', padding: '26px 30px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontFamily: 'Lato, sans-serif', fontSize: 13, color: 'rgba(255,255,255,.68)', margin: '0 0 5px', letterSpacing: '.01em' }}>
              {format(new Date(), 'EEEE, MMMM d, yyyy')}
            </p>
            <h1 style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 900, fontSize: 30, color: '#fff', margin: '0 0 10px', letterSpacing: '-.02em' }}>
              {greeting} 👋
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'Lato, sans-serif', fontSize: 13, color: 'rgba(255,255,255,.68)' }}>
                <Layers size={13} /> {projects.length} active projects
              </span>
              <span style={{ width: 1, height: 13, background: 'rgba(255,255,255,.22)' }} />
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'Lato, sans-serif', fontSize: 13, color: 'rgba(255,255,255,.68)' }}>
                <CheckSquare size={13} /> {tasks.length} open tasks
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            {/* "Daily Review" — clearer than "Check-in" */}
            <Link href="/checkin" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderRadius: 12, background: '#fff', color: '#134E4A', fontFamily: 'Raleway, sans-serif', fontWeight: 800, fontSize: 13, textDecoration: 'none', boxShadow: '0 4px 16px rgba(0,0,0,.14)', transition: 'all .15s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = 'none'}>
              <BookOpen size={15} style={{ color: '#0D9488' }} /> Daily Review
            </Link>
            <Link href="/briefing/morning" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderRadius: 12, background: 'rgba(255,255,255,.14)', color: '#fff', fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 13, textDecoration: 'none', border: '1px solid rgba(255,255,255,.24)', backdropFilter: 'blur(8px)', transition: 'all .15s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.22)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.14)'}>
              <Sunrise size={15} /> Morning Brief
            </Link>
          </div>
        </div>
      </div>

      {/* ══ STAT CARDS ══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
        {stats.map(s => (
          <button key={s.label} onClick={() => setModal({ title: s.label, subtitle: s.subtitle, tasks: s.tasks, color: s.color })}
            style={{ textAlign: 'left', cursor: 'pointer', background: 'var(--panel)', border: '1px solid var(--border)', borderTop: `3px solid ${s.color}`, borderRadius: 16, padding: '18px 20px', position: 'relative', overflow: 'hidden', transition: 'all .2s ease', boxShadow: 'var(--shadow-sm)' }}
            onMouseEnter={e => { const el = e.currentTarget; el.style.transform = 'translateY(-3px)'; el.style.boxShadow = `0 10px 32px ${s.color}22, var(--shadow-md)` }}
            onMouseLeave={e => { const el = e.currentTarget; el.style.transform = 'none'; el.style.boxShadow = 'var(--shadow-sm)' }}>
            <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, borderRadius: '50%', background: `${s.color}08`, transform: 'translate(24px,-24px)', pointerEvents: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${s.color}12`, border: `1px solid ${s.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <s.icon size={17} style={{ color: s.color }} />
              </div>
              <span style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 900, fontSize: 34, color: 'var(--text)', lineHeight: 1 }}>{s.value}</span>
            </div>
            <p style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 800, fontSize: 14, color: 'var(--text)', margin: '0 0 2px' }}>{s.label}</p>
            <p style={{ fontFamily: 'Lato, sans-serif', fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>{s.subtitle}</p>
            <span style={{ fontFamily: 'Raleway, sans-serif', fontSize: 11, fontWeight: 700, color: s.color, display: 'flex', alignItems: 'center', gap: 3 }}>
              Click to view <ChevronRight size={11} />
            </span>
          </button>
        ))}
      </div>

      {/* ══ TRADING WIDGET ══ */}
      {trading && (
        <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderLeft: `3px solid ${trading.today_pnl >= 0 ? '#27d98a' : '#ff5c7a'}`, borderRadius: 16, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: trading.running ? '#27d98a' : '#ff5c7a', boxShadow: trading.running ? '0 0 6px #27d98a80' : 'none' }} />
            <span style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 800, fontSize: 13, color: 'var(--text)' }}>Trading Agent</span>
            {trading.open_positions > 0 && (
              <span style={{ fontSize: 10, fontFamily: 'Raleway, sans-serif', fontWeight: 700, background: 'rgba(255,204,102,.15)', color: '#ffcc66', padding: '2px 7px', borderRadius: 8 }}>
                {trading.symbols.join(' & ')} OPEN
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {[
              { label: "Today's P&L", value: `$${trading.today_pnl >= 0 ? '+' : ''}${trading.today_pnl.toFixed(2)}`, color: trading.today_pnl >= 0 ? '#27d98a' : '#ff5c7a' },
              { label: 'Today Trades', value: String(trading.today_trades), color: 'var(--text)' },
              { label: 'Win Rate', value: `${trading.win_rate}%`, color: trading.win_rate >= 60 ? '#27d98a' : trading.win_rate >= 45 ? '#ffcc66' : '#ff5c7a' },
              { label: 'W / L', value: `${trading.wins} / ${trading.losses}`, color: 'var(--text)' },
            ].map(m => (
              <div key={m.label}>
                <p style={{ fontFamily: 'Lato, sans-serif', fontSize: 10, color: 'var(--muted)', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '.05em' }}>{m.label}</p>
                <p style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 800, fontSize: 16, color: m.color, margin: 0 }}>{m.value}</p>
              </div>
            ))}
          </div>
          <a href="http://localhost:8000/ui" target="_blank" rel="noopener noreferrer"
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontFamily: 'Raleway, sans-serif', fontWeight: 700, color: 'var(--muted)', textDecoration: 'none', flexShrink: 0 }}>
            <ArrowUpRight size={13} /> Dashboard
          </a>
        </div>
      )}

      {/* ══ MAIN LAYOUT: left wide col + right sidebar ══ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 18, alignItems: 'start' }}>

        {/* ── LEFT: stacked full-width sections ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

          {/* 1 — Morning Briefing (full width) */}
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
            <CardHeader icon={Sunrise} title="Morning Briefing" color="#D97706"
              action={
                <Link href="/briefing/morning" style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 700, fontFamily: 'Raleway, sans-serif', color: '#D97706', textDecoration: 'none', opacity: 0.85 }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.opacity = '1')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.opacity = '0.85')}>
                  View all <ChevronRight size={12} />
                </Link>
              } />
            <div style={{ padding: '18px 20px' }}>
              {morningBrief ? (
                <div style={{ display: 'flex', gap: 24 }}>
                  {/* Summary text */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: 'Lato, sans-serif', fontSize: 13, color: 'var(--text)', lineHeight: 1.7, margin: 0 }}>
                      {morningBrief.content.slice(0, 300)}{morningBrief.content.length > 300 ? '…' : ''}
                    </p>
                  </div>
                  {/* Top priorities */}
                  {(morningBrief.top_priorities as string[])?.length > 0 && (
                    <div style={{ flexShrink: 0, width: 260 }}>
                      <p style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 800, fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.12em', margin: '0 0 8px' }}>Top priorities</p>
                      {(morningBrief.top_priorities as string[]).slice(0, 3).map((p, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '8px 10px', borderRadius: 10, background: 'var(--faint)', border: '1px solid var(--border)', marginBottom: 6 }}>
                          <span style={{ width: 20, height: 20, borderRadius: 6, background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, fontFamily: 'Raleway, sans-serif', flexShrink: 0 }}>{i + 1}</span>
                          <p style={{ fontFamily: 'Lato, sans-serif', fontSize: 12, color: 'var(--text)', margin: 0, lineHeight: 1.4 }}>{p}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <Empty icon={Sunrise} color="#D97706"
                  message="No briefing yet"
                  sub="Auto-generates every day at 8:00 AM using DeepSeek R1 7b"
                  href="/briefing/morning" cta="Generate now" />
              )}
            </div>
          </div>

          {/* 2 — Today's Tasks (full width) */}
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
            <CardHeader icon={CheckSquare} title="Today's Tasks" count={todayTasks.length} color="var(--brand)" href="/tasks" />
            {todayTasks.length === 0 ? (
              <Empty icon={CheckCircle2} color="var(--brand)"
                message="Nothing scheduled for today"
                sub="Use Daily Review tonight to auto-schedule tomorrow, or add tasks manually"
                href="/tasks" cta="Add tasks" />
            ) : (
              <div>
                {todayTasks.map((task, idx) => {
                  const pp = PP[task.priority] || PP.medium
                  const proj = task.project as Project | undefined
                  return (
                    <div key={task.id} onClick={() => setDrawerTask(task)} style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: idx < todayTasks.length - 1 ? '1px solid var(--border)' : 'none', background: idx % 2 === 0 ? 'transparent' : 'var(--row)', transition: 'background .12s', cursor: 'pointer' }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--hover)')}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = idx % 2 === 0 ? 'transparent' : 'var(--row)')}>
                      <Circle size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                      {/* Color dot for project */}
                      {proj && <div style={{ width: 7, height: 7, borderRadius: '50%', background: proj.color, flexShrink: 0 }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 13, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</p>
                        {proj && <p style={{ fontFamily: 'Lato, sans-serif', fontSize: 11, color: 'var(--muted)', margin: '2px 0 0' }}>{proj.name}</p>}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                        {task.deadline && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: task.deadline < today ? '#DC2626' : 'var(--muted)' }}>
                            <Clock size={9} />{task.deadline}
                          </span>
                        )}
                        <span style={{ padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', background: pp.bg, color: pp.color }}>{task.priority}</span>
                        <span style={{ padding: '2px 7px', borderRadius: 6, fontSize: 11, fontWeight: 700, fontFamily: 'monospace', background: 'var(--faint)', color: 'var(--muted)' }}>{task.effort}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 3 — Needs Attention (full width, only if items exist) */}
          <div style={{ background: 'var(--panel)', border: `1px solid ${attention.length > 0 ? 'rgba(220,38,38,.20)' : 'var(--border)'}`, borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
            <CardHeader icon={AlertCircle} title="Needs Attention" count={attention.length > 0 ? attention.length : undefined} color="#DC2626" />
            {attention.length === 0 ? (
              <div style={{ padding: '22px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(5,150,105,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <CheckCircle2 size={18} style={{ color: '#059669' }} />
                </div>
                <div>
                  <p style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 800, fontSize: 14, color: '#059669', margin: 0 }}>All clear!</p>
                  <p style={{ fontFamily: 'Lato, sans-serif', fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>No urgent or overdue tasks right now</p>
                </div>
              </div>
            ) : (
              <div>
                {attention.slice(0, 8).map((task, idx, arr) => {
                  const isOverdue = task.deadline && task.deadline < today
                  const dotColor = isOverdue ? '#D97706' : '#DC2626'
                  const proj = task.project as Project | undefined
                  return (
                    <div key={task.id} onClick={() => setDrawerTask(task)} style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: idx < arr.length - 1 ? '1px solid var(--border)' : 'none', transition: 'background .12s', cursor: 'pointer' }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(220,38,38,.03)')}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
                      {/* Pulsing dot */}
                      <div style={{ position: 'relative', width: 10, height: 10, flexShrink: 0 }}>
                        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: dotColor, opacity: .22, animation: 'attnPulse 2s infinite' }} />
                        <div style={{ position: 'absolute', inset: 2, borderRadius: '50%', background: dotColor }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 13, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</p>
                        <p style={{ fontFamily: 'Lato, sans-serif', fontSize: 11, color: dotColor, margin: '2px 0 0', fontWeight: 600 }}>
                          {isOverdue ? `Overdue · was due ${task.deadline}` : 'Urgent priority'}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                        <span style={{ padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', background: PP[task.priority]?.bg, color: PP[task.priority]?.color }}>{task.priority}</span>
                        {proj && (
                          <Link href={`/projects/${proj.id}`} onClick={e => e.stopPropagation()}
                            style={{ padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600, fontFamily: 'Raleway, sans-serif', color: 'var(--brand)', textDecoration: 'none', background: 'var(--faint)', border: '1px solid var(--border2)', flexShrink: 0, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}
                            title={proj.name}>
                            {proj.name}
                          </Link>
                        )}
                      </div>
                    </div>
                  )
                })}
                {attention.length > 8 && (
                  <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)', background: 'var(--faint)' }}>
                    <Link href="/tasks" style={{ fontFamily: 'Raleway, sans-serif', fontSize: 12, fontWeight: 700, color: 'var(--brand)', textDecoration: 'none' }}>
                      +{attention.length - 8} more urgent tasks →
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        {/* ── RIGHT SIDEBAR ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 24 }}>

          {/* Projects */}
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
            <CardHeader icon={Layers} title="Projects" color="var(--brand)" href="/projects" />
            <div style={{ padding: '10px' }}>
              {projects.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center' }}>
                  <p style={{ fontFamily: 'Lato, sans-serif', fontSize: 12, color: 'var(--muted)', margin: '0 0 8px' }}>No active projects</p>
                  <Link href="/projects" style={{ fontSize: 12, fontWeight: 700, fontFamily: 'Raleway, sans-serif', color: 'var(--brand)', textDecoration: 'none' }}>+ Create project</Link>
                </div>
              ) : projects.map(project => {
                const pt = allTasks.filter(t => t.project_id === project.id)
                const done = pt.filter(t => t.status === 'done').length
                const remaining = pt.length - done
                const pct = pt.length ? Math.round((done / pt.length) * 100) : 0
                const urgentCount = pt.filter(t => t.priority === 'urgent' && t.status !== 'done').length
                return (
                  <Link key={project.id} href={`/projects/${project.id}`}
                    style={{ display: 'block', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 7, textDecoration: 'none', transition: 'all .15s', background: 'transparent' }}
                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'var(--brand2)'; el.style.background = 'var(--hover)' }}
                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'var(--border)'; el.style.background = 'transparent' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: project.color, flexShrink: 0 }} />
                      <p style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 12, color: 'var(--text)', margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</p>
                      {urgentCount > 0 && (
                        <span style={{ padding: '1px 6px', borderRadius: 999, fontSize: 10, fontWeight: 800, fontFamily: 'Raleway, sans-serif', background: 'rgba(220,38,38,.12)', color: '#DC2626' }}>
                          {urgentCount} urgent
                        </span>
                      )}
                      <ChevronRight size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 4, borderRadius: 99, background: 'var(--faint)', overflow: 'hidden', border: '1px solid var(--border)' }}>
                        <div style={{ height: '100%', borderRadius: 99, background: project.color, width: `${pct}%`, transition: 'width .3s' }} />
                      </div>
                      <span style={{ fontFamily: 'Raleway, sans-serif', fontSize: 10, fontWeight: 700, color: 'var(--muted)', flexShrink: 0, minWidth: 28, textAlign: 'right' }}>{pct}%</span>
                    </div>
                    <p style={{ fontFamily: 'Lato, sans-serif', fontSize: 10, color: 'var(--muted)', margin: '4px 0 0' }}>{pt.length} total · {remaining} remaining · {done} done</p>
                  </Link>
                )
              })}
            </div>
          </div>

          {/* Evening Summary */}
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
            <CardHeader icon={Moon} title="Evening Summary" color="var(--brand)" href="/briefing/evening" />
            <div style={{ padding: '16px 18px' }}>
              {eveningBrief ? (
                <p style={{ fontFamily: 'Lato, sans-serif', fontSize: 13, color: 'var(--text)', lineHeight: 1.7, margin: 0 }}>
                  {eveningBrief.content.slice(0, 200)}…
                </p>
              ) : (
                <div style={{ textAlign: 'center', padding: '10px 0 4px' }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                    <Moon size={18} style={{ color: 'var(--brand)' }} />
                  </div>
                  <p style={{ fontFamily: 'Lato, sans-serif', fontSize: 12, color: 'var(--muted)', margin: '0 0 12px', lineHeight: 1.5 }}>Summary generates at 9:00 PM after your Daily Review</p>
                  <Link href="/checkin" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, background: 'var(--brand)', color: '#fff', fontFamily: 'Raleway, sans-serif', fontWeight: 700, fontSize: 12, textDecoration: 'none' }}>
                    Start Daily Review <ArrowUpRight size={12} />
                  </Link>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      <style>{`
        @keyframes attnPulse { 0%,100%{transform:scale(1);opacity:.22} 50%{transform:scale(2.2);opacity:.06} }
        @keyframes spin      { to { transform: rotate(360deg) } }
        @keyframes fadeIn    { from{opacity:0} to{opacity:1} }
        @keyframes slideDown { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:none} }
      `}</style>
    </div>
  )
}
