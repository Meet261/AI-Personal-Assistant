'use client'
import { useState, useEffect, useRef } from 'react'
import { CheckCircle2, Zap, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react'
import { format } from 'date-fns'

const S = { fontFamily: 'Raleway, sans-serif' }

const QUESTIONS = [
  { key: 'completed_today',   label: 'What did you complete today?',                    hint: "List everything you finished — big or small. Be honest with yourself.", type: 'textarea', icon: '✅' },
  { key: 'blocked_or_pushed', label: "What got blocked or pushed to tomorrow?",          hint: "What didn't happen? Why? Don't judge — just note it.",                type: 'textarea', icon: '🚧' },
  { key: 'new_tasks',         label: 'Any new tasks or ideas that came up today?',       hint: 'Capture anything new before it slips your mind.',                    type: 'textarea', icon: '💡' },
  { key: 'energy_level',      label: 'How was your energy level today?',                 hint: 'This helps the AI understand your capacity when planning tomorrow.',  type: 'energy',   icon: '⚡' },
  { key: 'tomorrow_focus',    label: 'One thing you want to make sure happens tomorrow?', hint: "Just one. What's the single most important thing?",                  type: 'text',     icon: '🎯' },
]

const energyLabels = ['', 'Exhausted', 'Low', 'Moderate', 'High', 'Excellent']
const energyColors = ['', '#ff5c7a', '#ffcc66', '#3dd6d0', '#27d98a', '#0F766E']

const inp: React.CSSProperties = {
  background: 'var(--faint)', border: '1px solid var(--border)', color: 'var(--text)',
  borderRadius: 'var(--r)', padding: '10px 14px', fontSize: 13, fontFamily: 'Lato, sans-serif',
  outline: 'none', width: '100%', transition: 'border-color .2s', boxSizing: 'border-box',
}

const STORAGE_KEY = 'checkin_draft'

function loadDraft() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveDraft(step: number, answers: Record<string, string | number>) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ step, answers })) } catch {}
}

function clearDraft() {
  try { sessionStorage.removeItem(STORAGE_KEY) } catch {}
}

