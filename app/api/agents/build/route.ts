// Triggers a production build of the research app
import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { join } from 'path'

const RESEARCH_DIR = join(process.cwd(), '..', 'representativeness-and-data-fusion')

let building = false

export async function GET() {
  return NextResponse.json({ building })
}

export async function POST(req: NextRequest) {
  const { agent } = await req.json()
  if (agent !== 'research') {
    return NextResponse.json({ error: 'Only research app supports build' }, { status: 400 })
  }
  if (building) {
    return NextResponse.json({ ok: false, message: 'Build already in progress' })
  }

  building = true
  exec(
    'npm run build',
    { cwd: RESEARCH_DIR, timeout: 120_000 },
    (err, stdout, stderr) => {
      building = false
      if (err) console.error('[research build]', stderr)
      else console.log('[research build] done')
    }
  )

  return NextResponse.json({ ok: true, message: 'Build started — takes ~15 seconds' })
}
