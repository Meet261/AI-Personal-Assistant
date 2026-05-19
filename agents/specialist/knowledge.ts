// ─── Knowledge Agent — RAG over papers + notes via ChromaDB ──────────────
// ChromaDB: http://localhost:8001 (chroma run --port 8001 --path .chroma-data)
// Embeddings: nomic-embed-text via Ollama (free, local)

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const CHROMA_URL  = process.env.CHROMA_URL ?? 'http://localhost:8001'
const OLLAMA_URL  = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'
const EMBED_MODEL = 'nomic-embed-text'
const COLLECTION  = 'papers'

// ── Embedding via Ollama nomic-embed-text (B2: try/catch) ────────────────
async function embed(text: string): Promise<number[]> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
    })
    if (!res.ok) throw new Error(`Ollama embed error: ${res.statusText}`)
    const data = await res.json()
    return data.embedding as number[]
  } catch (e) { throw new Error(`embed failed: ${e instanceof Error ? e.message : e}`) }
}

// ── ChromaDB helpers (B2: all wrapped in try/catch) ───────────────────────
async function getOrCreateCollection(): Promise<string> {
  try {
    const getRes = await fetch(`${CHROMA_URL}/api/v2/tenants/default_tenant/databases/default_database/collections/${COLLECTION}`)
    if (getRes.ok) { const col = await getRes.json(); return col.id }
    const createRes = await fetch(`${CHROMA_URL}/api/v2/tenants/default_tenant/databases/default_database/collections`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: COLLECTION, metadata: { 'hnsw:space': 'cosine' } }),
    })
    if (!createRes.ok) throw new Error(`ChromaDB create collection failed: ${await createRes.text()}`)
    const col = await createRes.json(); return col.id
  } catch (e) { throw new Error(`getOrCreateCollection failed: ${e instanceof Error ? e.message : e}`) }
}

async function chromaQuery(collectionId: string, embedding: number[], topK: number) {
  try {
    const res = await fetch(`${CHROMA_URL}/api/v2/tenants/default_tenant/databases/default_database/collections/${collectionId}/query`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query_embeddings: [embedding], n_results: topK, include: ['documents', 'metadatas', 'distances'] }),
    })
    if (!res.ok) throw new Error(`ChromaDB query failed: ${await res.text()}`)
    return res.json()
  } catch (e) { throw new Error(`chromaQuery failed: ${e instanceof Error ? e.message : e}`) }
}

async function chromaUpsert(collectionId: string, ids: string[], embeddings: number[][], documents: string[], metadatas: Record<string, string>[]) {
  try {
    const res = await fetch(`${CHROMA_URL}/api/v2/tenants/default_tenant/databases/default_database/collections/${collectionId}/upsert`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, embeddings, documents, metadatas }),
    })
    if (!res.ok) throw new Error(`ChromaDB upsert failed: ${await res.text()}`)
  } catch (e) { throw new Error(`chromaUpsert failed: ${e instanceof Error ? e.message : e}`) }
}

