'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Microscope, Zap, RefreshCw, CheckCircle2, Clock, Star, X, AlertTriangle, Save, FolderOpen } from 'lucide-react'
import AgentPageLayout from '@/components/agents/AgentPageLayout'

const COLOR = '#9D174D'

const DEFAULT_DIGEST_PROMPT = `You are an expert academic paper summarizer specializing in temporal networks, graph machine learning, critical transitions, and early warning signals.

Given a paper, extract ALL of the following. Respond ONLY in this exact JSON format:
{
  "summary": "2-3 sentence plain-language summary of the core contribution",
  "key_findings": ["finding 1", "finding 2", "finding 3", "finding 4"],
  "methodology": "1 sentence describing the research design and approach",
  "relevance_note": "1-2 sentences on relevance to temporal networks / critical transitions / early warning signals / graph ML",
  "dissertation_relevance": 4,
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "category": "one of: Temporal Networks | Graph ML | Critical Transitions | Early Warning Signals | Data Fusion | Representativeness | Methodology | Other",
  "themes": ["theme1", "theme2", "theme3"]
}

Rules:
- tags: 5-8 short lowercase keywords specific to this paper (e.g. "link prediction", "rolling window", "bifurcation")
- category: pick the SINGLE best fit from the fixed list above
- themes: 2-4 broader research themes this paper touches (e.g. "network dynamics", "anomaly detection")
- dissertation_relevance: 1-5 score for relevance to a dissertation on representativeness and data fusion in temporal networks
- Never return null fields — use empty array [] if truly nothing fits`

interface Paper { id: string; title: string; authors: string; year: number; summary: string | null; tags: string[]; dissertation_relevance: number | null; notes: string | null }
interface Project { id: string; name: string; color: string; digest_prompt: string | null }
interface JobProgress { type: string; processed?: number; total?: number; current?: string; title?: string; reason?: string; job_id?: string; failed?: string[] }
interface ActiveJob { id: string; status: string; total_papers: number; processed: number; failed: number; current_paper: string | null }

