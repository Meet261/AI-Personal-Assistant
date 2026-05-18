// Accept a CSV export from MT5 History tab and merge into trades.csv
import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const TRADES_CSV = join(process.cwd(), '..', 'Trading Agent', 'trading_agent', 'logs', 'trades.csv')
const HEADER = 'signal_id,order_ticket,position_id,deal_id,close_time,open_time,symbol,action,entry_price,exit_price,lots,profit,magic,close_reason,fees,slippage'

// Normalise broker-specific symbol names to canonical form
function normalizeSymbol(s: string): string {
  const u = s.toUpperCase().replace(/\.(PRO|ECN|RAW|STP|M|C)$/i, '')
  if (u === 'GOLD' || u === 'XAUUSD') return 'XAUUSD'
  if (u === 'SILVER' || u === 'XAGUSD') return 'XAGUSD'
  return u
}

// Canonical dedup key — uses trade data only, never ticket (ticket can be 0 or differ across imports for same trade)
function tradeKey(symbol: string, openTime: string, closeTime: string, profit: number, lots: number): string {
  return `${normalizeSymbol(symbol)}|${openTime}|${closeTime}|${profit.toFixed(2)}|${lots.toFixed(2)}`
}

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

  const text = await file.text()
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  // Load existing rows and build fingerprint set
  const existing = new Set<string>()
  let existingContent = HEADER + '\n'
  if (existsSync(TRADES_CSV)) {
    existingContent = readFileSync(TRADES_CSV, 'utf-8')
    for (const line of existingContent.split('\n').slice(1)) {
      if (!line.trim()) continue
      const cols = line.split(',')
      // cols: signal_id(0),order_ticket(1),position_id(2),deal_id(3),close_time(4),open_time(5),symbol(6),action(7),entry_price(8),exit_price(9),lots(10),profit(11)
      const symbol = cols[6]?.trim() ?? ''
      const openTime = cols[5]?.trim() ?? ''
      const closeTime = cols[4]?.trim() ?? ''
      const profit = parseFloat(cols[11] ?? '0')
      const lots = parseFloat(cols[10] ?? '0')
      if (symbol && openTime && closeTime) {
        existing.add(tradeKey(symbol, openTime, closeTime, profit, lots))
      }
    }
  }

  let added = 0
  const newRows: string[] = []

  const header = lines[0]?.toLowerCase() ?? ''
  const isTicketFormat = header.includes('ticket')

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t').length > 3
      ? lines[i].split('\t')
      : lines[i].split(',')

    if (cols.length < 8) continue

    let ticket = '', openTime = '', closeTime = '', symbol = '', action = ''
    let entryPrice = 0, exitPrice = 0, lots = 0, profit = 0

    if (isTicketFormat) {
      ticket    = cols[0]?.trim() ?? ''
      openTime  = cols[1]?.trim() ?? ''
      action    = (cols[2]?.trim() ?? '').toUpperCase()
      lots      = parseFloat(cols[3]) || 0
      symbol    = cols[4]?.trim() ?? ''
      entryPrice = parseFloat(cols[5]) || 0
      closeTime = cols[8]?.trim() ?? ''
      exitPrice = parseFloat(cols[9]) || 0
      profit    = parseFloat(cols[10]) || 0
    } else {
      openTime  = cols[0]?.trim() ?? ''
      symbol    = cols[1]?.trim() ?? ''
      action    = (cols[2]?.trim() ?? '').toUpperCase()
      lots      = parseFloat(cols[3]) || 0
      entryPrice = parseFloat(cols[4]) || 0
      closeTime = cols[7]?.trim() ?? ''
      exitPrice = parseFloat(cols[8]) || 0
      profit    = parseFloat(cols[9]) || 0
      ticket    = cols[11]?.trim() ?? ''
    }

    if (!symbol || !action || !entryPrice || !closeTime || !openTime) continue

    const normSymbol = normalizeSymbol(symbol)
    const key = tradeKey(symbol, openTime, closeTime, profit, lots)
    if (existing.has(key)) continue

    existing.add(key)
    const closeReason = profit > 0 ? 'tp' : profit < 0 ? 'sl' : 'manual'
    newRows.push(`,${ticket},0,0,${closeTime},${openTime},${normSymbol},${action},${entryPrice},${exitPrice},${lots},${profit},20260508,${closeReason},0.0,0.0`)
    added++
  }

  if (added > 0) {
    writeFileSync(TRADES_CSV, existingContent.trimEnd() + '\n' + newRows.join('\n') + '\n', 'utf-8')
  }

  return NextResponse.json({ ok: true, added, message: `Added ${added} new trades` })
}
