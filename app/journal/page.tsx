'use client'
import { useEffect, useState } from 'react'
import type { JournalEntry } from '@/lib/types'
import { supabase } from '@/lib/supabase'
import { format, parseISO } from 'date-fns'
import { BookOpen, Zap, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import ConfirmDialog from '@/components/ConfirmDialog'

const S = { fontFamily: 'Raleway, sans-serif' }
const energyLabel = ['', 'Exhausted', 'Low', 'Moderate', 'High', 'Excellent']
const energyColor = ['', '#ff5c7a', '#ffcc66', '#eab308', '#27d98a', '#3dd6d0']
const energyBg    = ['', 'rgba(255,92,122,.15)', 'rgba(255,204,102,.12)', 'rgba(234,179,8,.12)', 'rgba(39,217,138,.12)', 'rgba(61,214,208,.12)']

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<JournalEntry | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    const { data } = await supabase.from('journal_entries').select('*').order('date', { ascending: false }).limit(60)
    setEntries(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function confirmDelete() {
    if (!deleteTarget) return
    await supabase.from('journal_entries').delete().eq('id', deleteTarget.id)
    setDeleteTarget(null)
    if (expanded === deleteTarget.id) setExpanded(null)
    load()
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--faint)', borderTopColor: 'var(--brand)', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  return (
    <div style={{ padding: '28px 32px', maxWidth: 760, margin: '0 auto' }}>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete journal entry?"
          message={`The entry for ${format(parseISO(deleteTarget.date), 'MMMM d, yyyy')} will be permanently removed.`}
          confirmLabel="Delete Entry"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ ...S, fontWeight: 900, fontSize: 24, color: 'var(--text)', margin: 0 }}>Journal</h1>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>{entries.length} entries</p>
      </div>

      {entries.length === 0 ? (
        <div className="card" style={{ borderRadius: 20, padding: '56px 0', textAlign: 'center' }}>
          <BookOpen size={36} style={{ color: 'var(--muted)', opacity: 0.25, display: 'block', margin: '0 auto 12px' }} />
          <p style={{ ...S, color: 'var(--muted)', fontWeight: 600 }}>No journal entries yet.</p>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Complete your first evening check-in to start.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {entries.map(entry => {
            const open = expanded === entry.id
            const el = entry.energy_level
            return (
              <div key={entry.id} className="card" style={{ borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
                {/* Row header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                  <button
                    onClick={() => setExpanded(open ? null : entry.id)}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', gap: 0,
                      background: open ? 'var(--faint)' : 'transparent',
                      border: 'none', cursor: 'pointer', padding: '14px 18px', textAlign: 'left',
                      transition: 'background .15s',
                    }}>
                    {/* Date block */}
                    <div style={{ width: 48, flexShrink: 0, marginRight: 16, textAlign: 'center' }}>
                      <p style={{ ...S, fontSize: 26, fontWeight: 900, color: 'var(--brand)', margin: 0, lineHeight: 1 }}>
                        {format(parseISO(entry.date), 'd')}
                      </p>
                      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', margin: 0 }}>
                        {format(parseISO(entry.date), 'MMM')}
                      </p>
                    </div>
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <p style={{ ...S, fontSize: 13, fontWeight: 800, color: 'var(--text)', margin: 0 }}>
                        {format(parseISO(entry.date), 'EEEE')}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                        <span style={{ padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', background: energyBg[el], color: energyColor[el] }}>
                          {energyLabel[el]}
                        </span>
                        {entry.ai_tasks_scheduled?.length > 0 && (
                          <span style={{ padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, fontFamily: 'Raleway, sans-serif', background: 'var(--chip-bg)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Zap size={9} /> {entry.ai_tasks_scheduled.length} scheduled
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ color: 'var(--muted)', marginRight: 8 }}>
                      {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </div>
                  </button>

                  {/* Delete button — always visible */}
                  <button
                    onClick={() => setDeleteTarget(entry)}
                    title="Delete entry"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '14px 16px', color: 'var(--muted)',
                      borderLeft: '1px solid var(--border)', transition: 'all .15s',
                      flexShrink: 0,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#ff5c7a'; e.currentTarget.style.background = 'rgba(255,92,122,.06)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'none' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Expanded content */}
                {open && (
                  <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--border)' }}>
                    {entry.ai_summary && (
                      <div className="ai-block" style={{ marginTop: 16 }}>
                        <p style={{ ...S, fontSize: 11, fontWeight: 800, color: 'var(--brand2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>✨ AI Summary</p>
                        <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>{entry.ai_summary}</p>
                      </div>
                    )}
                    {[
                      { label: '✅ Completed Today',   value: entry.completed_today },
                      { label: '🚧 Blocked / Pushed', value: entry.blocked_or_pushed },
                      { label: '💡 New Tasks',         value: entry.new_tasks },
                      { label: '🎯 Tomorrow Focus',    value: entry.tomorrow_focus },
                    ].map(({ label, value }) => value ? (
                      <div key={label} style={{ marginTop: 12, padding: '12px 14px', borderRadius: 12, background: 'var(--faint)', border: '1px solid var(--border)' }}>
                        <p style={{ ...S, fontSize: 11, fontWeight: 800, color: 'var(--muted)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</p>
                        <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55, margin: 0 }}>{value}</p>
                      </div>
                    ) : null)}
                    {entry.ai_tasks_scheduled?.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <p style={{ ...S, fontSize: 11, fontWeight: 800, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>🤖 Tasks Scheduled by AI</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {entry.ai_tasks_scheduled.map((t, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: 'var(--chip-bg)', border: '1px solid var(--chip-bdr)' }}>
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--brand2)', flexShrink: 0 }} />
                              <span style={{ fontSize: 13, color: 'var(--text)' }}>{t}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
