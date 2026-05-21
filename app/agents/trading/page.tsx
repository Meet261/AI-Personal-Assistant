'use client'
import { useState, useEffect, useCallback } from 'react'
import { TrendingUp, RefreshCw, Activity, DollarSign, Target, BarChart3, Shield, Play, Square, X, CheckCircle2, AlertTriangle } from 'lucide-react'
import AgentPageLayout from '@/components/agents/AgentPageLayout'

const COLOR = '#B45309'

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
  symbol: string
  type: string
  open_time: string
  close_time: string
  open_price: string
  close_price: string
  profit: string
  volume: string
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
      display: 'grid', gridTemplateColumns: '80px 60px 1fr 1fr 1fr 80px',
      gap: 12, padding: '11px 16px', alignItems: 'center',
      borderBottom: '1px solid var(--faint)',
      background: isWin ? 'rgba(34,197,94,0.03)' : 'rgba(239,68,68,0.03)',
    }}>
      <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--text)' }}>{trade.symbol}</span>
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 5, textAlign: 'center',
        background: trade.type?.toLowerCase().includes('buy') ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
        color: trade.type?.toLowerCase().includes('buy') ? '#16a34a' : '#dc2626',
      }}>{trade.type || '—'}</span>
      <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>{trade.open_price || '—'}</span>
      <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>{trade.close_price || '—'}</span>
      <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'Lato' }}>{trade.volume || '—'}</span>
      <span style={{ fontWeight: 800, fontSize: 13, textAlign: 'right', color: profit >= 0 ? '#16a34a' : '#dc2626' }}>
        {profit >= 0 ? '+' : ''}{profit.toFixed(2)}
      </span>
    </div>
  )
}

