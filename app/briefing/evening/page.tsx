'use client'
import { useEffect, useState } from 'react'
import { Moon, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import { useCmdK } from '@/components/CmdKProvider'

const S = { fontFamily: 'Raleway, sans-serif' }

export default function EveningBriefingPage() {
  const { evening, generateBriefing } = useCmdK()
  const today = format(new Date(), 'yyyy-MM-dd')

  const [cached, setCached] = useState<{ content: string; priorities: string[] } | null>(null)
  const [loadingCache, setLoadingCache] = useState(true)

  useEffect(() => {
    if (evening.streaming || evening.done) { setLoadingCache(false); return }
    fetch(`/api/briefing?type=evening&date=${today}`)
      .then(r => r.json())
      .then(data => { if (data?.content) setCached({ content: data.content, priorities: data.top_priorities || [] }) })
      .catch(() => {})
      .finally(() => setLoadingCache(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today])

  function generate() {
    setCached(null)
    generateBriefing('evening', today)
  }

  const content    = evening.content || cached?.content || ''
  const priorities = evening.priorities.length ? evening.priorities : (cached?.priorities || [])
  const streaming  = evening.streaming
  const loading    = loadingCache && !evening.streaming && !evening.content
  const hasContent = content.length > 0

  return (
    <div style={{ padding: '28px 32px', maxWidth: 780, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ borderRadius: 'var(--r-xl)', padding: 24, color: '#fff', position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, var(--t1) 0%, var(--t2) 100%)', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Moon size={28} color="#CCFBF1" />
            <div>
              <h1 style={{ ...S, fontSize: 20, fontWeight: 900, margin: 0 }}>Evening Summary</h1>
              <p style={{ fontSize: 13, opacity: 0.8, margin: 0 }}>{format(new Date(), 'EEEE, MMMM d, yyyy')} · 9:00 PM</p>
            </div>
          </div>
          <button onClick={generate} disabled={streaming}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 'var(--r)', border: '1px solid rgba(255,255,255,.3)', background: 'rgba(255,255,255,.2)', backdropFilter: 'blur(8px)', cursor: streaming ? 'not-allowed' : 'pointer', opacity: streaming ? 0.6 : 1, color: '#fff', ...S, fontWeight: 700, fontSize: 13 }}>
            <RefreshCw size={14} style={{ animation: streaming ? 'spin .8s linear infinite' : 'none' }} />
            {streaming ? 'Generating…' : hasContent ? 'Regenerate' : 'Generate Now'}
          </button>
        </div>
        {streaming && (
          <div style={{ marginTop: 14, height: 3, borderRadius: 99, background: 'rgba(255,255,255,.2)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 99, background: 'rgba(255,255,255,.7)', width: `${Math.min(95, content.length / 6)}%`, transition: 'width .4s' }} />
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid var(--faint2)', borderTopColor: 'var(--brand2)', animation: 'spin .8s linear infinite' }} />
        </div>
      ) : !hasContent ? (
        <div className="card" style={{ borderRadius: 'var(--r-lg)', padding: '56px 0', textAlign: 'center' }}>
          <Moon size={44} style={{ color: 'var(--muted)', opacity: 0.2, display: 'block', margin: '0 auto 12px' }} />
          <p style={{ ...S, fontWeight: 700, fontSize: 15, color: 'var(--text)', margin: 0 }}>No evening summary yet</p>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 20px' }}>Complete your check-in first, then generate your summary</p>
          <button onClick={generate} className="btn-primary" style={{ padding: '10px 28px', fontSize: 13 }}>Generate Now</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {priorities.length > 0 && (
            <div className="card" style={{ borderRadius: 'var(--r-lg)', padding: 24 }}>
              <p style={{ ...S, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', marginBottom: 14 }}>Tomorrow's Execution Plan — Do In This Order</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {priorities.map((p, i) => {
                  const [task, why] = p.includes(' — ') ? p.split(' — ') : [p, null]
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', borderRadius: 'var(--r)', background: 'var(--st1-bg)' }}>
                      <span style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, flexShrink: 0, background: 'var(--brand2)', color: '#fff', ...S }}>{i + 1}</span>
                      <div>
                        <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0, color: 'var(--text)', fontFamily: 'Lato, sans-serif', fontWeight: 600 }}>{task}</p>
                        {why && <p style={{ fontSize: 11, margin: '3px 0 0', color: 'var(--muted)', fontFamily: 'Lato, sans-serif' }}>↳ {why}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="card" style={{ borderRadius: 'var(--r-lg)', padding: 24 }}>
            {streaming && <p style={{ ...S, fontSize: 11, fontWeight: 700, color: 'var(--brand2)', marginBottom: 12, marginTop: 0 }}>Generating…</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {content.split('\n\n').filter(p => p.trim() && !p.startsWith('PRIORITIES_JSON') && !p.startsWith('PLAN_JSON')).map((para, i) => (
                <p key={i} style={{ fontSize: 13, lineHeight: 1.75, margin: 0, color: 'var(--text)', fontFamily: 'Lato, sans-serif' }}
                  dangerouslySetInnerHTML={{ __html: para
                    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.+?)\*/g, '<em>$1</em>')
                  }}
                />
              ))}
              {streaming && <span style={{ display: 'inline-block', width: 2, height: 16, background: 'var(--brand2)', animation: 'blink 1s step-end infinite', verticalAlign: 'middle', marginLeft: 2 }} />}
            </div>
          </div>

          {evening.error && (
            <p style={{ fontSize: 12, color: 'var(--bad)', textAlign: 'center', margin: 0 }}>{evening.error}</p>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>
    </div>
  )
}
