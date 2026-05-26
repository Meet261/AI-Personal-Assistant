'use client'
import { useState, useEffect, useCallback } from 'react'
import { TrendingUp, RefreshCw, Activity, DollarSign, Target, BarChart3, Shield, Play, Square, X, CheckCircle2, AlertTriangle } from 'lucide-react'
import AgentPageLayout from '@/components/agents/AgentPageLayout'

const COLOR = '#B45309'

type ModelSource = 'both' | 'aitrader' | 'alchemist'

interface TradeSummary {
  running: boolean
  total_trades: number
  total_pnl: number
  today_pnl: number
  today_trades: number
  wins: number
  losses: number
  win_rate: number
  open_positions: number
  symbols: string[]
}

interface Trade {
  source: ModelSource
  symbol: string
  type: string
  open_time: string
  close_time: string
  open_price: string
  close_price: string
  volume: string
  sl: string
  tp: string
  profit: string
}

const MODEL_LABELS: Record<ModelSource, string> = {
  both: 'Both Models',
  aitrader: 'AITrader',
  alchemist: 'Alchemist',
}

const MODEL_COLORS: Record<ModelSource, string> = {
  both: COLOR,
  aitrader: '#2563eb',
  alchemist: '#7c3aed',
}

function ModelToggle({ value, onChange }: { value: ModelSource; onChange: (v: ModelSource) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, background: 'var(--faint)', borderRadius: 10, padding: 3 }}>
      {(['both', 'aitrader', 'alchemist'] as ModelSource[]).map(m => (
        <button key={m} onClick={() => onChange(m)} style={{
          padding: '5px 13px', borderRadius: 7, border: 'none', cursor: 'pointer',
          background: value === m ? 'var(--panel)' : 'transparent',
          color: value === m ? MODEL_COLORS[m] : 'var(--muted)',
          fontFamily: 'Raleway', fontWeight: 700, fontSize: 11,
          boxShadow: value === m ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
        }}>{MODEL_LABELS[m]}</button>
      ))}
    </div>
  )
}

function SourceBadge({ source }: { source: string }) {
  const s = source as ModelSource
  const color = MODEL_COLORS[s] ?? COLOR
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
      background: `${color}18`, color, textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>{source === 'aitrader' ? 'AIT' : source === 'alchemist' ? 'ALC' : '—'}</span>
  )
}

function StatCard({ label, value, sub, icon: Icon, positive, large }: {
  label: string; value: string | number; sub?: string
  icon?: React.ElementType; positive?: boolean; large?: boolean
}) {
  const color = positive === undefined ? 'var(--text)' : positive ? '#22c55e' : '#ef4444'
  return (
    <div style={{ background: 'var(--panel)', borderRadius: 14, padding: '18px 20px', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
        {Icon && <Icon size={14} color="var(--muted)" />}
      </div>
      <div style={{ fontSize: large ? 28 : 22, fontWeight: 900, color, fontFamily: 'Raleway', letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, fontFamily: 'Lato' }}>{sub}</div>}
    </div>
  )
}

function TradeRow({ trade, isWin }: { trade: Trade; isWin: boolean }) {
  const profit = parseFloat(trade.profit)
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '56px 46px 46px 80px 80px 70px 70px 70px 72px',
      gap: 8, padding: '10px 16px', alignItems: 'center',
      borderBottom: '1px solid var(--faint)',
      background: isWin ? 'rgba(34,197,94,0.03)' : 'rgba(239,68,68,0.03)',
    }}>
      <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text)' }}>{trade.symbol}</span>
      <SourceBadge source={trade.source} />
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '2px 5px', borderRadius: 5, textAlign: 'center',
        background: trade.type?.toLowerCase().includes('buy') ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
        color: trade.type?.toLowerCase().includes('buy') ? '#16a34a' : '#dc2626',
      }}>{trade.type || '—'}</span>
      <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>{trade.open_price || '—'}</span>
      <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>{trade.close_price || '—'}</span>
      <span style={{ fontSize: 11, color: '#ef4444', fontFamily: 'Lato' }}>{trade.sl || '—'}</span>
      <span style={{ fontSize: 11, color: '#22c55e', fontFamily: 'Lato' }}>{trade.tp || '—'}</span>
      <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>{trade.volume || '—'}</span>
      <span style={{ fontWeight: 800, fontSize: 13, textAlign: 'right', color: profit >= 0 ? '#16a34a' : '#dc2626' }}>
        {profit >= 0 ? '+' : ''}{profit.toFixed(2)}
      </span>
    </div>
  )
}

