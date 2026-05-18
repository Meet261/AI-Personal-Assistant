'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Microscope, Zap, RefreshCw, CheckCircle2, Clock, Star, X, AlertTriangle } from 'lucide-react'
import AgentPageLayout from '@/components/agents/AgentPageLayout'

const COLOR = '#9D174D'

interface Paper { id: string; title: string; authors: string; year: number; summary: string | null; tags: string[]; dissertation_relevance: number | null; notes: string | null }
interface JobProgress { type: string; processed?: number; total?: number; current?: string; title?: string; reason?: string; job_id?: string; failed?: string[] }
interface ActiveJob { id: string; status: string; total_papers: number; processed: number; failed: number; current_paper: string | null }

export default function DigesterAgentPage() {
  const [undigested, setUndigested] = useState<Paper[]>([])
  const [digested, setDigested] = useState<Paper[]>([])
  const [loading, setLoading] = useState(true)
  const [digesting, setDigesting] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  // Job progress state
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null)
  const [jobLog, setJobLog] = useState<{ title: string; ok: boolean }[]>([])
  const [jobRunning, setJobRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [all, statusRes] = await Promise.allSettled([
      fetch('/api/research/papers').then(r => r.json()),
      fetch('/api/agents/paper-digester').then(r => r.json()),
    ])
    if (all.status === 'fulfilled') {
      const papers = all.value as Paper[]
      setDigested(papers.filter(p => p.summary))
    }
    if (statusRes.status === 'fulfilled') {
      setUndigested(statusRes.value.data ?? [])
      if (statusRes.value.activeJob) {
        setActiveJob(statusRes.value.activeJob)
        setJobRunning(statusRes.value.activeJob.status === 'running')
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function digestOne(paperId: string) {
    setDigesting(paperId)
    const res = await fetch('/api/agents/paper-digester', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'digest_one', params: { paper_id: paperId } }),
    })
    const data = await res.json()
    setResult(data.ok ? `✓ ${data.summary?.slice(0, 80)}…` : `✗ ${data.message}`)
    setDigesting(null)
    load()
  }

  async function digestAll(force = false) {
    setJobRunning(true)
    setJobLog([])
    setResult(null)
    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/agents/paper-digester', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'digest_all', params: { force } }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const err = await res.json()
        setResult(`✗ ${err.message}`)
        setJobRunning(false)
        return
      }

      // Handle SSE stream for progress
      if (res.headers.get('content-type')?.includes('text/event-stream')) {
        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buf = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const evt: JobProgress = JSON.parse(line.slice(6))
              if (evt.type === 'start') {
                setActiveJob({ id: evt.job_id!, status: 'running', total_papers: evt.total!, processed: 0, failed: 0, current_paper: null })
              } else if (evt.type === 'progress' || evt.type === 'paper_done') {
                setActiveJob(j => j ? { ...j, processed: evt.processed ?? j.processed, current_paper: evt.current ?? j.current_paper } : j)
                if (evt.type === 'paper_done') setJobLog(l => [...l, { title: evt.title!, ok: true }])
              } else if (evt.type === 'paper_failed') {
                setJobLog(l => [...l, { title: evt.title!, ok: false }])
                setActiveJob(j => j ? { ...j, failed: (j.failed || 0) + 1 } : j)
              } else if (evt.type === 'done') {
                setResult(`✓ Digested ${evt.processed}/${evt.total} papers${evt.failed?.length ? ` (${evt.failed.length} failed)` : ''}`)
                setActiveJob(j => j ? { ...j, status: 'done', current_paper: null } : j)
              }
            } catch { /* skip malformed */ }
          }
        }
      } else {
        // Non-streaming fallback (already done etc.)
        const data = await res.json()
        setResult(data.message)
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setResult(`✗ ${String(e)}`)
    }
    setJobRunning(false)
    load()
  }

  async function cancelJob() {
    abortRef.current?.abort()
    if (activeJob?.id) {
      await fetch('/api/agents/paper-digester', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel_job', params: { job_id: activeJob.id } }),
      })
    }
    setJobRunning(false)
    setActiveJob(null)
    load()
  }

  function parseHaikuTags(tags: string[]) {
    const keywords = tags.filter(t => !t.startsWith('category:') && !t.startsWith('theme:'))
    const category = tags.find(t => t.startsWith('category:'))?.replace('category:', '') ?? null
    return { keywords, category }
  }

  const estimatedCost = (undigested.length * 0.004).toFixed(2)
  const jobPct = activeJob ? Math.round((activeJob.processed / activeJob.total_papers) * 100) : 0

  const dashboard = (
    <div style={{ maxWidth: 860 }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
        {[
          { label: 'Total Papers', value: digested.length + undigested.length, color: 'var(--text)' },
          { label: 'Digested', value: digested.length, color: '#22c55e' },
          { label: 'Pending', value: undigested.length, color: undigested.length ? '#f97316' : '#22c55e' },
          { label: 'Est. Cost', value: `$${estimatedCost}`, color: COLOR },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--panel)', borderRadius: 14, padding: '16px 18px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: s.color, fontFamily: 'Raleway' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Result message */}
      {result && !jobRunning && (
        <div style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border)', background: result.startsWith('✓') ? '#22c55e10' : '#ef444410', color: result.startsWith('✓') ? '#16a34a' : '#dc2626', fontFamily: 'Lato', fontSize: 13, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{result}</span>
          <button onClick={() => setResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 4 }}><X size={14} /></button>
        </div>
      )}

      {/* Live job progress */}
      {(jobRunning || (activeJob && activeJob.status === 'running')) && (
        <div style={{ background: 'var(--panel)', borderRadius: 14, border: `1px solid ${COLOR}30`, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <RefreshCw size={14} color={COLOR} style={{ animation: 'spin .8s linear infinite' }} />
              <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>Digesting papers…</span>
            </div>
            <button onClick={cancelJob} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, border: '1px solid #ef444430', background: '#ef444408', color: '#dc2626', fontFamily: 'Raleway', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
              <X size={11} /> Cancel
            </button>
          </div>

          {/* Progress bar */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato' }}>
                {activeJob?.current_paper ? `Processing: ${activeJob.current_paper.slice(0, 50)}…` : 'Starting…'}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: COLOR }}>{activeJob?.processed ?? 0}/{activeJob?.total_papers ?? 0}</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--faint)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${jobPct}%`, background: COLOR, borderRadius: 4, transition: 'width .5s ease' }} />
            </div>
          </div>

          {/* Paper log */}
          {jobLog.length > 0 && (
            <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {[...jobLog].reverse().map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontFamily: 'Lato' }}>
                  {item.ok
                    ? <CheckCircle2 size={11} color="#22c55e" />
                    : <AlertTriangle size={11} color="#f97316" />}
                  <span style={{ color: item.ok ? 'var(--text)' : '#f97316' }}>{item.title?.slice(0, 70)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pending papers */}
      {undigested.length > 0 && !jobRunning && (
        <div style={{ background: 'var(--panel)', borderRadius: 14, border: '1px solid var(--border)', marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Pending Digest ({undigested.length})
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => digestAll(false)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 9, border: `1px solid ${COLOR}30`, background: `${COLOR}08`, color: COLOR, fontFamily: 'Raleway', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                <Zap size={11} /> Digest Pending (~${estimatedCost})
              </button>
              <button onClick={() => digestAll(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--muted)', fontFamily: 'Raleway', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                <RefreshCw size={11} /> Re-digest All
              </button>
            </div>
          </div>
          {undigested.slice(0, 8).map(p => (
            <div key={p.id} style={{ padding: '12px 18px', borderBottom: '1px solid var(--faint)', display: 'flex', gap: 12, alignItems: 'center' }}>
              <Clock size={14} color="#f97316" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>{p.authors?.split(';')[0]} · {p.year}</div>
              </div>
              <button onClick={() => digestOne(p.id)} disabled={digesting === p.id} style={{ flexShrink: 0, padding: '5px 12px', borderRadius: 8, border: `1px solid ${COLOR}30`, background: `${COLOR}08`, color: COLOR, fontFamily: 'Raleway', fontWeight: 700, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                {digesting === p.id ? <RefreshCw size={11} style={{ animation: 'spin .8s linear infinite' }} /> : <Zap size={11} />}
                {digesting === p.id ? 'Digesting…' : 'Digest'}
              </button>
            </div>
          ))}
          {undigested.length > 8 && (
            <div style={{ padding: '10px 18px', fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>+{undigested.length - 8} more pending</div>
          )}
        </div>
      )}

      {/* Digested library */}
      <div style={{ background: 'var(--panel)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Digested Library ({digested.length})
          </span>
          <button onClick={load} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
            <RefreshCw size={13} />
          </button>
        </div>
        {loading ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div> :
        digested.slice(0, 12).map(p => {
          const { category, keywords } = parseHaikuTags(p.tags ?? [])
          const relevance = p.dissertation_relevance ?? 0
          return (
            <div key={p.id} style={{ padding: '14px 18px', borderBottom: '1px solid var(--faint)' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
                <CheckCircle2 size={14} color="#22c55e" style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>{p.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>{p.authors?.split(';')[0]} · {p.year}</div>
                </div>
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  {[1,2,3,4,5].map(n => <Star key={n} size={11} fill={n <= relevance ? '#f59e0b' : 'none'} color={n <= relevance ? '#f59e0b' : 'var(--border)'} />)}
                </div>
              </div>
              {p.summary && <p style={{ margin: '0 0 8px 24px', fontSize: 12, color: 'var(--text)', fontFamily: 'Lato', lineHeight: 1.5 }}>{p.summary.slice(0, 200)}…</p>}
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginLeft: 24 }}>
                {category && <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700, background: `${COLOR}10`, color: COLOR }}>{category}</span>}
                {keywords.slice(0, 4).map(k => <span key={k} style={{ padding: '2px 8px', borderRadius: 5, fontSize: 10, background: 'var(--faint)', color: 'var(--muted)' }}>{k}</span>)}
              </div>
            </div>
          )
        })}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <AgentPageLayout
      agentId="paper-digester"
      agentName="Paper Digester"
      agentColor={COLOR}
      agentIcon={<Microscope size={20} />}
      description="Claude Haiku deep analysis · ~$0.004/paper · live progress tracking"
      tabs={['dashboard', 'chat', 'settings']}
      starters={['How many papers are undigested?', 'Which papers have the highest dissertation relevance?', 'What categories do my papers fall into?']}
      dashboard={dashboard}
      settings={<div style={{ padding: 20, color: 'var(--muted)', fontFamily: 'Lato', fontSize: 13 }}>Paper Digester settings — configure digest prompt and cost limits here (coming soon).</div>}
      commandCenter={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>Digested</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#22c55e' }}>{digested.length}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>Pending</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: undigested.length ? '#f97316' : '#22c55e' }}>{undigested.length}</span>
          </div>
          {jobRunning && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>Progress</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: COLOR }}>{jobPct}%</span>
            </div>
          )}
        </div>
      }
    />
  )
}
