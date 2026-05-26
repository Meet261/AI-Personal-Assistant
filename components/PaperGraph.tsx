'use client'
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'

interface Paper {
  id: string; title: string; authors: string; year: number; tags: string[]; reading_status: string
}
interface Node {
  id: string; title: string; authors: string; year: number; tags: string[]
  status: string; x: number; y: number; vx: number; vy: number; color: string
}
interface Edge { source: string; target: string; weight: number; label: string }

const PALETTE = ['#6366F1','#10B981','#F59E0B','#EF4444','#3B82F6','#8B5CF6','#EC4899','#14B8A6','#F97316','#84CC16']

export default function PaperGraph({ papers }: { papers: Paper[] }) {
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const wrapRef     = useRef<HTMLDivElement>(null)
  const nodesRef    = useRef<Node[]>([])
  const edgesRef    = useRef<Edge[]>([])
  const animRef     = useRef<number>(0)
  const tickRef     = useRef(0)
  const hoverRef    = useRef<Node | null>(null)
  const selectedRef = useRef<Node | null>(null)
  const dimRef      = useRef({ W: 800, H: 500 })
  const [selected, setSelected] = useState<Node | null>(null)
  const [ready, setReady]       = useState(false)
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [edgeCount, setEdgeCount] = useState(0)

  const tagColorMap = useMemo(() => {
    const allTags = [...new Set(papers.flatMap(p => p.tags))]
    const m: Record<string, string> = {}
    allTags.forEach((t, i) => { m[t] = PALETTE[i % PALETTE.length] })
    return m
  }, [papers])

  const topTags = useMemo(() => {
    const freq: Record<string, number> = {}
    papers.forEach(p => p.tags.forEach(t => { freq[t] = (freq[t] ?? 0) + 1 }))
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([t]) => t)
  }, [papers])

  useEffect(() => {
    const wrap = wrapRef.current; const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      canvas.width = Math.floor(width); canvas.height = Math.floor(height)
      dimRef.current = { W: canvas.width, H: canvas.height }
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!papers.length) return
    const { W, H } = dimRef.current
    nodesRef.current = papers.map((p, idx) => {
      const angle = (idx / papers.length) * Math.PI * 2
      const r = Math.min(W, H) * 0.36
      return {
        id: p.id, title: p.title, authors: p.authors, year: p.year,
        tags: p.tags, status: p.reading_status,
        x: W / 2 + r * Math.cos(angle) + (Math.random() - 0.5) * 50,
        y: H / 2 + r * Math.sin(angle) + (Math.random() - 0.5) * 50,
        vx: 0, vy: 0,
        color: p.tags.length ? (tagColorMap[p.tags[0]] ?? '#94A3B8') : '#94A3B8',
      }
    })

    const parseAuthors = (s: string) => s.split(/[,;&]/).map(a => a.trim().toLowerCase()).filter(Boolean)
    const edges: Edge[] = []
    for (let i = 0; i < papers.length; i++) {
      for (let j = i + 1; j < papers.length; j++) {
        const ai = parseAuthors(papers[i].authors), aj = parseAuthors(papers[j].authors)
        const sharedA = ai.filter(a => aj.some(b => {
          const aL = a.split(' ').pop() ?? '', bL = b.split(' ').pop() ?? ''
          return aL.length > 2 && (b.includes(aL) || a.includes(bL))
        }))
        const sharedT = papers[i].tags.filter(t => papers[j].tags.includes(t))
        if (sharedA.length) edges.push({ source: papers[i].id, target: papers[j].id, weight: 2, label: sharedA[0] })
        else if (sharedT.length) edges.push({ source: papers[i].id, target: papers[j].id, weight: 1, label: sharedT[0] })
      }
    }
    edgesRef.current = edges
    tickRef.current = 0
    setEdgeCount(edges.length)
    setReady(true)
  }, [papers, tagColorMap])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const tick = () => {
      const nodes = nodesRef.current
      const edges = edgesRef.current
      const { W, H } = dimRef.current
      if (!nodes.length || W === 0) { animRef.current = requestAnimationFrame(tick); return }

      if (tickRef.current < 500) {
        tickRef.current++
        const REP = (W * H) / 3.5
        const K   = Math.sqrt((W * H) / nodes.length) * 0.9
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y
            const dist = Math.sqrt(dx*dx + dy*dy) || 1
            const f = REP / (dist * dist)
            nodes[i].vx -= dx/dist*f; nodes[i].vy -= dy/dist*f
            nodes[j].vx += dx/dist*f; nodes[j].vy += dy/dist*f
          }
        }
        const nm = new Map(nodes.map(n => [n.id, n]))
        for (const e of edges) {
          const a = nm.get(e.source), b = nm.get(e.target)
          if (!a || !b) continue
          const dx = b.x-a.x, dy = b.y-a.y, dist = Math.sqrt(dx*dx+dy*dy) || 1
          const f = (dist - K * (e.weight === 2 ? 0.9 : 1.7)) * 0.014
          a.vx += dx/dist*f; a.vy += dy/dist*f; b.vx -= dx/dist*f; b.vy -= dy/dist*f
        }
        for (const n of nodes) {
          n.vx += (W/2 - n.x) * 0.007; n.vy += (H/2 - n.y) * 0.007
          n.vx *= 0.86; n.vy *= 0.86
          const spd = Math.sqrt(n.vx*n.vx+n.vy*n.vy), cap = Math.max(W,H)*0.02
          if (spd > cap) { n.vx = n.vx/spd*cap; n.vy = n.vy/spd*cap }
          n.x = Math.max(24, Math.min(W-24, n.x+n.vx))
          n.y = Math.max(24, Math.min(H-24, n.y+n.vy))
        }
      }

      // Light background
      ctx.fillStyle = '#F8FAFC'
      ctx.fillRect(0, 0, W, H)

      const nm2 = new Map(nodes.map(n => [n.id, n]))

      // Edges
      for (const e of edges) {
        const a = nm2.get(e.source), b = nm2.get(e.target)
        if (!a || !b) continue
        const dimmed = activeTag && !a.tags.includes(activeTag) && !b.tags.includes(activeTag)
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
        if (e.weight === 2) {
          // Shared author — solid indigo
          ctx.strokeStyle = dimmed ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.55)'
          ctx.lineWidth = dimmed ? 0.5 : 2; ctx.setLineDash([])
        } else {
          // Shared topic — dashed grey
          ctx.strokeStyle = dimmed ? 'rgba(0,0,0,0.04)' : 'rgba(148,163,184,0.45)'
          ctx.lineWidth = dimmed ? 0.5 : 1; ctx.setLineDash([5, 6])
        }
        ctx.stroke(); ctx.setLineDash([])
      }

      // Nodes
      for (const n of nodes) {
        const hov = hoverRef.current?.id === n.id
        const sel = selectedRef.current?.id === n.id
        const dimmed = activeTag && !n.tags.includes(activeTag)
        const r = hov || sel ? 14 : 11

        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0

        if (!dimmed) {
          // Drop shadow
          ctx.shadowColor = n.color + '55'; ctx.shadowBlur = hov || sel ? 20 : 10; ctx.shadowOffsetY = 2
        }

        // Selection ring
        if (sel) {
          ctx.beginPath(); ctx.arc(n.x, n.y, r+6, 0, Math.PI*2)
          ctx.strokeStyle = n.color + '44'; ctx.lineWidth = 3; ctx.shadowBlur = 0
          ctx.stroke()
          ctx.shadowColor = n.color + '55'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 2
        }

        // Node fill
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI*2)
        ctx.fillStyle = dimmed ? '#E2E8F0' : n.color
        ctx.fill()
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0

        // White border
        if (!dimmed) {
          ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI*2)
          ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.stroke()
        }

        // Inner highlight
        if (!dimmed) {
          ctx.beginPath(); ctx.arc(n.x - r*0.28, n.y - r*0.3, r*0.32, 0, Math.PI*2)
          ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill()
        }

        // Year label — always visible, readable
        ctx.fillStyle = dimmed ? '#CBD5E1' : '#fff'
        ctx.font = `bold 10px 'Raleway', sans-serif`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(`'${String(n.year).slice(2)}`, n.x, n.y)
      }

      // Hover tooltip — light card
      const hov = hoverRef.current
      if (hov) {
        const title = hov.title.length > 44 ? hov.title.slice(0, 41) + '…' : hov.title
        const tw = 260, th = 68
        const tx = Math.min(hov.x + 18, W - tw - 8)
        const ty = hov.y < 90 ? hov.y + 18 : hov.y - th - 12

        ctx.shadowColor = 'rgba(0,0,0,0.15)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 4
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(tx, ty, tw, th, 10)
        else ctx.rect(tx, ty, tw, th)
        ctx.fill()
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0

        // Colored left accent
        ctx.fillStyle = hov.color
        ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(tx, ty, 4, th, [10, 0, 0, 10])
        else ctx.rect(tx, ty, 4, th)
        ctx.fill()

        // Border
        ctx.strokeStyle = hov.color + '33'; ctx.lineWidth = 1
        ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(tx, ty, tw, th, 10)
        else ctx.rect(tx, ty, tw, th)
        ctx.stroke()

        ctx.fillStyle = '#0F172A'; ctx.font = 'bold 12px Raleway, sans-serif'
        ctx.textAlign = 'left'; ctx.textBaseline = 'top'
        ctx.fillText(title, tx + 14, ty + 11)
        ctx.fillStyle = '#64748B'; ctx.font = '11px Lato, sans-serif'
        ctx.fillText(`${hov.year}  ·  ${hov.tags.slice(0, 2).map(t => t.replace(/^theme:|^category:/i,'')).join('  ·  ') || hov.status}`, tx + 14, ty + 32)
        ctx.fillStyle = hov.color; ctx.font = 'bold 10px Lato, sans-serif'
        ctx.fillText(hov.authors.split(',')[0].trim(), tx + 14, ty + 50)
      }

      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animRef.current)
  }, [activeTag])

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    hoverRef.current = nodesRef.current.find(n => {
      const dx = n.x - mx, dy = n.y - my; return Math.sqrt(dx*dx+dy*dy) <= 16
    }) ?? null
    if (canvasRef.current) canvasRef.current.style.cursor = hoverRef.current ? 'pointer' : 'default'
  }, [])

  const onClick = useCallback(() => {
    selectedRef.current = hoverRef.current ?? null
    setSelected(hoverRef.current ?? null)
  }, [])

  const connectedEdges = selected
    ? edgesRef.current.filter(e => e.source === selected.id || e.target === selected.id)
    : []

  return (
    // Negative margin breaks out of AgentPageLayout's 24px padding → true full bleed
    <div style={{ margin: -24, height: 'calc(100vh - 68px)', display: 'flex', flexDirection: 'column', fontFamily: 'Raleway, sans-serif', background: '#F8FAFC' }}>

      {/* ── Top bar ── */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 20, padding: '10px 20px', background: '#fff', borderBottom: '1px solid #E2E8F0' }}>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 20 }}>
          {[{ label: 'Papers', value: papers.length }, { label: 'Connections', value: edgeCount }].map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ fontSize: 20, fontWeight: 900, color: '#0F172A' }}>{s.value}</span>
              <span style={{ fontSize: 11, color: '#94A3B8', fontFamily: 'Lato' }}>{s.label}</span>
            </div>
          ))}
        </div>

        <div style={{ width: 1, height: 28, background: '#E2E8F0' }} />

        {/* Filter pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
          <span style={{ fontSize: 11, color: '#94A3B8', fontFamily: 'Lato', flexShrink: 0 }}>Cluster:</span>
          {['All', ...topTags].map(tag => {
            const isAll = tag === 'All'
            const active = isAll ? !activeTag : activeTag === tag
            const c = isAll ? '#6366F1' : (tagColorMap[tag] ?? '#6366F1')
            const label = isAll ? 'All' : tag.replace(/^theme:|^category:/i, '').replace(/-/g, ' ')
            return (
              <button key={tag} onClick={() => setActiveTag(isAll ? null : (activeTag === tag ? null : tag))}
                style={{ padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700, fontFamily: 'Raleway', flexShrink: 0, border: `1.5px solid ${active ? c : '#E2E8F0'}`, background: active ? c : '#fff', color: active ? '#fff' : '#64748B', cursor: 'pointer', transition: 'all .15s' }}>
                {label}
              </button>
            )
          })}
        </div>

        {/* Legend */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748B', fontFamily: 'Lato' }}>
            <svg width="24" height="10" style={{ flexShrink: 0 }}><line x1="0" y1="5" x2="24" y2="5" stroke="rgba(99,102,241,0.7)" strokeWidth="2.5" /></svg>
            Shared author
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748B', fontFamily: 'Lato' }}>
            <svg width="24" height="10" style={{ flexShrink: 0 }}><line x1="0" y1="5" x2="24" y2="5" stroke="rgba(148,163,184,0.7)" strokeWidth="1.5" strokeDasharray="4 4" /></svg>
            Shared topic
          </span>
        </div>
      </div>

      {/* ── Canvas + panel ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div ref={wrapRef} style={{ flex: 1, position: 'relative' }}>
          {!ready && (
            <div style={{ position: 'absolute', inset: 0, background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid #6366F1', borderTopColor: 'transparent', animation: 'gSpin .8s linear infinite' }} />
              <p style={{ fontFamily: 'Lato', fontSize: 13, color: '#94A3B8', margin: 0 }}>Building citation graph…</p>
            </div>
          )}
          <canvas ref={canvasRef} onMouseMove={onMouseMove} onClick={onClick}
            style={{ display: 'block', width: '100%', height: '100%' }} />
        </div>

        {/* Selected paper panel */}
        {selected && (
          <div style={{ width: 280, flexShrink: 0, background: '#fff', borderLeft: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #F1F5F9', background: selected.color + '0d' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                <h3 style={{ fontFamily: 'Raleway', fontWeight: 900, fontSize: 14, color: '#0F172A', margin: 0, lineHeight: 1.45 }}>{selected.title}</h3>
                <button onClick={() => { setSelected(null); selectedRef.current = null }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 20, lineHeight: 1, flexShrink: 0 }}>×</button>
              </div>
              <p style={{ fontFamily: 'Lato', fontSize: 12, color: '#64748B', margin: 0 }}>{selected.authors.split(',').slice(0,2).join(',')} {selected.authors.split(',').length > 2 ? `+${selected.authors.split(',').length-2} more` : ''}</p>
            </div>

            <div style={{ padding: '12px 18px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 24, fontWeight: 900, color: selected.color }}>{selected.year}</span>
              {selected.tags.slice(0, 5).map(t => (
                <span key={t} style={{ fontSize: 10, fontFamily: 'Raleway', fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: (tagColorMap[t] ?? selected.color) + '18', color: tagColorMap[t] ?? selected.color, border: `1px solid ${(tagColorMap[t] ?? selected.color)}30` }}>
                  {t.replace(/^theme:|^category:/i,'')}
                </span>
              ))}
            </div>

            <div style={{ padding: '14px 18px', flex: 1 }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px', fontFamily: 'Raleway' }}>
                {connectedEdges.length} Connection{connectedEdges.length !== 1 ? 's' : ''}
              </p>
              {connectedEdges.length === 0 ? (
                <p style={{ fontSize: 12, fontFamily: 'Lato', color: '#CBD5E1' }}>Unique — no shared authors or topics</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {connectedEdges.map(e => {
                    const otherId = e.source === selected.id ? e.target : e.source
                    const other = nodesRef.current.find(n => n.id === otherId)
                    if (!other) return null
                    return (
                      <div key={otherId} onClick={() => { selectedRef.current = other; setSelected(other) }}
                        style={{ padding: '10px 12px', borderRadius: 10, background: '#F8FAFC', cursor: 'pointer', border: '1.5px solid #E2E8F0', transition: 'all .15s' }}
                        onMouseEnter={e2 => { e2.currentTarget.style.borderColor = other.color; e2.currentTarget.style.background = other.color + '0a' }}
                        onMouseLeave={e2 => { e2.currentTarget.style.borderColor = '#E2E8F0'; e2.currentTarget.style.background = '#F8FAFC' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: other.color, flexShrink: 0 }} />
                          <p style={{ fontSize: 12, fontFamily: 'Raleway', fontWeight: 700, color: '#1E293B', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {other.title.length > 36 ? other.title.slice(0, 33) + '…' : other.title}
                          </p>
                        </div>
                        <p style={{ fontSize: 11, fontFamily: 'Lato', margin: 0, color: e.weight === 2 ? '#6366F1' : '#94A3B8', paddingLeft: 15 }}>
                          {e.weight === 2 ? '👥 shared author' : `🏷️ ${e.label.replace(/^theme:|^category:/i,'')}`}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes gSpin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