export default function CheckinPage() {
  const [step, setStep]       = useState<number>(0)
  const [answers, setAnswers] = useState<Record<string, string | number>>(
    { completed_today: '', blocked_or_pushed: '', new_tasks: '', energy_level: 3, tomorrow_focus: '' }
  )
  const [draft, setDraft] = useState<ReturnType<typeof loadDraft>>(null)
  const hydrated = useRef(false)

  // Load draft after hydration to avoid SSR mismatch
  useEffect(() => {
    if (hydrated.current) return
    hydrated.current = true
    const d = loadDraft()
    if (d) {
      setDraft(d)
      setStep(d.step ?? 0)
      setAnswers(d.answers ?? { completed_today: '', blocked_or_pushed: '', new_tasks: '', energy_level: 3, tomorrow_focus: '' })
    }
  }, [])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ summary: string; tasksScheduled: Array<{ title: string; priority: string }> } | null>(null)

  // Persist to sessionStorage whenever step or answers change
  useEffect(() => {
    if (!hydrated.current) return
    saveDraft(step, answers)
    setDraft({ step, answers })
  }, [step, answers])

  const q = QUESTIONS[step]
  const isLast  = step === QUESTIONS.length - 1
  const canNext = String(answers[q.key]).trim().length > 0

  async function submit() {
    setSubmitting(true)
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answers),
      })
      const data = await res.json()
      clearDraft()
      setResult(data)
    } catch {
      // keep submitting false so user can retry
    } finally {
      setSubmitting(false)
    }
  }

  // ── Result screen ──
  if (result) return (
    <div style={{ padding: '28px 32px', maxWidth: 640, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', background: 'var(--st1-bg)', border: '2px solid var(--ai-border)' }}>
          <CheckCircle2 size={34} style={{ color: 'var(--brand2)' }} />
        </div>
        <h1 style={{ ...S, fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: '0 0 6px' }}>Check-in Complete</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>{format(new Date(), 'EEEE, MMMM d')}</p>
      </div>

      <div className="ai-block" style={{ padding: 24, marginBottom: 16, borderRadius: 'var(--r-lg)' }}>
        <p style={{ ...S, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--brand2)', marginBottom: 10 }}>AI Summary</p>
        <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', margin: 0, fontFamily: 'Lato, sans-serif' }}>{result.summary}</p>
      </div>

      {result.tasksScheduled?.length > 0 && (
        <div className="card" style={{ borderRadius: 'var(--r-lg)', padding: 24 }}>
          <p style={{ ...S, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 12 }}>
            Scheduled for Tomorrow ({result.tasksScheduled.length} tasks)
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {result.tasksScheduled.map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 'var(--r)', background: 'var(--st1-bg)' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--brand2)', flexShrink: 0 }} />
                <span style={{ fontSize: 13, flex: 1, color: 'var(--text)', fontFamily: 'Lato, sans-serif' }}>{t.title}</span>
                <span className="chip" style={{ background: 'var(--faint2)', color: 'var(--brand2)' }}>{t.priority}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  // ── Question flow ──
  return (
    <div style={{ padding: '28px 32px', maxWidth: 640, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={15} style={{ color: 'var(--brand2)' }} />
            <span style={{ ...S, fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>Evening Check-in</span>
            {draft && step > 0 && (
              <span style={{ fontSize: 11, color: 'var(--brand2)', fontWeight: 700, ...S, background: 'var(--chip-bg)', padding: '2px 8px', borderRadius: 6 }}>
                Draft saved
              </span>
            )}
          </div>
          {draft && (
            <button onClick={() => { clearDraft(); setDraft(null); setStep(0); setAnswers({ completed_today: '', blocked_or_pushed: '', new_tasks: '', energy_level: 3, tomorrow_focus: '' }) }}
              style={{ fontSize: 11, color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', ...S, fontWeight: 700 }}>
              Start fresh
            </button>
          )}
        </div>
        <h1 style={{ ...S, fontSize: 24, fontWeight: 900, color: 'var(--text)', margin: '0 0 4px' }}>5-Minute Reflection</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>{format(new Date(), 'EEEE, MMMM d')}</p>
      </div>

      {/* Progress */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
        {QUESTIONS.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 5, borderRadius: 99, transition: 'background .3s', background: i < step ? 'var(--brand2)' : i === step ? 'var(--brand)' : 'var(--border)' }} />
        ))}
      </div>

      {/* Question card */}
      <div className="card" style={{ borderRadius: 'var(--r-xl)', padding: 32, marginBottom: 20, boxShadow: 'var(--shadow-md)' }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 22 }}>{q.icon}</span>
            <span style={{ ...S, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--brand2)' }}>
              Question {step + 1} of {QUESTIONS.length}
            </span>
          </div>
          <h2 style={{ ...S, fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: '0 0 6px' }}>{q.label}</h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>{q.hint}</p>
        </div>

        {q.type === 'textarea' && (
          <textarea autoFocus value={String(answers[q.key])}
            onChange={e => setAnswers(a => ({ ...a, [q.key]: e.target.value }))}
            placeholder="Type your answer…" rows={5}
            style={{ ...inp, resize: 'none' }}
            onFocus={e => (e.target.style.borderColor = 'var(--brand)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
        )}
        {q.type === 'text' && (
          <input autoFocus value={String(answers[q.key])}
            onChange={e => setAnswers(a => ({ ...a, [q.key]: e.target.value }))}
            placeholder="Type your answer…"
            style={inp}
            onFocus={e => (e.target.style.borderColor = 'var(--brand)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
        )}
        {q.type === 'energy' && (
          <div style={{ display: 'flex', gap: 8 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => setAnswers(a => ({ ...a, energy_level: n }))}
                style={{
                  flex: 1, padding: '16px 0', borderRadius: 'var(--r-lg)', cursor: 'pointer', transition: 'all .2s',
                  background: answers.energy_level === n ? energyColors[n] : 'var(--faint)',
                  color: answers.energy_level === n ? '#fff' : 'var(--muted)',
                  border: `2px solid ${answers.energy_level === n ? energyColors[n] : 'var(--border)'}`,
                  ...S, fontWeight: 900, fontSize: 18,
                  transform: answers.energy_level === n ? 'scale(1.06)' : 'scale(1)',
                  boxShadow: answers.energy_level === n ? 'var(--shadow-md)' : 'none',
                }}>
                {n}
                <div style={{ fontSize: 10, fontWeight: 500, marginTop: 4, fontFamily: 'Lato, sans-serif', opacity: 0.85 }}>
                  {energyLabels[n]}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
          className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', fontSize: 13, opacity: step === 0 ? 0.3 : 1 }}>
          <ArrowLeft size={14} /> Back
        </button>
        {isLast ? (
          <button onClick={submit} disabled={submitting || !canNext} className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 22px', fontSize: 13, opacity: (!canNext || submitting) ? 0.4 : 1 }}>
            {submitting ? <><Loader2 size={14} className="animate-spin" /> Analyzing…</> : <><CheckCircle2 size={14} /> Complete Check-in</>}
          </button>
        ) : (
          <button onClick={() => setStep(s => s + 1)} disabled={!canNext} className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 22px', fontSize: 13, opacity: !canNext ? 0.4 : 1 }}>
            Next <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