export default function TradingAgentPage() {
  const [summary, setSummary] = useState<TradeSummary | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [todayTrades, setTodayTrades] = useState<Trade[]>([])
  const [todayPnlData, setTodayPnlData] = useState<{ count: number; pnl: string; wins: number; losses: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [tradeFilter, setTradeFilter] = useState<'all' | 'today' | 'wins' | 'losses'>('all')
  const [refreshing, setRefreshing] = useState(false)
  // null = unknown (loading), true/false = confirmed from API
  const [agentRunning, setAgentRunning] = useState<boolean | null>(null)
  const [controlling, setControlling] = useState(false)

  // ── Pre-session gate ──────────────────────────────────────────────────────
  const [showGate, setShowGate]       = useState(false)
  const [gateMood, setGateMood]       = useState(0)          // 1-5
  const [gatePlan, setGatePlan]       = useState('')
  const [gateMaxLoss, setGateMaxLoss] = useState('')
  const [gateNews, setGateNews]       = useState(false)
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

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      // Fast fetches first — summary + agent status (no LLM involved)
      const [sumRes, statusRes] = await Promise.all([
        fetch('/api/trading/summary').then(r => r.json()),
        fetch('/api/agents/trading').then(r => r.json()),
      ])
      setSummary(sumRes)
      setAndCacheRunning(statusRes.running ?? false)
      setLoading(false)

      // Trades + today — direct action calls, no LLM
      const [tradeRes, todayRes] = await Promise.all([
        fetch('/api/agents/trading/trades').then(r => r.json()).catch(() => null),
        fetch('/api/agents/trading/today').then(r => r.json()).catch(() => null),
      ])
      if (tradeRes?.data && Array.isArray(tradeRes.data)) setTrades(tradeRes.data)
      else if (Array.isArray(tradeRes)) setTrades(tradeRes)
      if (todayRes?.data?.trades) {
        setTodayTrades(todayRes.data.trades)
        setTodayPnlData(todayRes.data.summary)
      }
    } catch {
      setLoading(false)
    }
    setRefreshing(false)
  }, [setAndCacheRunning])

  const controlAgent = useCallback(async (action: 'start' | 'stop') => {
    setControlling(true)
    setAndCacheRunning(action === 'start') // optimistic
    try {
      await fetch('/api/agents/trading', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (action === 'start') {
        // Poll until uvicorn is actually up (up to 10s)
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 500))
          const s = await fetch('/api/agents/trading').then(r => r.json()).catch(() => null)
          if (s?.running) { setAndCacheRunning(true); break }
        }
      } else {
        // For stop: poll until port is clear (up to 5s), then set final state
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
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '.')
      return t.close_time?.slice(0, 10) === today
    }
    return true
  })

  const winRate = summary?.win_rate ?? 0
  const totalPnl = summary?.total_pnl ?? 0
  const todayPnl = summary?.today_pnl ?? 0

  // Dashboard tab
  const dashboard = (
    <div style={{ maxWidth: 900 }}>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
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

        <button onClick={load} disabled={refreshing} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
          borderRadius: 10, border: '1px solid var(--border)', background: 'var(--faint)',
          color: 'var(--muted)', cursor: 'pointer', fontFamily: 'Raleway', fontWeight: 700, fontSize: 12,
        }}>
          <RefreshCw size={13} style={{ animation: refreshing ? 'spin .8s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>Loading trading data…</div>
      ) : !summary ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>No trading data found. Make sure trades.csv exists.</div>
      ) : (
        <>
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
              {summary.symbols.map(sym => (
                <div key={sym} style={{
                  padding: '8px 16px', borderRadius: 10, border: `1px solid ${COLOR}30`,
                  background: `${COLOR}08`, color: COLOR, fontWeight: 800, fontSize: 14, fontFamily: 'Raleway',
                }}>
                  {sym}
                </div>
              ))}
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

  // Trade history tab (in Actions)
  const actions = (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Trade History</h2>
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

      <div style={{ background: 'var(--panel)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '80px 60px 1fr 1fr 1fr 80px',
          gap: 12, padding: '10px 16px', background: 'var(--faint)',
          borderBottom: '1px solid var(--border)',
        }}>
          {['Symbol', 'Type', 'Open', 'Close', 'Volume', 'P&L'].map(h => (
            <span key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: h === 'P&L' ? 'right' : 'left' }}>{h}</span>
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

  // Command center context
  const commandCenter = summary ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[
        { label: 'Agent', value: agentRunning === null ? 'Checking…' : agentRunning ? 'Running' : 'Stopped', color: agentRunning ? '#22c55e' : '#94a3b8' },
        { label: 'Total P&L', value: `$${(summary.total_pnl).toFixed(2)}`, color: summary.total_pnl >= 0 ? '#22c55e' : '#ef4444' },
        { label: 'Win Rate', value: `${summary.win_rate.toFixed(1)}%`, color: summary.win_rate >= 50 ? '#22c55e' : '#ef4444' },
        { label: 'Open', value: `${summary.open_positions} positions`, color: 'var(--text)' },
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
            { label: 'Data source', value: 'trades.csv (MT5 export)', readonly: true },
            { label: 'Risk state', value: 'risk_state.json', readonly: true },
            { label: 'Mode', value: agentRunning === null ? 'Checking…' : agentRunning ? 'Live — receiving EA signals' : 'Stopped — analytics only', readonly: true },
            { label: 'Cascade', value: 'Runs nightly at 21:00 via cron', readonly: true },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--faint)' }}>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato' }}>{s.label}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', fontFamily: 'Lato' }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  // Today tab
  const todayDate = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
  const todayPnlNum = parseFloat(todayPnlData?.pnl ?? '0')
  const today = (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <button onClick={load} disabled={refreshing} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'Raleway', fontWeight: 700, fontSize: 12 }}>
          <RefreshCw size={13} style={{ animation: refreshing ? 'spin .8s linear infinite' : 'none' }} /> Refresh
        </button>
      </div>

      {/* Today summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Today P&L', value: todayPnlData ? `$${todayPnlNum.toFixed(2)}` : '—', positive: todayPnlNum >= 0, icon: DollarSign, large: true },
          { label: 'Trades', value: todayPnlData?.count ?? 0, icon: Activity },
          { label: 'Wins', value: todayPnlData?.wins ?? 0, positive: true, icon: Target },
          { label: 'Losses', value: todayPnlData?.losses ?? 0, positive: false, icon: BarChart3 },
        ].map(s => <StatCard key={s.label} {...s} label={s.label} value={s.value} />)}
      </div>

      {/* Today trades table */}
      <div style={{ background: 'var(--panel)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>
            {todayDate} — {todayTrades.length} trade{todayTrades.length !== 1 ? 's' : ''}
          </h3>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontFamily: 'Lato' }}>Loading…</div>
        ) : todayTrades.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontFamily: 'Lato' }}>
            No trades today yet. Trades appear here once your MT5 EA closes a position.
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '80px 60px 1fr 1fr 1fr 80px', gap: 12, padding: '10px 16px', background: 'var(--faint)', borderBottom: '1px solid var(--border)' }}>
              {['Symbol', 'Type', 'Open', 'Close', 'Volume', 'P&L'].map(h => (
                <span key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: h === 'P&L' ? 'right' : 'left' }}>{h}</span>
              ))}
            </div>
            {todayTrades.map((t, i) => <TradeRow key={i} trade={t} isWin={parseFloat(t.profit) > 0} />)}
          </>
        )}
      </div>
    </div>
  )

  const MOODS = ['😫', '😟', '😐', '🙂', '😊']
  const currentDrawdown = summary ? Math.abs(Math.min(0, summary.total_pnl)) : 0

  const gateModal = showGate && (
    <div onClick={() => setShowGate(false)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(10,20,30,0.65)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(520px,96vw)', background: 'var(--panel)', borderRadius: 20, border: `1px solid ${COLOR}40`, boxShadow: `0 28px 72px rgba(0,0,0,0.4)`, overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ background: `${COLOR}12`, padding: '20px 24px 16px', borderBottom: `1px solid ${COLOR}20` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Shield size={18} color={COLOR} />
            <span style={{ fontFamily: 'Raleway', fontWeight: 900, fontSize: 16, color: 'var(--text)' }}>Pre-Session Checklist</span>
            <button type="button" onClick={() => setShowGate(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', lineHeight: 0, padding: 4 }}><X size={15} /></button>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato' }}>Answer all 5 questions before the session starts. This takes 30 seconds and saves you from emotional trades.</p>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Q1: Mood */}
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

          {/* Q2: Drawdown awareness */}
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

          {/* Q3: Today's plan */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', fontFamily: 'Raleway', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>
              3 · What is your plan for this session?
            </label>
            <textarea value={gatePlan} onChange={e => setGatePlan(e.target.value)} rows={2} placeholder="e.g. XAUUSD trend follow on 1H, wait for London open, no revenge trading…" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--text)', fontFamily: 'Lato', fontSize: 13, outline: 'none', resize: 'none', boxSizing: 'border-box', lineHeight: 1.5 }} />
          </div>

          {/* Q4: Max loss */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', fontFamily: 'Raleway', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>
              4 · Max loss limit for this session ($)
            </label>
            <input type="number" value={gateMaxLoss} onChange={e => setGateMaxLoss(e.target.value)} placeholder="e.g. 50" min="0" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--faint)', color: 'var(--text)', fontFamily: 'Lato', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          </div>

          {/* Q5: News check */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={gateNews} onChange={e => setGateNews(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
              <span style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'Lato' }}>
                <strong>5 ·</strong> I have checked the economic calendar for high-impact news events today
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'Lato' }}>
            {gateComplete ? <span style={{ color: '#22c55e', fontWeight: 700 }}>✓ All checks complete</span> : `${[gateMood > 0, gateDrawdown, gatePlan.trim().length > 0, gateMaxLoss.trim().length > 0, gateNews].filter(Boolean).length} / 5 complete`}
          </div>
          <button
            type="button"
            disabled={!gateComplete || controlling}
            onClick={() => {
              markGatePassed()
              setShowGate(false)
              controlAgent('start')
            }}
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
        tabs={['dashboard', 'today', 'actions', 'chat', 'settings']}
      starters={[
        'How did trading go today?',
        'What is my current win rate?',
        'Show me my recent losing trades',
        'What is my risk state?',
        'Which symbol performed best?',
      ]}
      dashboard={dashboard}
      today={today}
      actions={actions}
      settings={settings}
      commandCenter={commandCenter}
    />
    </>
  )
}