async function chromaDelete(collectionId: string, ids: string[]) {
  try {
    const res = await fetch(`${CHROMA_URL}/api/v2/tenants/default_tenant/databases/default_database/collections/${collectionId}/delete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    if (!res.ok) throw new Error(`ChromaDB delete failed: ${await res.text()}`)
  } catch (e) { throw new Error(`chromaDelete failed: ${e instanceof Error ? e.message : e}`) }
}

// ── Check ChromaDB is reachable ───────────────────────────────────────────
async function checkChroma(): Promise<boolean> {
  try {
    const res = await fetch(`${CHROMA_URL}/api/v2/heartbeat`, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch { return false }
}

// ── Build document text for a paper ──────────────────────────────────────
function buildPaperDoc(paper: {
  title: string
  authors?: string | null
  abstract?: string | null
  year?: number | null
  tags?: string[] | null
  notes?: string | null
}): string {
  const parts = [`Title: ${paper.title}`]
  if (paper.authors) parts.push(`Authors: ${paper.authors}`)
  if (paper.year) parts.push(`Year: ${paper.year}`)
  if (paper.abstract) parts.push(`Abstract: ${paper.abstract}`)
  if (paper.tags?.length) parts.push(`Tags: ${paper.tags.join(', ')}`)
  if (paper.notes) parts.push(`Notes: ${paper.notes}`)
  return parts.join('\n')
}

// ── Main executor ─────────────────────────────────────────────────────────
export async function executeKnowledgeAction(action: string, params: Record<string, unknown>) {
  try {
    return await _executeKnowledgeAction(action, params)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, message: `Knowledge agent error: ${msg}` }
  }
}

async function _executeKnowledgeAction(action: string, params: Record<string, unknown>) {

  // Always check ChromaDB first
  const chromaUp = await checkChroma()
  if (!chromaUp && action !== 'status') {
    return {
      ok: false,
      message: `ChromaDB is not running. Start it with: chroma run --port 8001 --path .chroma-data`,
    }
  }

  switch (action) {

    case 'status': {
      const up = await checkChroma()
      if (!up) return { ok: false, message: 'ChromaDB offline — run: chroma run --port 8001 --path .chroma-data' }
      const colId = await getOrCreateCollection()
      // Count documents
      const countRes = await fetch(`${CHROMA_URL}/api/v2/tenants/default_tenant/databases/default_database/collections/${colId}/count`)
      const count = countRes.ok ? await countRes.json() : 0
      return { ok: true, message: `ChromaDB online — ${count} documents indexed`, data: { count, collection: COLLECTION } }
    }

    // ── Search: semantic query over all papers ────────────────────────────
    case 'search_knowledge': {
      const query = params.query as string
      const topK  = (params.top_k as number) ?? 5
      if (!query) return { ok: false, message: 'query param required' }

      // ── 1. Vector search via ChromaDB ─────────────────────────────────────
      const colId = await getOrCreateCollection()
      const queryEmbed = await embed(query)
      const vectorResult = await chromaQuery(colId, queryEmbed, topK * 2)

      const vectorHits: Map<string, { title: string; authors: string; year: string; snippet: string; vectorRank: number }> = new Map()
      const docs = vectorResult.documents?.[0] ?? []
      const metas = vectorResult.metadatas?.[0] ?? []
      docs.forEach((text: string, i: number) => {
        const meta = metas[i] ?? {}
        const pid = meta.paper_id ?? `v${i}`
        vectorHits.set(pid, {
          title: meta.title ?? 'Unknown',
          authors: meta.authors ?? '',
          year: meta.year ?? '',
          snippet: (text ?? '').slice(0, 300),
          vectorRank: i + 1,
        })
      })

      // ── 2. Keyword search via Supabase (FTS if index exists, ilike fallback) ─
      const keywordHits: Map<string, { title: string; authors: string; year: string; keywordRank: number }> = new Map()
      try {
        // Try full-text search first (requires migration 005_fts_index.sql to be applied)
        const { data: ftsData, error: ftsError } = await supabase
          .from('research_papers')
          .select('id,title,authors,year')
          .textSearch('fts', query, { type: 'websearch', config: 'english' })
          .limit(topK * 2)

        if (!ftsError && ftsData?.length) {
          ftsData.forEach((p, i) => {
            keywordHits.set(p.id, { title: p.title, authors: p.authors ?? '', year: String(p.year ?? ''), keywordRank: i + 1 })
          })
        } else {
          // Fallback: ilike multi-term search across title + authors + tags
          const terms = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 4)
          const { data: ilikeData } = await supabase
            .from('research_papers')
            .select('id,title,authors,year,tags,abstract')
            .limit(100)

          type PaperRow = { id: string; title: string; authors: string; year: number; tags: string[]; abstract: string | null }
          const scored = (ilikeData as PaperRow[] ?? []).map(p => {
            const text = `${p.title} ${p.authors} ${(p.tags ?? []).join(' ')} ${p.abstract ?? ''}`.toLowerCase()
            const score = terms.reduce((s, t) => s + (text.split(t).length - 1), 0)
            return { ...p, score }
          }).filter(p => p.score > 0).sort((a, b) => b.score - a.score).slice(0, topK * 2)

          scored.forEach((p, i) => {
            keywordHits.set(p.id, { title: p.title, authors: p.authors ?? '', year: String(p.year ?? ''), keywordRank: i + 1 })
          })
        }
      } catch { /* keyword search optional — vector search is sufficient fallback */ }

      // ── 3. Reciprocal Rank Fusion (RRF) ───────────────────────────────────
      // RRF score = 1/(k+rank_vector) + 1/(k+rank_keyword) where k=60
      const K = 60
      const allIds = new Set([...vectorHits.keys(), ...keywordHits.keys()])
      const merged: { id: string; rrfScore: number; title: string; authors: string; year: string; snippet: string }[] = []

      for (const id of allIds) {
        const v = vectorHits.get(id)
        const kw = keywordHits.get(id)
        const vScore = v ? 1 / (K + v.vectorRank) : 0
        const kwScore = kw ? 1 / (K + kw.keywordRank) : 0
        merged.push({
          id,
          rrfScore: vScore + kwScore,
          title: v?.title ?? kw?.title ?? 'Unknown',
          authors: v?.authors ?? kw?.authors ?? '',
          year: v?.year ?? kw?.year ?? '',
          snippet: v?.snippet ?? '',
        })
      }

      merged.sort((a, b) => b.rrfScore - a.rrfScore)
      const top = merged.slice(0, topK)

      return {
        ok: true,
        message: `${top.length} results for: "${query}" (hybrid: vector + keyword)`,
        data: top.map((d, i) => ({
          title:    d.title,
          authors:  d.authors,
          year:     d.year,
          paper_id: d.id,
          snippet:  d.snippet,
          score:    Math.round((1 - i / top.length) * 100), // normalized rank score
        })),
      }
    }

    // ── Embed a single paper (by Supabase paper ID) ───────────────────────
    case 'embed_paper': {
      const paperId = params.paper_id as string
      if (!paperId) return { ok: false, message: 'paper_id required' }

      const { data: paper, error } = await supabase
        .from('research_papers')
        .select('id,title,authors,abstract,year,tags,notes')
        .eq('id', paperId)
        .single()

      if (error || !paper) return { ok: false, message: `Paper not found: ${paperId}` }

      const colId    = await getOrCreateCollection()
      const docText  = buildPaperDoc(paper)
      const embedding = await embed(docText)

      await chromaUpsert(
        colId,
        [paper.id],
        [embedding],
        [docText],
        [{ paper_id: paper.id, title: paper.title, authors: paper.authors ?? '', year: String(paper.year ?? '') }]
      )

      return { ok: true, message: `Embedded: "${paper.title}"` }
    }

    // ── Embed all papers (bulk index / re-index) ──────────────────────────
    case 'embed_all_papers': {
      const { data: papers, error } = await supabase
        .from('research_papers')
        .select('id,title,authors,abstract,year,tags,notes')
        .order('created_at', { ascending: false })

      if (error || !papers?.length) return { ok: false, message: 'No papers found in Supabase' }

      const colId = await getOrCreateCollection()
      let indexed = 0
      const failed: string[] = []

      // Embed in batches of 10 to avoid overwhelming Ollama
      for (let i = 0; i < papers.length; i += 10) {
        const batch = papers.slice(i, i + 10)
        const results = await Promise.allSettled(batch.map(async paper => {
          const docText  = buildPaperDoc(paper)
          const embedding = await embed(docText)
          await chromaUpsert(
            colId,
            [paper.id],
            [embedding],
            [docText],
            [{ paper_id: paper.id, title: paper.title, authors: paper.authors ?? '', year: String(paper.year ?? '') }]
          )
          return paper.title
        }))
        for (let j = 0; j < results.length; j++) {
          if (results[j].status === 'fulfilled') indexed++
          else failed.push(batch[j].title)
        }
      }

      return {
        ok: true,
        message: `Indexed ${indexed}/${papers.length} papers${failed.length ? ` (${failed.length} failed)` : ''}`,
        data: { indexed, total: papers.length, failed },
      }
    }

    // ── Embed paper highlights (supplements abstract) ─────────────────────
    case 'embed_highlights': {
      const paperId = params.paper_id as string
      if (!paperId) return { ok: false, message: 'paper_id required' }

      const [{ data: paper }, { data: highlights }] = await Promise.all([
        supabase.from('research_papers').select('id,title,authors,year').eq('id', paperId).single(),
        supabase.from('research_highlights').select('selected_text,page_number').eq('paper_id', paperId),
      ])

      if (!paper) return { ok: false, message: 'Paper not found' }
      if (!highlights?.length) return { ok: true, message: 'No highlights to embed' }

      const colId = await getOrCreateCollection()
      let indexed = 0

      for (const hl of highlights) {
        const id = `hl_${paper.id}_${hl.page_number ?? indexed}`
        const docText = `Highlight from "${paper.title}" (${paper.authors ?? ''}, ${paper.year ?? ''}):\n${hl.selected_text}`
        const embedding = await embed(docText)
        await chromaUpsert(
          colId,
          [id],
          [embedding],
          [docText],
          [{ paper_id: paper.id, title: paper.title, authors: paper.authors ?? '', year: String(paper.year ?? ''), type: 'highlight' }]
        )
        indexed++
      }

      return { ok: true, message: `Embedded ${indexed} highlights for "${paper.title}"` }
    }

    // ── Remove a paper from the index ─────────────────────────────────────
    case 'remove_paper': {
      const paperId = params.paper_id as string
      if (!paperId) return { ok: false, message: 'paper_id required' }
      const colId = await getOrCreateCollection()
      // Delete paper doc + all its highlights
      await chromaDelete(colId, [paperId])
      // Highlights have ids like hl_<paperId>_<page> — fetch and delete
      const countRes = await fetch(`${CHROMA_URL}/api/v2/tenants/default_tenant/databases/default_database/collections/${colId}/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ where: { paper_id: paperId }, include: [] }),
      })
      if (countRes.ok) {
        const existing = await countRes.json()
        if (existing.ids?.length) await chromaDelete(colId, existing.ids)
      }
      return { ok: true, message: `Removed paper ${paperId} from knowledge index` }
    }

    default:
      return { ok: false, message: `Unknown knowledge action: ${action}` }
  }
}
