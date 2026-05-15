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

    const text = await extractTextFromStoredPdf(paperId)
    if (!text || text.trim().length < 200) {
      return NextResponse.json({ ok: false, message: 'No PDF text found for this paper — upload the PDF first' })
    }

    const result = await digestPaper(paperId, text)
    if (result.ok) {
      // Re-embed with updated summary
      await executeKnowledgeAction('embed_paper', { paper_id: paperId }).catch(() => {})
    }
    return NextResponse.json(result)
  }

  if (action === 'digest_all') {
    // Get all papers without summaries
    const { data: papers } = await supabase
      .from('research_papers')
      .select('id,title')
      .is('summary', null)
      .limit(50)

    if (!papers?.length) return NextResponse.json({ ok: true, message: 'All papers already digested' })

    let digested = 0
    const failed: string[] = []

    for (const paper of papers) {
      const text = await extractTextFromStoredPdf(paper.id)
      if (!text || text.trim().length < 200) { failed.push(paper.title + ' (no PDF)'); continue }

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
