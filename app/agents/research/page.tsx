'use client'
import { useState, useEffect, useCallback } from 'react'
import { BookOpen, Play, Square, ExternalLink, RefreshCw, FileText, Tag, Cpu, Star, CheckCircle2, BookMarked, Clock } from 'lucide-react'
import AgentPageLayout from '@/components/agents/AgentPageLayout'
import { startSession, dispatchTimerUpdate } from '@/lib/timer'

const COLOR = '#7C3AED'

interface Paper {
  id: string
  title: string
  authors: string
  year: number
  summary: string | null
  tags: string[]
  dissertation_relevance: number | null
  methodological_relevance: number | null
  reading_status: string
  notes: string | null
  key_findings: string | null
}

const READING_ORDER = ['reading', 'in-progress', 'not-started', 'unread']

function RelevanceDots({ score, color }: { score: number | null; color: string }) {
  const n = score ?? 0
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {[1,2,3,4,5].map(i => (
        <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: i <= n ? color : 'var(--border)' }} />
      ))}
    </div>
  )
}

export default function ResearchAgentPage() {
  const [running, setRunning]       = useState(false)
  const [controlling, setControlling] = useState(false)
  const [papers, setPapers]         = useState<Paper[]>([])
  const [queuePapers, setQueuePapers] = useState<Paper[]>([])
  const [paperCount, setPaperCount] = useState(0)
  const [loading, setLoading]       = useState(true)
  const [queueLoading, setQueueLoading] = useState(true)
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [toast, setToast]           = useState<string | null>(null)
  const [queueFilter, setQueueFilter] = useState<'all' | 'reading' | 'unread'>('all')

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  const loadStatus = useCallback(async () => {
    const res = await fetch('/api/agents/launch?agent=research').then(r => r.json()).catch(() => ({ running: false }))
    setRunning(res.running ?? false)
  }, [])

  const loadPapers = useCallback(async () => {
    setLoading(true)
    try {
      const data: Paper[] = await fetch('/api/research/papers').then(r => r.json())
      if (Array.isArray(data)) {
        setPapers(data.slice(0, 6))
        setPaperCount(data.length)
      }
    } catch {}
    setLoading(false)
  }, [])

  const loadQueue = useCallback(async () => {
    setQueueLoading(true)
    try {
      const data: Paper[] = await fetch('/api/research/papers').then(r => r.json())
      if (Array.isArray(data)) {
        const queue = data
          .filter(p => p.reading_status !== 'read' && p.reading_status !== 'done')
          .sort((a, b) => {
            // Reading-in-progress floats to top
            const aReading = a.reading_status === 'reading' || a.reading_status === 'in-progress'
            const bReading = b.reading_status === 'reading' || b.reading_status === 'in-progress'
            if (aReading && !bReading) return -1
            if (bReading && !aReading) return 1
            // Then by dissertation relevance desc
            return (b.dissertation_relevance ?? 0) - (a.dissertation_relevance ?? 0)
          })
        setQueuePapers(queue)
      }
    } catch {}
    setQueueLoading(false)
  }, [])

  useEffect(() => {
    loadStatus()
    loadPapers()
    loadQueue()
  }, [loadStatus, loadPapers, loadQueue])

  const control = useCallback(async (action: 'start' | 'stop') => {
    setControlling(true)
    await fetch('/api/agents/launch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'research', action }),
    }).catch(() => {})
    await loadStatus()
    setControlling(false)
  }, [loadStatus])

  async function startReading(paper: Paper) {
    setActioningId(paper.id)
    await fetch(`/api/research/papers`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: paper.id, reading_status: 'reading' }),
    }).catch(() => {})
    // Start the timer for this paper
    startSession(paper.id, paper.title, 'Research')
    dispatchTimerUpdate()
    showToast(`Reading "${paper.title.slice(0, 40)}…" — timer started`)
    setActioningId(null)
    loadQueue()
  }

  async function markRead(paper: Paper) {
    setActioningId(paper.id)
    await fetch(`/api/research/papers`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: paper.id, reading_status: 'read' }),
    }).catch(() => {})
    showToast(`"${paper.title.slice(0, 40)}…" marked as read`)
    setActioningId(null)
    loadQueue()
  }

  const filteredQueue = queuePapers.filter(p => {
    if (queueFilter === 'reading') return p.reading_status === 'reading' || p.reading_status === 'in-progress'
    if (queueFilter === 'unread') return p.reading_status === 'not-started' || p.reading_status === 'unread'
    return true
  })

  const readingNow = queuePapers.filter(p => p.reading_status === 'reading' || p.reading_status === 'in-progress')

  // ── Dashboard tab ─────────────────────────────────────────────────────────
  const dashboard = (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <button onClick={() => { loadStatus(); loadPapers(); loadQueue() }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'Raleway', fontWeight: 700, fontSize: 12 }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Start / Stop control card */}
      <div style={{ background: 'var(--panel)', borderRadius: 16, padding: '24px 28px', border: `1px solid ${running ? '#22c55e30' : 'var(--border)'}`, marginBottom: 24, boxShadow: running ? '0 0 0 1px #22c55e18' : 'none', transition: 'all .2s' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: running ? '#22c55e' : '#94a3b8', boxShadow: running ? '0 0 8px #22c55e80' : 'none', transition: 'all .2s' }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Research App · {running ? 'Running' : 'Stopped'}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato', marginTop: 2 }}>
                {running ? 'App is live — click Open to access your paper library' : 'Start the app to access your full research library with highlights and PDF viewer'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {running && (
              <a href="/api/research-app" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, background: COLOR, color: '#fff', fontFamily: 'Raleway', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
                <ExternalLink size={14} /> Open App
              </a>
            )}
            {running ? (
              <button onClick={() => control('stop')} disabled={controlling} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, background: '#ef444415', border: '1px solid #ef444440', color: '#dc2626', cursor: 'pointer', fontFamily: 'Raleway', fontWeight: 700, fontSize: 13, opacity: controlling ? 0.5 : 1 }}>
                <Square size={13} fill="#dc2626" /> Stop
              </button>
            ) : (
              <button onClick={() => control('start')} disabled={controlling} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, background: '#22c55e15', border: '1px solid #22c55e40', color: '#16a34a', cursor: 'pointer', fontFamily: 'Raleway', fontWeight: 700, fontSize: 13, opacity: controlling ? 0.5 : 1 }}>
                <Play size={13} fill="#16a34a" /> {controlling ? 'Starting…' : 'Start'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Papers', value: paperCount, icon: FileText },
          { label: 'Tagged', value: papers.filter(p => p.tags?.length > 0).length, icon: Tag },
          { label: 'Digested', value: papers.filter(p => p.summary).length, icon: Cpu },
          { label: 'Queue', value: queuePapers.length, icon: BookMarked },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--panel)', borderRadius: 14, padding: '18px 20px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{s.label}</span>
              <s.icon size={14} color="var(--muted)" />
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: COLOR, fontFamily: 'Raleway' }}>{loading ? '—' : s.value}</div>
          </div>
        ))}
      </div>

      {/* Currently reading banner */}
      {readingNow.length > 0 && (
        <div style={{ background: `${COLOR}10`, border: `1px solid ${COLOR}30`, borderRadius: 14, padding: '14px 20px', marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLOR, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Currently Reading</div>
          {readingNow.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Clock size={13} color={COLOR} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.title}</span>
              <RelevanceDots score={p.dissertation_relevance} color={COLOR} />
            </div>
          ))}
        </div>
      )}

      {/* Recent papers */}
      <div style={{ background: 'var(--panel)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Recent Papers</h3>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontFamily: 'Lato' }}>Loading papers…</div>
        ) : papers.map(p => (
          <div key={p.id} style={{ padding: '16px 22px', borderBottom: '1px solid var(--faint)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>{p.authors?.split(';')[0]} · {p.year}</div>
                {p.summary && <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato', marginTop: 6, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.summary}</div>}
              </div>
              <RelevanceDots score={p.dissertation_relevance} color={COLOR} />
            </div>
            {p.tags?.filter(t => !t.includes(':')).slice(0, 4).map(t => (
              <span key={t} style={{ display: 'inline-block', marginTop: 8, marginRight: 5, padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 700, background: `${COLOR}10`, color: COLOR }}>{t}</span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )

  // ── Queue tab ─────────────────────────────────────────────────────────────
  const queue = (
    <div style={{ maxWidth: 800 }}>
      {toast && (
        <div style={{ padding: '10px 16px', borderRadius: 10, background: '#22c55e12', border: '1px solid #22c55e30', color: '#16a34a', fontFamily: 'Lato', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle2 size={14} /> {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: 'var(--text)', fontFamily: 'Raleway' }}>Reading Queue</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)', fontFamily: 'Lato' }}>
            {queuePapers.length} papers · sorted by dissertation relevance
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {(['all', 'reading', 'unread'] as const).map(f => (
            <button key={f} type="button" onClick={() => setQueueFilter(f)} style={{ padding: '5px 12px', borderRadius: 99, fontSize: 11, fontWeight: 700, fontFamily: 'Raleway', cursor: 'pointer', border: `1.5px solid ${queueFilter === f ? COLOR : 'var(--border)'}`, background: queueFilter === f ? `${COLOR}18` : 'transparent', color: queueFilter === f ? COLOR : 'var(--muted)', transition: 'all .12s' }}>
              {f === 'all' ? 'All' : f === 'reading' ? 'In Progress' : 'Unread'}
            </button>
          ))}
          <button onClick={loadQueue} style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--muted)', cursor: 'pointer', lineHeight: 0 }}>
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {queueLoading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>Loading queue…</div>
      ) : filteredQueue.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)', fontFamily: 'Lato' }}>Queue is empty — great work!</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredQueue.map((paper, idx) => {
            const isReading = paper.reading_status === 'reading' || paper.reading_status === 'in-progress'
            const isActioning = actioningId === paper.id
            return (
              <div key={paper.id} style={{ background: 'var(--panel)', borderRadius: 16, border: `1px solid ${isReading ? `${COLOR}40` : 'var(--border)'}`, padding: '18px 22px', boxShadow: isReading ? `0 0 0 1px ${COLOR}18` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  {/* Rank number */}
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: isReading ? COLOR : 'var(--faint)', color: isReading ? '#fff' : 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Raleway', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>
                    {isReading ? <Clock size={13} /> : idx + 1}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4 }}>{paper.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato', marginTop: 3 }}>
                          {paper.authors?.split(';')[0]} · {paper.year}
                          {isReading && <span style={{ marginLeft: 8, color: COLOR, fontWeight: 700 }}>● Reading</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                        <RelevanceDots score={paper.dissertation_relevance} color={COLOR} />
                        {paper.dissertation_relevance && (
                          <span style={{ fontSize: 10, color: COLOR, fontWeight: 700 }}>{paper.dissertation_relevance}/5 relevance</span>
                        )}
                      </div>
                    </div>

                    {paper.summary && (
                      <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato', lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{paper.summary}</p>
                    )}

                    {paper.key_findings && (
                      <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}><strong>Key findings:</strong> {paper.key_findings}</p>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {paper.tags?.filter(t => !t.includes(':')).slice(0, 4).map(t => (
                        <span key={t} style={{ padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700, background: `${COLOR}10`, color: COLOR }}>{t}</span>
                      ))}
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                        {!isReading && (
                          <button onClick={() => startReading(paper)} disabled={!!isActioning} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 9, border: `1px solid ${COLOR}40`, background: `${COLOR}10`, color: COLOR, fontFamily: 'Raleway', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: isActioning ? 0.5 : 1 }}>
                            <Play size={11} fill={COLOR} /> {isActioning ? 'Starting…' : 'Start Reading'}
                          </button>
                        )}
                        <button onClick={() => markRead(paper)} disabled={!!isActioning} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 9, border: '1px solid #22c55e40', background: '#22c55e10', color: '#16a34a', fontFamily: 'Raleway', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: isActioning ? 0.5 : 1 }}>
                          <CheckCircle2 size={11} /> Mark Read
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  // ── Settings tab ──────────────────────────────────────────────────────────
  const settings = (
    <div style={{ maxWidth: 500 }}>
      <div style={{ background: 'var(--panel)', borderRadius: 14, padding: 20, border: '1px solid var(--border)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Research Assistant Settings</h3>
        {[
          { label: 'App location', value: '../representativeness-and-data-fusion/dist' },
          { label: 'Access', value: 'localhost:3000/api/research-app (served by Next.js)' },
          { label: 'Paper Digester', value: 'Claude Haiku (~$0.004/paper)' },
          { label: 'Semantic search', value: 'ChromaDB + nomic-embed-text' },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--faint)' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato' }}>{s.label}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', fontFamily: 'Lato', textAlign: 'right', maxWidth: 300 }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <AgentPageLayout
      agentId="research"
      agentName="Research Assistant"
      agentColor={COLOR}
      agentIcon={<BookOpen size={20} />}
      description="Paper library, highlights & semantic search"
      tabs={['dashboard', 'queue', 'chat', 'settings']}
      starters={[
        'What papers do I have on machine learning?',
        'Summarise my most relevant papers for my dissertation',
        'What are the key themes across my paper library?',
        'Which papers are most relevant to data fusion?',
        'Find papers related to uncertainty quantification',
      ]}
      dashboard={dashboard}
      queue={queue}
      settings={settings}
      commandCenter={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { label: 'Status', value: running ? 'Running' : 'Stopped', color: running ? '#22c55e' : '#94a3b8' },
            { label: 'Papers', value: String(paperCount), color: 'var(--text)' },
            { label: 'Queue', value: String(queuePapers.length), color: COLOR },
            { label: 'Reading', value: String(readingNow.length), color: readingNow.length > 0 ? COLOR : 'var(--muted)' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>{item.label}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: item.color, fontFamily: 'Raleway' }}>{item.value}</span>
            </div>
          ))}
        </div>
      }
    />
  )
}
