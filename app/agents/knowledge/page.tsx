'use client'
import { useState, useEffect } from 'react'
import { Search, BookOpen, ExternalLink, RefreshCw } from 'lucide-react'
import AgentPageLayout from '@/components/agents/AgentPageLayout'

const COLOR = '#1D4ED8'

interface SearchResult { title: string; authors: string; year: string; snippet: string; score: number; paper_id: string }

export default function KnowledgeAgentPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [chromaStatus, setChromaStatus] = useState<{ ok: boolean; count: number } | null>(null)
  const [answer, setAnswer] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/knowledge?action=status').then(r => r.json()).then(d => {
      setChromaStatus({ ok: d.ok, count: d.data?.count ?? 0 })
    }).catch(() => setChromaStatus({ ok: false, count: 0 }))
  }, [])

  async function doSearch() {
    if (!query.trim()) return
    setSearching(true)
    setResults([])
    setAnswer(null)
    const [searchRes, answerRes] = await Promise.allSettled([
      fetch('/api/knowledge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'search_knowledge', params: { query, top_k: 6 } }),
      }).then(r => r.json()),
      fetch('/api/orchestrator', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: query }], agentId: 'knowledge' }),
      }).then(r => r.json()),
    ])
    if (searchRes.status === 'fulfilled' && searchRes.value.ok) setResults(searchRes.value.data ?? [])
    if (answerRes.status === 'fulfilled') setAnswer(answerRes.value.reply)
    setSearching(false)
  }

  const dashboard = (
    <div style={{ maxWidth: 800 }}>
      {/* Status */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 22 }}>
        {[
          { label: 'ChromaDB', value: chromaStatus?.ok ? 'Online' : 'Offline', color: chromaStatus?.ok ? '#22c55e' : '#ef4444' },
          { label: 'Indexed Papers', value: chromaStatus?.count ?? '…', color: COLOR },
          { label: 'Embed Model', value: 'nomic-embed-text', color: 'var(--muted)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--panel)', borderRadius: 14, padding: '16px 18px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: s.color, fontFamily: 'Raleway' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ background: 'var(--panel)', borderRadius: 14, padding: 20, border: '1px solid var(--border)', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch()}
              placeholder="Search your paper library semantically…"
              style={{ width: '100%', padding: '11px 14px 11px 40px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--text)', fontFamily: 'Lato', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <button onClick={doSearch} disabled={!query.trim() || searching} style={{ padding: '11px 20px', borderRadius: 10, border: 'none', background: query.trim() ? COLOR : 'var(--faint)', color: query.trim() ? '#fff' : 'var(--muted)', fontFamily: 'Raleway', fontWeight: 700, fontSize: 13, cursor: query.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 7 }}>
            {searching ? <RefreshCw size={14} style={{ animation: 'spin .8s linear infinite' }} /> : <Search size={14} />}
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>

        {/* Suggested queries */}
        {!results.length && !searching && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {['temporal networks', 'data fusion methods', 'representativeness bias', 'graph neural networks', 'early warning signals'].map(q => (
              <button key={q} onClick={() => { setQuery(q); }} style={{ padding: '5px 12px', borderRadius: 8, border: `1px solid ${COLOR}20`, background: `${COLOR}08`, color: COLOR, fontFamily: 'Lato', fontSize: 11, cursor: 'pointer' }}>{q}</button>
            ))}
          </div>
        )}
      </div>

      {/* AI Answer */}
      {answer && (
        <div style={{ background: `${COLOR}06`, borderRadius: 14, padding: 20, border: `1px solid ${COLOR}20`, marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: COLOR, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>AI Answer</div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text)', fontFamily: 'Lato', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{answer}</p>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div style={{ background: 'var(--panel)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              {results.length} papers found · ranked by relevance
            </span>
          </div>
          {results.map((r, i) => (
            <div key={i} style={{ padding: '16px 18px', borderBottom: i < results.length - 1 ? '1px solid var(--faint)' : 'none' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 9,
                  background: `${COLOR}${Math.round(r.score * 0.4 + 10).toString(16).padStart(2,'0')}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${COLOR}30`,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 900, color: COLOR }}>{r.score}%</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>{r.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato', marginBottom: 8 }}>
                    {r.authors?.split(';')[0]}{r.year ? ` · ${r.year}` : ''}
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text)', fontFamily: 'Lato', lineHeight: 1.5, opacity: 0.8 }}>{r.snippet}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <AgentPageLayout
      agentId="knowledge"
      agentName="Knowledge (RAG)"
      agentColor={COLOR}
      agentIcon={<Search size={20} />}
      description="Semantic search across your paper library · ChromaDB + nomic-embed-text"
      tabs={['dashboard', 'chat', 'settings']}
      starters={['What do my papers say about temporal networks?', 'Find research on data fusion methods', 'Which papers discuss representativeness?', 'Summarise my knowledge on graph neural networks']}
      dashboard={dashboard}
      settings={<div style={{ padding: 20, color: 'var(--muted)', fontFamily: 'Lato', fontSize: 13 }}>Knowledge settings coming soon.</div>}
      commandCenter={<div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato' }}>{chromaStatus?.count ?? 0} papers indexed in ChromaDB</div>}
    />
  )
}
