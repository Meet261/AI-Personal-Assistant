import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const res = await fetch('http://localhost:8000/reconcile_trades', { method: 'POST' })
    if (!res.ok) return NextResponse.json({ error: `Trading server returned ${res.status}` }, { status: 502 })
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Trading agent not reachable' }, { status: 503 })
  }
}
