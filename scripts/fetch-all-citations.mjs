/**
 * Fetches Semantic Scholar citations for all 34 papers.
 * Run once after S2 rate limit resets (next day).
 * Usage: node scripts/fetch-all-citations.mjs
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dir, '../.env.local')
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const eq = t.indexOf('=')
  if (eq === -1) continue
  const k = t.slice(0, eq).trim()
  let v = t.slice(eq + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!(k in process.env)) process.env[k] = v
}

const APP_URL = 'http://localhost:3000'
const DELAY_MS = 6000  // 6s between calls — well within S2's 100 req/5min free limit

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function getPapers() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/research_papers?select=id,title,s2_paper_id,citations_fetched_at&limit=50`, {
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    }
  })
  return res.json()
}

async function fetchCitations(paperId) {
  const res = await fetch(`${APP_URL}/api/agents/research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'fetch_citations', params: { paper_id: paperId } }),
  })
  return res.json()
}

async function main() {
  console.log('Fetching papers from Supabase...')
  const papers = await getPapers()
  console.log(`Found ${papers.length} papers\n`)

  let success = 0, failed = 0, skipped = 0

  for (let i = 0; i < papers.length; i++) {
    const p = papers[i]
    const prefix = `[${i+1}/${papers.length}] ${p.id}`

    // Skip if already fetched
    if (p.citations_fetched_at) {
      console.log(`${prefix}: SKIP — already fetched at ${p.citations_fetched_at.slice(0,10)}`)
      skipped++
      continue
    }

    process.stdout.write(`${prefix}: fetching...`)
    try {
      const result = await fetchCitations(p.id)
      if (result.ok) {
        console.log(` ✓ ${result.message}`)
        success++
      } else {
        console.log(` ✗ ${result.message}`)
        failed++
      }
    } catch (e) {
      console.log(` ✗ error: ${e.message}`)
      failed++
    }

    // Delay between calls to respect S2 rate limit
    if (i < papers.length - 1) await sleep(DELAY_MS)
  }

  console.log(`\nDone — ${success} fetched, ${skipped} skipped, ${failed} failed`)
  console.log('Run again to retry any failures.')
}

main().catch(console.error)