export default function DigesterAgentPage() {
  // ── Core state ─────────────────────────────────────────────────────────────
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [undigested, setUndigested] = useState<Paper[]>([])
  const [digested, setDigested] = useState<Paper[]>([])
  const [loading, setLoading] = useState(true)
  const [digesting, setDigesting] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [selectedPaperId, setSelectedPaperId] = useState('')

  // ── Job progress state ─────────────────────────────────────────────────────
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null)
  const [jobLog, setJobLog] = useState<{ title: string; ok: boolean }[]>([])
  const [jobRunning, setJobRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // ── Settings / prompt editor state ────────────────────────────────────────
  const [settingsProjectId, setSettingsProjectId] = useState<string>('')
  const [promptDraft, setPromptDraft] = useState<string>('')
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [promptSaved, setPromptSaved] = useState(false)

  // ── Load projects once ─────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/research/projects')
      .then(r => r.json())
      .then((data: Project[]) => {
        setProjects(data ?? [])
        if (data?.length) setSettingsProjectId(data[0].id)
      })
      .catch(() => {})
  }, [])

  // ── Sync prompt draft when settings project changes ────────────────────────
  useEffect(() => {
    const proj = projects.find(p => p.id === settingsProjectId)
    // Pre-populate with default so users have a starting point to edit from
    setPromptDraft(proj?.digest_prompt ?? DEFAULT_DIGEST_PROMPT)
    setPromptSaved(false)
  }, [settingsProjectId, projects])

  // ── Load papers (re-runs when project filter changes) ─────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const qs = selectedProjectId ? `?project_id=${selectedProjectId}` : ''
    const [all, statusRes] = await Promise.allSettled([
      fetch(`/api/research/papers${qs}`).then(r => r.json()),
      fetch(`/api/agents/paper-digester${qs}`).then(r => r.json()),
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
  }, [selectedProjectId])

  useEffect(() => { load() }, [load])

  // ── Actions ────────────────────────────────────────────────────────────────
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

    const params: Record<string, unknown> = { force }
    if (selectedProjectId) params.project_id = selectedProjectId

    try {
      const res = await fetch('/api/agents/paper-digester', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'digest_all', params }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const err = await res.json()
        setResult(`✗ ${err.message}`)
        setJobRunning(false)
        return
      }

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

  async function savePrompt() {
    if (!settingsProjectId) return
    setSavingPrompt(true)
    await fetch('/api/agents/paper-digester', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save_project_prompt', params: { project_id: settingsProjectId, prompt: promptDraft || null } }),
    })
    // Update local projects cache so the sync effect picks up new value
    setProjects(ps => ps.map(p => p.id === settingsProjectId ? { ...p, digest_prompt: promptDraft || null } : p))
    setSavingPrompt(false)
    setPromptSaved(true)
    setTimeout(() => setPromptSaved(false), 2500)
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function parseHaikuTags(tags: string[]) {
    const keywords = tags.filter(t => !t.startsWith('category:') && !t.startsWith('theme:'))
    const category = tags.find(t => t.startsWith('category:'))?.replace('category:', '') ?? null
    return { keywords, category }
  }

  const estimatedCost = (undigested.length * 0.004).toFixed(2)
  const jobPct = activeJob ? Math.round((activeJob.processed / activeJob.total_papers) * 100) : 0
  const selectedProject = projects.find(p => p.id === selectedProjectId)

  // ── Project filter bar (shared across tabs) ────────────────────────────────
  const projectFilter = projects.length > 0 ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, padding: '10px 14px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12 }}>
      <FolderOpen size={14} color={COLOR} />
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', fontFamily: 'Raleway', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Project</span>
      <select
        value={selectedProjectId}
        onChange={e => { setSelectedProjectId(e.target.value); setSelectedPaperId('') }}
        style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--text)', fontFamily: 'Lato', fontSize: 13, outline: 'none' }}
      >
        <option value="">All projects</option>
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {selectedProject?.digest_prompt && (
        <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, background: `${COLOR}15`, color: COLOR, fontWeight: 700, whiteSpace: 'nowrap' }}>custom prompt</span>
      )}
    </div>
  ) : null

  // ── Dashboard tab ──────────────────────────────────────────────────────────
  const dashboard = (
    <div style={{ maxWidth: 860 }}>
      {projectFilter}

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
          {jobLog.length > 0 && (
            <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {[...jobLog].reverse().map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontFamily: 'Lato' }}>
                  {item.ok ? <CheckCircle2 size={11} color="#22c55e" /> : <AlertTriangle size={11} color="#f97316" />}
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
              Pending Digest ({undigested.length}){selectedProject ? ` — ${selectedProject.name}` : ''}
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
            Digested Library ({digested.length}){selectedProject ? ` — ${selectedProject.name}` : ''}
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

  // ── Actions tab ────────────────────────────────────────────────────────────
  const allPapers = [...digested, ...undigested]

  const actions = (
    <div style={{ maxWidth: 560 }}>
      {projectFilter}

      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 800, color: 'var(--text)', fontFamily: 'Raleway' }}>Digest a Paper</h3>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6, fontFamily: 'Raleway', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Select Paper</label>
          <select
            value={selectedPaperId}
            onChange={e => setSelectedPaperId(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--text)', fontFamily: 'Lato', fontSize: 13, outline: 'none' }}
          >
            <option value="">— choose a paper —</option>
            <optgroup label={`Pending (${undigested.length})`}>
              {undigested.map(p => <option key={p.id} value={p.id}>{p.title?.slice(0, 70)} ({p.year})</option>)}
            </optgroup>
            <optgroup label={`Re-digest (${digested.length})`}>
              {digested.map(p => <option key={p.id} value={p.id}>{p.title?.slice(0, 70)} ({p.year})</option>)}
            </optgroup>
          </select>
        </div>
        <button
          onClick={() => selectedPaperId && digestOne(selectedPaperId)}
          disabled={!selectedPaperId || !!digesting}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, border: 'none', background: selectedPaperId && !digesting ? COLOR : 'var(--faint)', color: selectedPaperId && !digesting ? '#fff' : 'var(--muted)', fontFamily: 'Raleway', fontWeight: 700, fontSize: 13, cursor: selectedPaperId && !digesting ? 'pointer' : 'default', transition: 'all .15s' }}
        >
          {digesting ? <><RefreshCw size={14} style={{ animation: 'spin .8s linear infinite' }} /> Digesting…</> : <><Zap size={14} /> Digest Paper</>}
        </button>
        {result && (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: result.startsWith('✓') ? '#22c55e10' : '#ef444410', color: result.startsWith('✓') ? '#16a34a' : '#dc2626', fontSize: 13, fontFamily: 'Lato' }}>
            {result}
          </div>
        )}
      </div>

      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 800, color: 'var(--text)', fontFamily: 'Raleway' }}>Batch Actions</h3>
        {selectedProject && (
          <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato' }}>
            Scoped to: <strong>{selectedProject.name}</strong>
            {selectedProject.digest_prompt ? ' · custom prompt active' : ' · using default prompt'}
          </p>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => digestAll(false)} disabled={jobRunning || undigested.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10, border: `1px solid ${COLOR}30`, background: `${COLOR}08`, color: COLOR, fontFamily: 'Raleway', fontWeight: 700, fontSize: 13, cursor: jobRunning || undigested.length === 0 ? 'default' : 'pointer', opacity: undigested.length === 0 ? 0.5 : 1 }}>
            <Zap size={14} /> Digest All Pending ({undigested.length})
          </button>
          <button onClick={() => digestAll(true)} disabled={jobRunning}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--muted)', fontFamily: 'Raleway', fontWeight: 700, fontSize: 13, cursor: jobRunning ? 'default' : 'pointer' }}>
            <RefreshCw size={14} /> Re-digest All
          </button>
        </div>
        {allPapers.length === 0 && <p style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato' }}>No papers in this project yet.</p>}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  // ── Settings tab ───────────────────────────────────────────────────────────
  const settingsProject = projects.find(p => p.id === settingsProjectId)

  const settings = (
    <div style={{ maxWidth: 600 }}>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 800, color: 'var(--text)', fontFamily: 'Raleway' }}>Per-Project Digest Prompt</h3>
        <p style={{ margin: '0 0 18px', fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato', lineHeight: 1.6 }}>
          Customise the system prompt Haiku uses when digesting papers in a specific project. Leave blank to use the global default (temporal networks / dissertation focus).
        </p>

        {/* Project picker */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6, fontFamily: 'Raleway', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Project</label>
          <select
            value={settingsProjectId}
            onChange={e => setSettingsProjectId(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--text)', fontFamily: 'Lato', fontSize: 13, outline: 'none' }}
          >
            {projects.length === 0 && <option value="">No projects found</option>}
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* Prompt textarea */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6, fontFamily: 'Raleway', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Digest Prompt {settingsProject?.digest_prompt ? <span style={{ color: COLOR, marginLeft: 6 }}>● custom</span> : <span style={{ color: '#6b7280', marginLeft: 6 }}>○ default</span>}
          </label>
          <textarea
            value={promptDraft}
            onChange={e => { setPromptDraft(e.target.value); setPromptSaved(false) }}
            placeholder="Edit the prompt above to customise it for this project…"
            rows={14}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--text)', fontFamily: 'monospace', fontSize: 12, outline: 'none', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box' }}
          />
          <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>
            The prompt must instruct Haiku to respond with JSON containing: summary, key_findings, methodology, relevance_note, dissertation_relevance (1–5), tags, category, themes.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={savePrompt}
            disabled={savingPrompt || !settingsProjectId}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, border: 'none', background: settingsProjectId && !savingPrompt ? COLOR : 'var(--faint)', color: settingsProjectId && !savingPrompt ? '#fff' : 'var(--muted)', fontFamily: 'Raleway', fontWeight: 700, fontSize: 13, cursor: settingsProjectId && !savingPrompt ? 'pointer' : 'default', transition: 'all .15s' }}
          >
            {savingPrompt ? <><RefreshCw size={14} style={{ animation: 'spin .8s linear infinite' }} /> Saving…</> : <><Save size={14} /> Save Prompt</>}
          </button>
          {settingsProject?.digest_prompt && settingsProjectId && (
            <button
              onClick={async () => {
                setPromptDraft(DEFAULT_DIGEST_PROMPT)
                setSavingPrompt(true)
                await fetch('/api/agents/paper-digester', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'save_project_prompt', params: { project_id: settingsProjectId, prompt: null } }),
                })
                setProjects(ps => ps.map(p => p.id === settingsProjectId ? { ...p, digest_prompt: null } : p))
                setSavingPrompt(false)
                setPromptSaved(true)
                setTimeout(() => setPromptSaved(false), 2500)
              }}
              style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--muted)', fontFamily: 'Raleway', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
            >
              Reset to default
            </button>
          )}
          {promptSaved && <span style={{ fontSize: 12, color: '#22c55e', fontFamily: 'Lato' }}>✓ Saved</span>}
        </div>
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
      description="Claude Haiku deep analysis · ~$0.004/paper · project-scoped · live progress"
      tabs={['dashboard', 'actions', 'chat', 'settings']}
      starters={['How many papers are undigested?', 'Which papers have the highest dissertation relevance?', 'What categories do my papers fall into?']}
      dashboard={dashboard}
      actions={actions}
      settings={settings}
      commandCenter={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {selectedProject && (
            <div style={{ fontSize: 10, fontWeight: 700, color: COLOR, fontFamily: 'Raleway', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{selectedProject.name}</div>
          )}
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