export default function TradingAgentPage() {
  const [modelSource, setModelSource] = useState<ModelSource>('both')
  const [summary, setSummary] = useState<TradeSummary | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [todayTrades, setTodayTrades] = useState<Trade[]>([])
  const [todayPnlData, setTodayPnlData] = useState<{ count: number; pnl: string; wins: number; losses: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [tradeFilter, setTradeFilter] = useState<'all' | 'today' | 'wins' | 'losses'>('all')
  const [refreshing, setRefreshing] = useState(false)
  const [allTrades, setAllTrades] = useState<Trade[]>([])
  const [agentRunning, setAgentRunning] = useState<boolean | null>(null)
  const [controlling, setControlling] = useState(false)

  // ── Pre-session gate ──────────────────────────────────────────────────────
  const [showGate, setShowGate]         = useState(false)
  const [gateMood, setGateMood]         = useState(0)
  const [gatePlan, setGatePlan]         = useState('')
  const [gateMaxLoss, setGateMaxLoss]   = useState('')
  const [gateNews, setGateNews]         = useState(false)
  const [gateDrawdown, setGateDrawdown] = useState(false)

  function gatePassedToday() {
    const today = new Date().toISOString().slice(0, 10)
    return localStorage.getItem(`trading_gate_${today}`) === 'passed'
  }
  function markGatePassed() {
    const today = new Date().toISOString().slice(0, 10)
    localStorage.setItem(`trading_gate_${today}`, 'passed')
  }
  const gateComplete = gateMood > 0 && gatePlan.trim().length > 0
    && gateMaxLoss.trim().length > 0 && gateNews && gateDrawdown

  const setAndCacheRunning = useCallback((v: boolean) => {
    setAgentRunning(v)
  }, [])

  const load = useCallback(async (src?: ModelSource) => {
    const source = src ?? modelSource
    setRefreshing(true)
    try {
      const [sumRes, statusRes] = await Promise.all([
        fetch(`/api/trading/summary?source=${source}`).then(r => r.json()),
        fetch('/api/agents/trading').then(r => r.json()),
      ])
      setSummary(sumRes)
      setAndCacheRunning(statusRes.running ?? false)
      setLoading(false)

      const [tradeRes, todayRes] = await Promise.all([
        fetch(`/api/agents/trading/trades?source=${source}`).then(r => r.json()).catch(() => null),
        fetch(`/api/agents/trading/today?source=${source}`).then(r => r.json()).catch(() => null),
      ])
      const tradeList: Trade[] = Array.isArray(tradeRes?.data) ? tradeRes.data : []
      setTrades(tradeList)
      setAllTrades(tradeList)
      if (todayRes?.data?.trades) {
        setTodayTrades(todayRes.data.trades)
        setTodayPnlData(todayRes.data.summary)
      }
    } catch {
      setLoading(false)
    }
    setRefreshing(false)
  }, [modelSource, setAndCacheRunning])

  const handleSourceChange = useCallback((src: ModelSource) => {
    setModelSource(src)
    load(src)
  }, [load])

  const controlAgent = useCallback(async (action: 'start' | 'stop') => {
    setControlling(true)
    setAndCacheRunning(action === 'start')
    try {
      await fetch('/api/agents/trading', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (action === 'start') {
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 500))
          const s = await fetch('/api/agents/trading').then(r => r.json()).catch(() => null)
          if (s?.running) { setAndCacheRunning(true); break }
        }
      } else {
        let stopped = false
        for (let i = 0; i < 10; i++) {
          await new Promise(r => setTimeout(r, 500))
          const s = await fetch('/api/agents/trading').then(r => r.json()).catch(() => null)
          if (!s?.running) { stopped = true; break }
        }
        setAndCacheRunning(!stopped)
      }
    } catch {}
    setControlling(false)
  }, [setAndCacheRunning])

  useEffect(() => { load() }, [load])

  const filteredTrades = trades.filter(t => {
    const profit = parseFloat(t.profit)
    if (tradeFilter === 'wins') return profit > 0
    if (tradeFilter === 'losses') return profit < 0
    if (tradeFilter === 'today') {
      const today = new Date().toISOString().slice(0, 10)
      return t.close_time?.startsWith(today) || t.close_time?.startsWith(today.replace(/-/g, '.'))
    }
    return true
  })

  const winRate  = summary?.win_rate ?? 0
  const totalPnl = summary?.total_pnl ?? 0
  const todayPnl = summary?.today_pnl ?? 0

  // ── Pattern analysis ──────────────────────────────────────────────────────
  const patterns = (() => {
    if (!allTrades.length) return null
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const dayMap: Record<string, { count: number; wins: number; pnl: number }> = {}
    const hourMap: Record<number, { count: number; wins: number; pnl: number }> = {}
    const symMap: Record<string, { count: number; wins: number; pnl: number }> = {}
    const streakBuckets: Record<string, { count: number; wins: number }> = { '0': { count:0,wins:0 }, '1': { count:0,wins:0 }, '2': { count:0,wins:0 }, '3+': { count:0,wins:0 } }
    let consecLosses = 0

    const sorted = [...allTrades].sort((a, b) => a.close_time < b.close_time ? -1 : 1)
    for (const t of sorted) {
      const profit = parseFloat(t.profit)
      const isWin = profit > 0
      // Handle both YYYY.MM.DD HH:MM:SS and ISO 2026-05-25T08:59:39 formats
      let dt: Date
      if (t.close_time.includes('T')) {
        dt = new Date(t.close_time)
      } else {
        const parts = t.close_time?.split(' ')
        if (!parts || parts.length < 2) continue
        const [y, m, d] = parts[0].split('.')
        dt = new Date(`${y}-${m}-${d}T${parts[1]}`)
      }
      if (isNaN(dt.getTime())) continue
      const day  = DAYS[dt.getDay()]
      const hour = dt.getHours()
      const sym  = t.symbol

      if (!dayMap[day]) dayMap[day] = { count: 0, wins: 0, pnl: 0 }
      dayMap[day].count++; dayMap[day].wins += isWin ? 1 : 0; dayMap[day].pnl += profit

      if (!hourMap[hour]) hourMap[hour] = { count: 0, wins: 0, pnl: 0 }
      hourMap[hour].count++; hourMap[hour].wins += isWin ? 1 : 0; hourMap[hour].pnl += profit

      if (!symMap[sym]) symMap[sym] = { count: 0, wins: 0, pnl: 0 }
      symMap[sym].count++; symMap[sym].wins += isWin ? 1 : 0; symMap[sym].pnl += profit

      const sk = consecLosses === 0 ? '0' : consecLosses === 1 ? '1' : consecLosses === 2 ? '2' : '3+'
      streakBuckets[sk].count++; streakBuckets[sk].wins += isWin ? 1 : 0
      consecLosses = isWin ? 0 : consecLosses + 1
    }

    const wr = (s: { count: number; wins: number }) => s.count ? Math.round((s.wins / s.count) * 100) : 0
    const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const days    = dayOrder.filter(d => dayMap[d]).map(d => ({ day: d, ...dayMap[d], wr: wr(dayMap[d]) }))
    const hours   = Object.entries(hourMap).sort((a, b) => +a[0] - +b[0]).map(([h, s]) => ({ hour: +h, ...s, wr: wr(s) }))
    const symbols = Object.entries(symMap).sort((a, b) => b[1].count - a[1].count).map(([sym, s]) => ({ sym, ...s, wr: wr(s) }))
    const streaks = ['0', '1', '2', '3+'].filter(k => streakBuckets[k].count > 0).map(k => ({ after: k, ...streakBuckets[k], wr: wr(streakBuckets[k]) }))
    const bestHour  = hours.reduce((a, b) => (b.count >= 3 && b.wr > a.wr ? b : a), hours[0])
    const worstHour = hours.reduce((a, b) => (b.count >= 3 && b.wr < a.wr ? b : a), hours[0])

    return { days, hours, symbols, streaks, bestHour, worstHour }
  })()

  // ── Dashboard tab ─────────────────────────────────────────────────────────
  const dashboard = (
    <div style={{ maxWidth: 900 }}>
      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        {/* Agent start/stop */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderRadius: 12, background: 'var(--panel)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: agentRunning === null ? '#eab308' : agentRunning ? '#22c55e' : '#94a3b8',
              boxShadow: agentRunning ? '0 0 6px #22c55e80' : agentRunning === null ? '0 0 6px #eab30880' : 'none',
            }} />
            <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'Raleway', color: agentRunning === null ? '#92400e' : agentRunning ? '#16a34a' : 'var(--muted)' }}>
              Trading Agent · {agentRunning === null ? 'Checking…' : agentRunning ? 'Running' : 'Stopped'}
            </span>
          </div>
          {agentRunning === null ? null : agentRunning ? (
            <button onClick={() => controlAgent('stop')} disabled={controlling} style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 8,
              background: '#ef444415', border: '1px solid #ef444440', color: '#dc2626',
              cursor: 'pointer', fontFamily: 'Raleway', fontWeight: 700, fontSize: 12,
              opacity: controlling ? 0.5 : 1,
            }}>
              <Square size={11} fill="#dc2626" /> Stop
            </button>
          ) : (
            <button onClick={() => { if (gatePassedToday()) { controlAgent('start') } else { setShowGate(true) } }} disabled={controlling} style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 8,
              background: '#22c55e15', border: '1px solid #22c55e40', color: '#16a34a',
              cursor: 'pointer', fontFamily: 'Raleway', fontWeight: 700, fontSize: 12,
              opacity: controlling ? 0.5 : 1,
            }}>
              <Play size={11} fill="#16a34a" /> {controlling ? 'Starting…' : 'Start'}
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ModelToggle value={modelSource} onChange={handleSourceChange} />
          <button onClick={() => load()} disabled={refreshing} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
            borderRadius: 10, border: '1px solid var(--border)', background: 'var(--faint)',
            color: 'var(--muted)', cursor: 'pointer', fontFamily: 'Raleway', fontWeight: 700, fontSize: 12,
          }}>
            <RefreshCw size={13} style={{ animation: refreshing ? 'spin .8s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>Loading trading data…</div>
      ) : !summary ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>No trading data found.</div>
      ) : (
        <>
          {/* Model source label */}
          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', fontFamily: 'Lato' }}>Showing:</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: MODEL_COLORS[modelSource], fontFamily: 'Raleway' }}>{MODEL_LABELS[modelSource]}</span>
          </div>

          {/* KPI grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
            <StatCard label="Overall P&L" value={`$${totalPnl.toFixed(2)}`} positive={totalPnl >= 0} icon={DollarSign} large />
            <StatCard label="Win Rate" value={`${winRate.toFixed(1)}%`} positive={winRate >= 50} sub={`${summary.wins}W / ${summary.losses}L`} icon={Target} />
            <StatCard label="All Trades" value={summary.total_trades} sub={`${summary.open_positions} open`} icon={BarChart3} />
            <StatCard label="Open Positions" value={summary.open_positions} sub={summary.symbols.join(', ')} icon={Activity} />
          </div>

          {/* Symbol breakdown */}
          <div style={{ background: 'var(--panel)', borderRadius: 14, padding: '18px 20px', border: '1px solid var(--border)', marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Active Symbols</h3>
            <div style={{ display: 'flex', gap: 10 }}>
              {summary.symbols.length > 0 ? summary.symbols.map(sym => (
                <div key={sym} style={{
                  padding: '8px 16px', borderRadius: 10, border: `1px solid ${COLOR}30`,
                  background: `${COLOR}08`, color: COLOR, fontWeight: 800, fontSize: 14, fontFamily: 'Raleway',
                }}>{sym}</div>
              )) : <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato' }}>No open positions</span>}
              {summary.open_positions > 0 && (
                <div style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid #22c55e30', background: '#22c55e08', color: '#16a34a', fontWeight: 700, fontSize: 12, fontFamily: 'Lato', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e' }} />
                  {summary.open_positions} open position{summary.open_positions !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          </div>

          {/* Risk state */}
          <div style={{ background: 'var(--panel)', borderRadius: 14, padding: '18px 20px', border: '1px solid var(--border)', display: 'flex', gap: 24, alignItems: 'center' }}>
            <Shield size={20} color={totalPnl >= 0 ? '#22c55e' : '#ef4444'} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>Risk State</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato', marginTop: 3 }}>
                {totalPnl >= 0 ? 'Account in profit — maintain discipline' : `Account drawdown: $${Math.abs(totalPnl).toFixed(2)} — review strategy`}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: totalPnl >= 0 ? '#22c55e' : '#ef4444' }} />
              <span style={{ fontWeight: 700, fontSize: 12, color: totalPnl >= 0 ? '#16a34a' : '#dc2626' }}>
                {totalPnl >= 0 ? 'Healthy' : 'Caution'}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  )

  // ── Trade history tab ─────────────────────────────────────────────────────
  const actions = (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Trade History</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <ModelToggle value={modelSource} onChange={handleSourceChange} />
          <div style={{ display: 'flex', gap: 6, background: 'var(--faint)', borderRadius: 10, padding: 3 }}>
            {(['all', 'today', 'wins', 'losses'] as const).map(f => (
              <button key={f} onClick={() => setTradeFilter(f)} style={{
                padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: tradeFilter === f ? 'var(--panel)' : 'transparent',
                color: tradeFilter === f ? COLOR : 'var(--muted)',
                fontFamily: 'Raleway', fontWeight: 700, fontSize: 11,
                boxShadow: tradeFilter === f ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
                textTransform: 'capitalize',
              }}>{f}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--panel)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '56px 46px 46px 80px 80px 70px 70px 70px 72px',
          gap: 8, padding: '10px 16px', background: 'var(--faint)', borderBottom: '1px solid var(--border)',
        }}>
          {['Symbol', 'Src', 'Type', 'Entry', 'Exit', 'SL', 'TP', 'Lots', 'P&L'].map(h => (
            <span key={h} style={{ fontSize: 10, fontWeight: 700, color: h === 'SL' ? '#ef4444' : h === 'TP' ? '#22c55e' : 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: h === 'P&L' ? 'right' : 'left' }}>{h}</span>
          ))}
        </div>

        {filteredTrades.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13, fontFamily: 'Lato' }}>
            No trades match this filter
          </div>
        ) : (
          filteredTrades.slice(-50).reverse().map((t, i) => (
            <TradeRow key={i} trade={t} isWin={parseFloat(t.profit) > 0} />
          ))
        )}
      </div>
      {filteredTrades.length > 50 && (
        <p style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>Showing last 50 of {filteredTrades.length} trades</p>
      )}
    </div>
  )

  // ── Command center sidebar ────────────────────────────────────────────────
  const commandCenter = summary ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[
        { label: 'Agent',     value: agentRunning === null ? 'Checking…' : agentRunning ? 'Running' : 'Stopped', color: agentRunning ? '#22c55e' : '#94a3b8' },
        { label: 'Model',     value: MODEL_LABELS[modelSource], color: MODEL_COLORS[modelSource] },
        { label: 'Total P&L', value: `$${(summary.total_pnl).toFixed(2)}`, color: summary.total_pnl >= 0 ? '#22c55e' : '#ef4444' },
        { label: 'Win Rate',  value: `${summary.win_rate.toFixed(1)}%`, color: summary.win_rate >= 50 ? '#22c55e' : '#ef4444' },
        { label: 'Open',      value: `${summary.open_positions} positions`, color: 'var(--text)' },
      ].map(item => (
        <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>{item.label}</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: item.color, fontFamily: 'Raleway' }}>{item.value}</span>
        </div>
      ))}
    </div>
  ) : null

  const settings = (
    <div style={{ maxWidth: 500 }}>
      <div style={{ background: 'var(--panel)', borderRadius: 14, padding: 20, border: '1px solid var(--border)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Trading Agent Settings</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { label: 'AITrader data',  value: '../Trade/trading_agent/logs/trades.csv', readonly: true },
            { label: 'Alchemist data', value: '../Trading Agent/alchemist_mt5_trader/logs/alchemist_signals.csv', readonly: true },
            { label: 'Risk state',     value: 'risk_state.json (AITrader)', readonly: true },
            { label: 'Mode',           value: agentRunning === null ? 'Checking…' : agentRunning ? 'Live — receiving EA signals' : 'Stopped — analytics only', readonly: true },
            { label: 'Cascade',        value: 'Runs nightly at 21:00 via cron', readonly: true },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--faint)' }}>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato' }}>{s.label}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', fontFamily: 'Lato', textAlign: 'right', maxWidth: 260 }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  // ── Today tab ─────────────────────────────────────────────────────────────
  const todayDate   = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
  const todayPnlNum = parseFloat(todayPnlData?.pnl ?? '0')
  const today = (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <ModelToggle value={modelSource} onChange={handleSourceChange} />
        <button onClick={() => load()} disabled={refreshing} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'Raleway', fontWeight: 700, fontSize: 12 }}>
          <RefreshCw size={13} style={{ animation: refreshing ? 'spin .8s linear infinite' : 'none' }} /> Refresh
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Today P&L', value: todayPnlData ? `$${todayPnlNum.toFixed(2)}` : '—', positive: todayPnlNum >= 0, icon: DollarSign, large: true },
          { label: 'Trades',    value: todayPnlData?.count ?? 0, icon: Activity },
          { label: 'Wins',      value: todayPnlData?.wins ?? 0, positive: true, icon: Target },
          { label: 'Losses',    value: todayPnlData?.losses ?? 0, positive: false, icon: BarChart3 },
        ].map(s => <StatCard key={s.label} {...s} label={s.label} value={s.value} />)}
      </div>

      <div style={{ background: 'var(--panel)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>
            {todayDate} — {todayTrades.length} trade{todayTrades.length !== 1 ? 's' : ''}
          </h3>
          <span style={{ fontSize: 11, fontWeight: 700, color: MODEL_COLORS[modelSource], fontFamily: 'Raleway' }}>{MODEL_LABELS[modelSource]}</span>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontFamily: 'Lato' }}>Loading…</div>
        ) : todayTrades.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontFamily: 'Lato' }}>
            No trades today yet.
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '56px 46px 46px 80px 80px 70px 70px 70px 72px', gap: 8, padding: '10px 16px', background: 'var(--faint)', borderBottom: '1px solid var(--border)' }}>
              {['Symbol', 'Src', 'Type', 'Entry', 'Exit', 'SL', 'TP', 'Lots', 'P&L'].map(h => (
                <span key={h} style={{ fontSize: 10, fontWeight: 700, color: h === 'SL' ? '#ef4444' : h === 'TP' ? '#22c55e' : 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: h === 'P&L' ? 'right' : 'left' }}>{h}</span>
              ))}
            </div>
            {todayTrades.map((t, i) => <TradeRow key={i} trade={t} isWin={parseFloat(t.profit) > 0} />)}
          </>
        )}
      </div>
    </div>
  )

  // ── Pre-session gate modal ────────────────────────────────────────────────
  const MOODS = ['😫', '😟', '😐', '🙂', '😊']
  const gateModal = showGate && (
    <div onClick={() => setShowGate(false)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(10,20,30,0.65)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(520px,96vw)', background: 'var(--panel)', borderRadius: 20, border: `1px solid ${COLOR}40`, boxShadow: `0 28px 72px rgba(0,0,0,0.4)`, overflow: 'hidden' }}>
        <div style={{ background: `${COLOR}12`, padding: '20px 24px 16px', borderBottom: `1px solid ${COLOR}20` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Shield size={18} color={COLOR} />
            <span style={{ fontFamily: 'Raleway', fontWeight: 900, fontSize: 16, color: 'var(--text)' }}>Pre-Session Checklist</span>
            <button type="button" onClick={() => setShowGate(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', lineHeight: 0, padding: 4 }}><X size={15} /></button>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato' }}>Answer all 5 questions before the session starts. This takes 30 seconds and saves you from emotional trades.</p>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', fontFamily: 'Raleway', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 10 }}>
              1 · How are you feeling right now?
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              {MOODS.map((emoji, i) => (
                <button key={i} type="button" onClick={() => setGateMood(i + 1)} style={{ flex: 1, padding: '10px 4px', borderRadius: 10, border: `2px solid ${gateMood === i + 1 ? COLOR : 'var(--border)'}`, background: gateMood === i + 1 ? `${COLOR}15` : 'var(--faint)', fontSize: 22, cursor: 'pointer', transition: 'all .12s' }}>
                  {emoji}
                </button>
              ))}
            </div>
            {gateMood > 0 && gateMood <= 2 && (
              <p style={{ margin: '8px 0 0', fontSize: 11, color: '#f97316', fontFamily: 'Lato' }}>⚠ Low mood detected — consider reducing position size today.</p>
            )}
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', fontFamily: 'Raleway', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 10 }}>
              2 · Drawdown awareness
            </label>
            <div style={{ padding: '12px 14px', borderRadius: 10, background: totalPnl < 0 ? '#ef444410' : '#22c55e10', border: `1px solid ${totalPnl < 0 ? '#ef444440' : '#22c55e40'}`, marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: totalPnl < 0 ? '#dc2626' : '#16a34a', fontFamily: 'Raleway' }}>
                Overall P&L: {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)} · Today: {todayPnl >= 0 ? '+' : ''}{todayPnl.toFixed(2)}
              </span>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={gateDrawdown} onChange={e => setGateDrawdown(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
              <span style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'Lato' }}>I am aware of my current drawdown and within my risk limits</span>
            </label>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', fontFamily: 'Raleway', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>
              3 · What is your plan for this session?
            </label>
            <textarea value={gatePlan} onChange={e => setGatePlan(e.target.value)} rows={2} placeholder="e.g. XAUUSD trend follow on 1H, wait for London open, no revenge trading…" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--text)', fontFamily: 'Lato', fontSize: 13, outline: 'none', resize: 'none', boxSizing: 'border-box', lineHeight: 1.5 }} />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', fontFamily: 'Raleway', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>
              4 · Max loss limit for this session ($)
            </label>
            <input type="number" value={gateMaxLoss} onChange={e => setGateMaxLoss(e.target.value)} placeholder="e.g. 50" min="0" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--text)', fontFamily: 'Lato', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={gateNews} onChange={e => setGateNews(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
              <span style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'Lato' }}>
                <strong>5 ·</strong> I have checked the economic calendar for high-impact news events today
              </span>
            </label>
          </div>
        </div>

        <div style={{ padding: '14px 24px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato' }}>
            {gateComplete ? <span style={{ color: '#22c55e', fontWeight: 700 }}>✓ All checks complete</span> : `${[gateMood > 0, gateDrawdown, gatePlan.trim().length > 0, gateMaxLoss.trim().length > 0, gateNews].filter(Boolean).length} / 5 complete`}
          </div>
          <button
            type="button"
            disabled={!gateComplete || controlling}
            onClick={() => { markGatePassed(); setShowGate(false); controlAgent('start') }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderRadius: 11, border: 'none', background: gateComplete ? COLOR : 'var(--faint)', color: gateComplete ? '#fff' : 'var(--muted)', fontFamily: 'Raleway', fontWeight: 800, fontSize: 13, cursor: gateComplete ? 'pointer' : 'not-allowed', transition: 'all .15s', opacity: gateComplete ? 1 : 0.6 }}
          >
            <Play size={13} fill={gateComplete ? '#fff' : 'var(--muted)'} /> Start Session
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {gateModal}
      <AgentPageLayout
        agentId="trading"
        agentName="Trading Agent"
        agentColor={COLOR}
        agentIcon={<TrendingUp size={20} />}
        description="P&L analytics, risk monitoring & trade history"
        tabs={['dashboard', 'today', 'patterns', 'actions', 'chat', 'settings']}
        starters={[
          'How did trading go today?',
          'What is my current win rate?',
          'Show me my recent losing trades',
          'What is my risk state?',
          'Which model performed best?',
        ]}
        dashboard={dashboard}
        today={today}
        actions={actions}
        settings={settings}
        commandCenter={commandCenter}
        patterns={patterns ? (
          <div style={{ maxWidth: 860 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, fontFamily: 'Raleway', color: 'var(--text)' }}>Pattern Analysis — {allTrades.length} trades</h2>
              <ModelToggle value={modelSource} onChange={handleSourceChange} />
            </div>

            {patterns.bestHour && patterns.worstHour && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
                <div style={{ padding: '14px 18px', borderRadius: 14, background: '#22c55e10', border: '1px solid #22c55e30' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Best Hour</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#22c55e', fontFamily: 'Raleway' }}>{patterns.bestHour.hour}:00–{patterns.bestHour.hour+1}:00</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato', marginTop: 4 }}>{patterns.bestHour.wr}% win rate · {patterns.bestHour.count} trades</div>
                </div>
                <div style={{ padding: '14px 18px', borderRadius: 14, background: '#ef444410', border: '1px solid #ef444430' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Worst Hour</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#ef4444', fontFamily: 'Raleway' }}>{patterns.worstHour.hour}:00–{patterns.worstHour.hour+1}:00</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato', marginTop: 4 }}>{patterns.worstHour.wr}% win rate · {patterns.worstHour.count} trades</div>
                </div>
              </div>
            )}

            <div style={{ background: 'var(--panel)', borderRadius: 16, border: '1px solid var(--border)', padding: 20, marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 800, fontFamily: 'Raleway', color: 'var(--text)' }}>Win Rate by Day of Week</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {patterns.days.map(d => {
                  const barColor = d.wr >= 55 ? '#22c55e' : d.wr >= 45 ? COLOR : '#ef4444'
                  return (
                    <div key={d.day} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', fontFamily: 'Raleway', width: 32 }}>{d.day}</span>
                      <div style={{ flex: 1, height: 24, borderRadius: 6, background: 'var(--faint)', overflow: 'hidden', position: 'relative' }}>
                        <div style={{ width: `${d.wr}%`, height: '100%', background: barColor, borderRadius: 6, transition: 'width .4s' }} />
                        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, fontWeight: 800, color: d.wr > 20 ? '#fff' : 'var(--text)', fontFamily: 'Raleway' }}>{d.wr}%</span>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato', width: 80, textAlign: 'right' }}>{d.count} trades · ${d.pnl.toFixed(0)}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ background: 'var(--panel)', borderRadius: 16, border: '1px solid var(--border)', padding: 20, marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 800, fontFamily: 'Raleway', color: 'var(--text)' }}>Win Rate by Hour (close time)</h3>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 80 }}>
                {patterns.hours.map(h => {
                  const barColor = h.wr >= 55 ? '#22c55e' : h.wr >= 45 ? COLOR : '#ef4444'
                  const barH = Math.max(8, (h.wr / 100) * 70)
                  return (
                    <div key={h.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                      <span style={{ fontSize: 9, fontWeight: 800, color: h.wr >= 55 ? '#22c55e' : h.wr <= 35 ? '#ef4444' : 'var(--muted)', fontFamily: 'Raleway' }}>{h.wr}%</span>
                      <div style={{ width: '100%', height: barH, borderRadius: '3px 3px 0 0', background: barColor }} title={`${h.hour}:00 — ${h.count} trades, ${h.wr}% WR, $${h.pnl.toFixed(0)}`} />
                      <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'Lato' }}>{h.hour}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ background: 'var(--panel)', borderRadius: 16, border: '1px solid var(--border)', padding: 20 }}>
                <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 800, fontFamily: 'Raleway', color: 'var(--text)' }}>By Symbol</h3>
                {patterns.symbols.map(s => (
                  <div key={s.sym} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: 'Raleway' }}>{s.sym}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: s.wr >= 50 ? '#22c55e' : '#ef4444', fontFamily: 'Raleway' }}>{s.wr}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--faint)' }}>
                      <div style={{ width: `${s.wr}%`, height: '100%', borderRadius: 3, background: s.wr >= 50 ? '#22c55e' : '#ef4444' }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato', marginTop: 3 }}>{s.count} trades · {s.wins}W/{s.count - s.wins}L · ${s.pnl.toFixed(0)}</div>
                  </div>
                ))}
              </div>

              <div style={{ background: 'var(--panel)', borderRadius: 16, border: '1px solid var(--border)', padding: 20 }}>
                <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 800, fontFamily: 'Raleway', color: 'var(--text)' }}>Win Rate After Consecutive Losses</h3>
                <p style={{ margin: '0 0 14px', fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato', lineHeight: 1.5 }}>Does your win rate change after a losing streak?</p>
                {patterns.streaks.map(s => (
                  <div key={s.after} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato', width: 80, flexShrink: 0 }}>After {s.after} loss{s.after !== '0' && s.after !== '1' ? 'es' : s.after === '1' ? '' : 'es'}</span>
                    <div style={{ flex: 1, height: 20, borderRadius: 5, background: 'var(--faint)', overflow: 'hidden', position: 'relative' }}>
                      <div style={{ width: `${s.wr}%`, height: '100%', background: s.wr >= 50 ? '#22c55e' : '#f97316', borderRadius: 5 }} />
                      <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, fontWeight: 800, color: '#fff', fontFamily: 'Raleway' }}>{s.wr}%</span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato', width: 50, flexShrink: 0 }}>{s.count} trades</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontFamily: 'Lato' }}>Load trades first from the Dashboard tab.</div>
        )}
      />
    </>
  )
}
