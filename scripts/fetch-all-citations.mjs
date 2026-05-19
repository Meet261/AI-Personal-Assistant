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

// Known DOI/arXiv identifiers — pre-seeded to bypass title search for hard-to-find papers
// S2 resolves these directly without hitting the search rate limit
const KNOWN_S2_IDENTIFIERS = {
  'holme2012':            'DOI:10.1016/j.physrep.2012.03.001',
  'scheffer2009':         'DOI:10.1038/nature08227',
  'kipf2017':             'arXiv:1609.02907',
  'kwak2010':             'DOI:10.1145/1772690.1772751',
  'romero2011':           'DOI:10.1145/1963405.1963503',
  'narayanan2008':        'DOI:10.1109/SP.2008.33',
  'arenas2008':           'DOI:10.1016/j.physrep.2008.09.002',
  'kazemi2020':           'arXiv:2005.07496',
  'dorogovtsev2008':      'DOI:10.1103/RevModPhys.80.1275',
  'ferrara2016':          'DOI:10.1145/2818717',
  'callaway2000':         'DOI:10.1103/PhysRevLett.85.5468',
  'baumgartner2020':      'arXiv:2001.08435',
  'milo2002':             'DOI:10.1126/science.298.5594.824',
  'boyd2012':             'DOI:10.1080/1461670X.2012.664893',
  'vannes2007':           'DOI:10.1073/pnas.0700657104',
  'mp779jlta7y7fdwvmjf':  'arXiv:2006.10637',
  'vaswani2017attention': 'arXiv:1706.03762',
  'grover2016node2vec':   'arXiv:1607.00653',
  'nguyen2018ctdne':      'DOI:10.1145/3184558.3191526',
  'velickovic2018gat':    'arXiv:1710.10903',
  'hamilton2017graphsage':'arXiv:1706.02216',
}

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

async function seedS2Id(paperId, identifier) {
  // Pre-store the known S2 identifier so fetch_citations skips the search step
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/research_papers?id=eq.${paperId}`, {
    method: 'PATCH',
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ s2_paper_id: identifier }),
  })
  return res.ok
}

async function fetchCitations(paperId) {
  // Pre-seed known identifier so the API skips unreliable title search
  const knownId = KNOWN_S2_IDENTIFIERS[paperId]
  if (knownId) await seedS2Id(paperId, knownId)

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
