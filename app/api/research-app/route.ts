import { readFileSync } from 'fs'
import { join } from 'path'
import { NextResponse } from 'next/server'
import { isResearchEnabled } from '@/lib/research-state'

const DIST = join(process.cwd(), '..', 'representativeness-and-data-fusion', 'dist')

export async function GET() {
  if (!isResearchEnabled()) {
    return new NextResponse(
      `<!doctype html><html><body style="font-family:sans-serif;padding:40px;background:#0f172a;color:#94a3b8">
        <h2 style="color:#e2e8f0">Research Assistant &mdash; Stopped</h2>
        <p>Start it again from <a href="http://localhost:3000/agents" style="color:#2dd4bf">Agents Hub</a>.</p>
      </body></html>`,
      { status: 503, headers: { 'Content-Type': 'text/html' } }
    )
  }

  try {
    let html = readFileSync(join(DIST, 'index.html'), 'utf-8')
    html = html
      .replace(/(['"`])(\/papers\/)/g, '$1/api/research-app/papers/')
      .replace(/(['"`])(\/pdf-manifest\.json)/g, '$1/api/research-app/static/pdf-manifest.json')
      .replace(/(['"`])(\/seed-data\.json)/g, '$1/api/research-app/static/seed-data.json')
      .replace(/`\/papers\//g, '`/api/research-app/papers/')

    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' },
    })
  } catch {
    return new NextResponse(
      `<!doctype html><html><body style="font-family:sans-serif;padding:40px">
        <h2>Research app not built</h2>
        <p>Go to <a href="/agents">Agents Hub</a> and click <strong>Rebuild</strong>.</p>
      </body></html>`,
      { status: 404, headers: { 'Content-Type': 'text/html' } }
    )
  }
}
