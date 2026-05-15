import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { digestPaper } from '@/agents/specialist/paper-digester'
import { executeKnowledgeAction } from '@/agents/specialist/knowledge'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

async function extractTextFromStoredPdf(paperId: string): Promise<string> {
  try {
    const path = `research-pdfs/${paperId}.pdf`
    const { data, error } = await supabase.storage.from('research-pdfs').download(path)
    if (error || !data) return ''
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
    const buffer = Buffer.from(await data.arrayBuffer())
    const result = await pdfParse(buffer)
    return result.text ?? ''
  } catch { return '' }
}

// Build digest text from paper metadata when no PDF is available
function buildTextFromMetadata(paper: Record<string, string | number | null | undefined>): string {
  return [
    `Title: ${paper.title}`,
    `Authors: ${paper.authors}`,
    paper.year ? `Year: ${paper.year}` : '',
    paper.journal ? `Journal: ${paper.journal}` : '',
    paper.abstract ? `Abstract: ${paper.abstract}` : '',
    paper.notes ? `Notes: ${String(paper.notes).slice(0, 1000)}` : '',
  ].filter(Boolean).join('\n\n')
}

// GET /api/agents/paper-digester — list undigested papers
export async function GET() {
  const { data } = await supabase
    .from('research_papers')
    .select('id,title,has_pdf,pdf_url')
    .is('summary', null)
    .limit(20)
  return NextResponse.json({ ok: true, message: `${data?.length || 0} papers without summaries`, data })
}

// POST /api/agents/paper-digester
// { action: 'digest_one', params: { paper_id } }
// { action: 'digest_all' }  — bulk digest all undigested papers that have PDFs
export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, message: 'ANTHROPIC_API_KEY not set in .env.local' }, { status: 400 })
  }

  const { action, params = {} } = await req.json()

  if (action === 'digest_one') {
    const paperId = params.paper_id as string
    if (!paperId) return NextResponse.json({ ok: false, message: 'paper_id required' }, { status: 400 })

    // Try PDF first, fall back to metadata
    let text = await extractTextFromStoredPdf(paperId)
    if (!text || text.trim().length < 200) {
      const { data: paper } = await supabase
        .from('research_papers')
        .select('title,authors,year,journal,abstract,notes')
        .eq('id', paperId).single()
      if (!paper) return NextResponse.json({ ok: false, message: 'Paper not found' })
      text = buildTextFromMetadata(paper)
    }
    if (!text || text.trim().length < 50) {
      return NextResponse.json({ ok: false, message: 'Not enough paper content to digest' })
    }

    const result = await digestPaper(paperId, text)
    if (result.ok) await executeKnowledgeAction('embed_paper', { paper_id: paperId }).catch(() => {})
    return NextResponse.json(result)
  }

  if (action === 'digest_all') {
    const force = params.force === true
    // Fetch all paper metadata in one shot
    let q = supabase.from('research_papers')
      .select('id,title,authors,year,journal,abstract,notes')
      .limit(50)
    if (!force) q = q.is('summary', null)
    const { data: papers } = await q

    if (!papers?.length) return NextResponse.json({ ok: true, message: 'All papers already digested' })

    let digested = 0
    const failed: string[] = []

    for (const paper of papers) {
      // Try PDF first, fall back to metadata
      let text = await extractTextFromStoredPdf(paper.id)
      if (!text || text.trim().length < 200) text = buildTextFromMetadata(paper)
      if (!text || text.trim().length < 50) { failed.push(paper.title + ' (no content)'); continue }

      const result = await digestPaper(paper.id, text)
      if (result.ok) {
        digested++
        await executeKnowledgeAction('embed_paper', { paper_id: paper.id }).catch(() => {})
      } else {
        failed.push(paper.title)
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Digested ${digested}/${papers.length} papers`,
      data: { digested, total: papers.length, failed },
    })
  }

  return NextResponse.json({ ok: false, message: 'action must be digest_one or digest_all' }, { status: 400 })
}
