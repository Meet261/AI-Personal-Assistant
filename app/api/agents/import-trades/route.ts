// Accept a CSV export from MT5 History tab and merge into trades.csv
import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const TRADES_CSV = join(process.cwd(), '..', 'Trading Agent', 'trading_agent', 'logs', 'trades.csv')
const HEADER = 'signal_id,order_ticket,position_id,deal_id,close_time,open_time,symbol,action,entry_price,exit_price,lots,profit,magic,close_reason,fees,slippage'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

  const text = await file.text()
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  // Load existing tickets to avoid duplicates
  const existing = new Set<string>()
  let existingContent = HEADER + '\n'
  if (existsSync(TRADES_CSV)) {
    existingContent = readFileSync(TRADES_CSV, 'utf-8')
    for (const line of existingContent.split('\n').slice(1)) {
      const cols = line.split(',')
      if (cols[1]) existing.add(cols[1].trim())  // order_ticket
    }
  }

  // Parse MT5 history CSV — MT5 exports vary but common format:
  // Time,Symbol,Type,Volume,Price,S/L,T/P,Time(close),Price(close),Profit,Change
  // or: Ticket,Open Time,Type,Volume,Symbol,Price,S/L,T/P,Close Time,Close Price,Profit,Comment
  let added = 0
  const newRows: string[] = []

  // Detect format from header
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
      // Format: Ticket, Open Time, Type, Size, Symbol, Price, S/L, T/P, Close Time, Close Price, Profit
      ticket = cols[0]?.trim() ?? ''
      openTime = cols[1]?.trim() ?? ''
      action = (cols[2]?.trim() ?? '').toUpperCase()
      lots = parseFloat(cols[3]) || 0
      symbol = cols[4]?.trim() ?? ''
      entryPrice = parseFloat(cols[5]) || 0
      closeTime = cols[8]?.trim() ?? ''
      exitPrice = parseFloat(cols[9]) || 0
      profit = parseFloat(cols[10]) || 0
    } else {
      // Format: Time(open), Symbol, Type, Volume, Price(open), S/L, T/P, Time(close), Price(close), Profit
      openTime = cols[0]?.trim() ?? ''
      symbol = cols[1]?.trim() ?? ''
      action = (cols[2]?.trim() ?? '').toUpperCase()
      lots = parseFloat(cols[3]) || 0
      entryPrice = parseFloat(cols[4]) || 0
      closeTime = cols[7]?.trim() ?? ''
      exitPrice = parseFloat(cols[8]) || 0
      profit = parseFloat(cols[9]) || 0
      ticket = cols[11]?.trim() || ''
    }

    if (!symbol || !action || !entryPrice) continue
    // Deterministic dedup key: if no ticket, derive from trade fingerprint so re-imports don't skip real trades
    const dedupeKey = ticket || `${symbol}|${openTime}|${closeTime}|${profit}|${lots}`
    if (existing.has(dedupeKey)) continue

    const closeReason = profit > 0 ? 'tp' : profit < 0 ? 'sl' : 'manual'
    const row = `,${ticket},0,0,${closeTime},${openTime},${symbol},${action},${entryPrice},${exitPrice},${lots},${profit},20260508,${closeReason},0.0,0.0`
    newRows.push(row)
    existing.add(dedupeKey)
    added++
  }

  if (added > 0) {
    const updated = existingContent.trimEnd() + '\n' + newRows.join('\n') + '\n'
    writeFileSync(TRADES_CSV, updated, 'utf-8')
  }

  return NextResponse.json({ ok: true, added, message: `Added ${added} new trades from MT5 export` })
}
