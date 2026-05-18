'use client'
import { useState, useEffect, useCallback } from 'react'
import { BookOpen, Play, Square, ExternalLink, RefreshCw, FileText, Tag, Cpu } from 'lucide-react'
import AgentPageLayout from '@/components/agents/AgentPageLayout'

const COLOR = '#7C3AED'

interface Paper {
  id: string
  title: string
  authors: string
  year: number
  summary: string | null
  tags: string[]
  dissertation_relevance: number | null
}

export default function ResearchAgentPage() {
  const [running, setRunning] = useState(false)
  const [controlling, setControlling] = useState(false)
  const [papers, setPapers] = useState<Paper[]>([])
  const [paperCount, setPaperCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const loadStatus = useCallback(async () => {
    const res = await fetch('/api/agents/launch?agent=research').then(r => r.json()).catch(() => ({ running: false }))
    setRunning(res.running ?? false)
  }, [])

  const loadPapers = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetch('/api/research/papers').then(r => r.json())
      if (Array.isArray(data)) {
        setPapers(data.slice(0, 6))
        setPaperCount(data.length)
      }
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    loadStatus()
    loadPapers()
  }, [loadStatus, loadPapers])

  const control = useCallback(async (action: 'start' | 'stop') => {
    setControlling(true)
    await fetch('/api/agents/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'research', action }),
    }).catch(() => {})
    await loadStatus()
    setControlling(false)
  }, [loadStatus])

  // ── Dashboard tab ─────────────────────────────────────────────────────────
  const dashboard = (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <button onClick={() => { loadStatus(); loadPapers() }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'Raleway', fontWeight: 700, fontSize: 12 }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Start / Stop control card */}
      <div style={{
        background: 'var(--panel)', borderRadius: 16, padding: '24px 28px',
        border: `1px solid ${running ? '#22c55e30' : 'var(--border)'}`,
        marginBottom: 24, boxShadow: running ? '0 0 0 1px #22c55e18' : 'none', transition: 'all .2s',
      }}>
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
              <a href="/api/research-app" target="_blank" rel="noopener noreferrer" style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10,
                background: COLOR, color: '#fff', fontFamily: 'Raleway', fontWeight: 700, fontSize: 13, textDecoration: 'none',
              }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Papers', value: paperCount, icon: FileText },
          { label: 'Tagged', value: papers.filter(p => p.tags?.length > 0).length, icon: Tag },
          { label: 'Digested', value: papers.filter(p => p.summary).length, icon: Cpu },
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

      {/* Recent papers */}
      <div style={{ background: 'var(--panel)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Recent Papers</h3>
          {running && (
            <a href="/api/research-app" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: COLOR, fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              View all <ExternalLink size={11} />
            </a>
          )}
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontFamily: 'Lato' }}>Loading papers…</div>
        ) : papers.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontFamily: 'Lato' }}>No papers yet. Add papers via the Paper Digester agent.</div>
        ) : papers.map(p => (
          <div key={p.id} style={{ padding: '16px 22px', borderBottom: '1px solid var(--faint)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>{p.authors} · {p.year}</div>
                {p.summary && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato', marginTop: 6, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {p.summary}
                  </div>
                )}
              </div>
              {p.dissertation_relevance != null && (
                <div style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: COLOR, background: `${COLOR}12`, padding: '3px 8px', borderRadius: 6 }}>
                  {p.dissertation_relevance}%
                </div>
              )}
            </div>
            {p.tags?.length > 0 && (
              <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
                {p.tags.slice(0, 4).map(t => (
                  <span key={t} style={{ padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 700, background: `${COLOR}10`, color: COLOR }}>{t}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
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

  const commandCenter = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[
        { label: 'Status', value: running ? 'Running' : 'Stopped', color: running ? '#22c55e' : '#94a3b8' },
        { label: 'Papers', value: String(paperCount), color: 'var(--text)' },
        { label: 'Digested', value: String(papers.filter(p => p.summary).length), color: 'var(--text)' },
      ].map(item => (
        <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>{item.label}</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: item.color, fontFamily: 'Raleway' }}>{item.value}</span>
        </div>
      ))}
    </div>
  )

  return (
    <AgentPageLayout
      agentId="research"
      agentName="Research Assistant"
      agentColor={COLOR}
      agentIcon={<BookOpen size={20} />}
      description="Paper library, highlights & semantic search"
      tabs={['dashboard', 'chat', 'settings']}
      starters={[
        'What papers do I have on machine learning?',
        'Summarise my most relevant papers for my dissertation',
        'What are the key themes across my paper library?',
        'Which papers are most relevant to data fusion?',
        'Find papers related to uncertainty quantification',
      ]}
      dashboard={dashboard}
      settings={settings}
      commandCenter={commandCenter}
    />
  )
}
