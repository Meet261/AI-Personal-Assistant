import { NextRequest, NextResponse } from 'next/server'

const AGENT_URL = 'http://localhost:8000/health'

async function isRunning(): Promise<boolean> {
  try {
    const res = await fetch(AGENT_URL, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

export async function GET() {
  return NextResponse.json({ running: await isRunning() })
}

// Delegate start/stop to the canonical launch controller
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body
  if (action !== 'start' && action !== 'stop') {
    return NextResponse.json({ ok: false, message: 'Unknown action' }, { status: 400 })
  }
  const res = await fetch(new URL('/api/agents/launch', req.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent: 'trading', action }),
  })
  return NextResponse.json(await res.json(), { status: res.status })
}
