'use client'
import { useState, useEffect, useCallback } from 'react'
import { Mail, RefreshCw, Send, AlertTriangle, Check, X, Plus, CheckCircle2 } from 'lucide-react'
import AgentPageLayout from '@/components/agents/AgentPageLayout'

const COLOR = '#DC2626'

interface EmailItem { uid: number; from: string; subject: string; date: string; snippet: string; unread: boolean; priority?: string; category?: string; summary?: string }
interface Draft { uid: number; subject: string; to: string; draft: string }
interface TaskForm { uid: number; title: string; priority: string }

const EMAIL_TO_PRIORITY: Record<string, string> = {
  urgent: 'urgent', important: 'high', low: 'medium', 'can-ignore': 'low',
}

export default function EmailAgentPage() {
  const [inbox, setInbox] = useState<EmailItem[]>([])
  const [unreadCount, setUnreadCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [triaging, setTriaging] = useState(false)
  const [selectedEmail, setSelectedEmail] = useState<EmailItem | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [draftInstruction, setDraftInstruction] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendConfirm, setSendConfirm] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  // Email → Task state
  const [taskForm, setTaskForm] = useState<TaskForm | null>(null)
  const [creatingTask, setCreatingTask] = useState(false)
  const [taskCreated, setTaskCreated] = useState<number | null>(null) // uid of created task

  const loadCount = useCallback(async () => {
    const res = await fetch('/api/agents/email?action=get_unread_count').catch(() => null)
    if (res?.ok) {
      const d = await res.json()
      setUnreadCount(d.data?.unread ?? 0)
    }
  }, [])

  useEffect(() => { loadCount() }, [loadCount])

  async function fetchInbox() {
    setLoading(true)
    const res = await fetch('/api/agents/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'fetch_inbox', params: { limit: 15, unread_only: false } }) })
    const d = await res.json()
    if (d.ok) setInbox(d.data ?? [])
    setLoading(false)
  }

  async function triageInbox() {
    setTriaging(true)
    const res = await fetch('/api/agents/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'triage_inbox', params: { limit: 15 } }) })
    const d = await res.json()
    if (d.ok) setInbox(d.data ?? [])
    setTriaging(false)
  }

  async function getDraft() {
    if (!selectedEmail || !draftInstruction.trim()) return
    setDrafting(true)
    const res = await fetch('/api/agents/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'draft_reply', params: { uid: selectedEmail.uid, instruction: draftInstruction } }) })
    const d = await res.json()
    if (d.ok) setDraft({ uid: selectedEmail.uid, subject: d.data.subject, to: d.data.reply_to, draft: d.data.draft })
    setDrafting(false)
  }

  async function sendDraft() {
    if (!draft) return
    setSending(true)
    const res = await fetch('/api/agents/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'send_reply', params: { uid: draft.uid, body: draft.draft } }) })
    const d = await res.json()
    setResult(d.ok ? '✓ Reply sent' : `✗ ${d.message}`)
    setSending(false)
    setSendConfirm(false)
    setDraft(null)
    setSelectedEmail(null)
  }

  async function createTask() {
    if (!taskForm) return
    setCreatingTask(true)
    const email = inbox.find(e => e.uid === taskForm.uid)
    await fetch('/api/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: taskForm.title,
        description: email?.summary || email?.snippet || '',
        priority: taskForm.priority,
        status: 'todo',
      }),
    }).catch(() => {})
    setCreatingTask(false)
    setTaskCreated(taskForm.uid)
    setTaskForm(null)
    setTimeout(() => setTaskCreated(null), 3000)
  }

  const PRIORITY_COLOR: Record<string, string> = { urgent: '#ef4444', important: '#f97316', low: '#94a3b8', 'can-ignore': '#94a3b8' }
  const CAT_COLOR: Record<string, string> = { 'action-required': '#ef4444', 'reply-needed': '#f97316', fyi: '#3b82f6', newsletter: '#94a3b8', automated: '#94a3b8' }

  const inp: React.CSSProperties = { padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--panel2)', color: 'var(--text)', fontFamily: 'Lato', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }

  const dashboard = (
    <div style={{ maxWidth: 860 }}>
      {/* Stats + actions */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
        <div style={{ background: 'var(--panel)', borderRadius: 14, padding: '16px 20px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
          <Mail size={20} color={COLOR} />
          <div>
            <div style={{ fontSize: 26, fontWeight: 900, color: unreadCount !== null ? COLOR : 'var(--muted)', fontFamily: 'Raleway' }}>{unreadCount ?? '…'}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>unread emails</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={fetchInbox} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--text)', fontFamily: 'Raleway', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            {loading ? <RefreshCw size={13} style={{ animation: 'spin .8s linear infinite' }} /> : <Mail size={13} />} Load Inbox
          </button>
          <button onClick={triageInbox} disabled={triaging} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 10, border: `1px solid ${COLOR}30`, background: `${COLOR}08`, color: COLOR, fontFamily: 'Raleway', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            {triaging ? <RefreshCw size={13} style={{ animation: 'spin .8s linear infinite' }} /> : <AlertTriangle size={13} />} AI Triage
          </button>
        </div>
      </div>

      {result && <div style={{ padding: '10px 14px', borderRadius: 9, border: '1px solid var(--border)', background: result.startsWith('✓') ? '#22c55e10' : '#ef444410', color: result.startsWith('✓') ? '#16a34a' : '#dc2626', fontFamily: 'Lato', fontSize: 13, marginBottom: 14 }}>{result}</div>}

      {/* Email list */}
      {inbox.length > 0 && (
        <div style={{ background: 'var(--panel)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Inbox ({inbox.length})</span>
          </div>
          {inbox.map(email => (
            <div key={email.uid} onClick={() => setSelectedEmail(email.uid === selectedEmail?.uid ? null : email)} style={{
              padding: '13px 18px', borderBottom: '1px solid var(--faint)', cursor: 'pointer',
              background: selectedEmail?.uid === email.uid ? `${COLOR}06` : email.unread ? 'var(--faint)' : 'transparent',
              transition: 'background .1s',
            }}
            onMouseEnter={e => { if (selectedEmail?.uid !== email.uid) e.currentTarget.style.background = 'var(--faint)' }}
            onMouseLeave={e => { if (selectedEmail?.uid !== email.uid) e.currentTarget.style.background = email.unread ? 'var(--faint)' : 'transparent' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: email.unread ? COLOR : 'transparent', border: email.unread ? 'none' : '1px solid var(--border)', flexShrink: 0, marginTop: 5 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: email.unread ? 800 : 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{email.subject || '(no subject)'}</span>
                    {email.priority && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 5, background: `${PRIORITY_COLOR[email.priority] || '#94a3b8'}15`, color: PRIORITY_COLOR[email.priority] || '#94a3b8', flexShrink: 0 }}>{email.priority}</span>}
                    {email.category && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 5, background: `${CAT_COLOR[email.category] || '#94a3b8'}15`, color: CAT_COLOR[email.category] || '#94a3b8', flexShrink: 0 }}>{email.category}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato', marginBottom: 4 }}>{email.from?.slice(0, 50)}</div>
                  {email.summary ? <div style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'Lato', lineHeight: 1.4 }}>{email.summary}</div> : <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato' }}>{email.snippet?.slice(0, 100)}</div>}
                </div>
                {/* → Task button */}
                <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                  {taskCreated === email.uid ? (
                    <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={12} /> Task created</span>
                  ) : (
                    <button
                      onClick={() => setTaskForm({ uid: email.uid, title: email.subject || '(no subject)', priority: EMAIL_TO_PRIORITY[email.priority ?? ''] ?? 'medium' })}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--muted)', fontFamily: 'Raleway', fontWeight: 700, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      <Plus size={10} /> Task
                    </button>
                  )}
                </div>
              </div>

              {/* Inline task creation form */}
              {taskForm?.uid === email.uid && (
                <div onClick={e => e.stopPropagation()} style={{ marginTop: 10, padding: '12px 14px', borderRadius: 10, background: 'var(--faint)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', fontFamily: 'Raleway', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Create Task from Email</div>
                  <input
                    value={taskForm.title}
                    onChange={e => setTaskForm(f => f ? { ...f, title: e.target.value } : null)}
                    style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', fontFamily: 'Lato', fontSize: 13, outline: 'none' }}
                    onKeyDown={e => { if (e.key === 'Enter') createTask(); if (e.key === 'Escape') setTaskForm(null) }}
                    autoFocus
                  />
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {(['urgent', 'high', 'medium', 'low'] as const).map(p => {
                      const pc = { urgent: '#ff5c7a', high: '#ffcc66', medium: '#3dd6d0', low: '#27d98a' }[p]
                      return (
                        <button key={p} type="button" onClick={() => setTaskForm(f => f ? { ...f, priority: p } : null)} style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, fontFamily: 'Raleway', cursor: 'pointer', border: `1.5px solid ${taskForm.priority === p ? pc : 'var(--border)'}`, background: taskForm.priority === p ? `${pc}18` : 'transparent', color: taskForm.priority === p ? pc : 'var(--muted)', transition: 'all .1s' }}>
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </button>
                      )
                    })}
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                      <button type="button" onClick={() => setTaskForm(null)} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--muted)', fontFamily: 'Raleway', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                      <button type="button" onClick={createTask} disabled={!taskForm.title.trim() || creatingTask} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 14px', borderRadius: 8, border: 'none', background: '#22c55e', color: '#fff', fontFamily: 'Raleway', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                        <Plus size={11} /> {creatingTask ? 'Creating…' : 'Create Task'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Draft panel */}
      {selectedEmail && (
        <div style={{ background: 'var(--panel)', borderRadius: 14, padding: 20, border: `1px solid ${COLOR}30` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Reply to: {selectedEmail.subject?.slice(0, 50)}</h3>
            <button onClick={() => { setSelectedEmail(null); setDraft(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={16} /></button>
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <input value={draftInstruction} onChange={e => setDraftInstruction(e.target.value)} placeholder='Instruction, e.g. "decline politely" or "confirm attendance"' style={{ ...inp, flex: 1 }} onKeyDown={e => e.key === 'Enter' && getDraft()} />
            <button onClick={getDraft} disabled={!draftInstruction.trim() || drafting} style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: COLOR, color: '#fff', fontFamily: 'Raleway', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: drafting ? 0.7 : 1 }}>
              {drafting ? <RefreshCw size={13} style={{ animation: 'spin .8s linear infinite' }} /> : <Mail size={13} />} Draft
            </button>
          </div>

          {draft && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Draft Reply</div>
              <textarea value={draft.draft} onChange={e => setDraft(d => d ? { ...d, draft: e.target.value } : null)} rows={6} style={{ ...inp, resize: 'vertical' }} />
              <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
                {!sendConfirm ? (
                  <button onClick={() => setSendConfirm(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, border: 'none', background: COLOR, color: '#fff', fontFamily: 'Raleway', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
                    <Send size={13} /> Send Reply
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 14px', borderRadius: 9, background: '#ef444410', border: '1px solid #ef444430' }}>
                    <AlertTriangle size={13} color="#ef4444" />
                    <span style={{ fontSize: 12, color: '#dc2626', fontFamily: 'Lato' }}>Send to {draft.to?.slice(0, 30)}?</span>
                    <button onClick={sendDraft} disabled={sending} style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: '#ef4444', color: '#fff', fontFamily: 'Raleway', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                      {sending ? 'Sending…' : 'Confirm Send'}
                    </button>
                    <button onClick={() => setSendConfirm(false)} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--muted)', fontFamily: 'Raleway', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                  </div>
                )}
                <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>Safety lock: send requires explicit confirm</span>
              </div>
            </div>
          )}
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <AgentPageLayout
      agentId="email"
      agentName="Email Agent"
      agentColor={COLOR}
      agentIcon={<Mail size={20} />}
      description="Gmail inbox triage & AI drafts · all processing local via Ollama"
      tabs={['dashboard', 'chat', 'settings']}
      starters={['How many unread emails do I have?', 'Triage my inbox', 'Summarise my latest email', 'Search emails about PhD']}
      dashboard={dashboard}
      settings={<div style={{ padding: 20, color: 'var(--muted)', fontFamily: 'Lato', fontSize: 13 }}>Email settings coming soon. Note: sending always requires explicit confirmation.</div>}
      commandCenter={<div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>Unread</span><span style={{ fontSize: 12, fontWeight: 800, color: unreadCount ? COLOR : '#22c55e' }}>{unreadCount ?? '…'}</span></div>}
    />
  )
}
