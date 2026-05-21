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

async function getProjectPrompt(projectId: string | null): Promise<string | undefined> {
  if (!projectId) return undefined
  const { data } = await supabase
    .from('research_projects')
    .select('digest_prompt')
    .eq('id', projectId)
    .single()
  return data?.digest_prompt ?? undefined
}

// GET /api/agents/paper-digester?project_id=xxx — list undigested papers + active job status
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('project_id')

  let q = supabase.from('research_papers').select('id,title,has_pdf,pdf_url').is('summary', null).limit(20)
  if (projectId) q = q.eq('project_id', projectId)

  const [undigested, activeJob] = await Promise.all([
    q,
    supabase.from('digest_jobs').select('*').in('status', ['pending', 'running']).order('created_at', { ascending: false }).limit(1),
  ])
  return NextResponse.json({
    ok: true,
    message: `${undigested.data?.length || 0} papers without summaries`,
    data: undigested.data,
    activeJob: activeJob.data?.[0] ?? null,
  })
}

// POST /api/agents/paper-digester
export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, message: 'ANTHROPIC_API_KEY not set in .env.local' }, { status: 400 })
  }

  const { action, params = {} } = await req.json()

  // ── digest_one — synchronous, fast ────────────────────────────────────────
  if (action === 'digest_one') {
    const paperId = params.paper_id as string
    if (!paperId) return NextResponse.json({ ok: false, message: 'paper_id required' }, { status: 400 })

    const { data: paper } = await supabase
      .from('research_papers')
      .select('title,authors,year,journal,abstract,notes,project_id')
      .eq('id', paperId)
      .single()
    if (!paper) return NextResponse.json({ ok: false, message: 'Paper not found' })

    let text = await extractTextFromStoredPdf(paperId)
    if (!text || text.trim().length < 200) text = buildTextFromMetadata(paper)
    if (!text || text.trim().length < 50) return NextResponse.json({ ok: false, message: 'Not enough content to digest' })

    const systemPrompt = await getProjectPrompt(paper.project_id ?? null)
    const result = await digestPaper(paperId, text, systemPrompt)
    if (result.ok) await executeKnowledgeAction('embed_paper', { paper_id: paperId }).catch(() => {})
    return NextResponse.json(result)
  }

  // ── digest_all — async with SSE progress stream ───────────────────────────
  if (action === 'digest_all') {
    const force = params.force === true
    const projectId = params.project_id as string | undefined

    // Check if a job is already running for this scope
    let jobCheck = supabase.from('digest_jobs').select('id,status').in('status', ['pending','running'])
    if (projectId) jobCheck = jobCheck.eq('project_id', projectId)
    const { data: existing } = await jobCheck.limit(1)
    if (existing?.length) {
      return NextResponse.json({ ok: false, message: 'A digest job is already running', job_id: existing[0].id })
    }

    // Fetch papers to digest
    let q = supabase.from('research_papers').select('id,title,authors,year,journal,abstract,notes,project_id').limit(100)
    if (!force) q = q.is('summary', null)
    if (projectId) q = q.eq('project_id', projectId)
    const { data: papers } = await q
    if (!papers?.length) return NextResponse.json({ ok: true, message: 'All papers already digested' })

    // Pre-fetch all unique project prompts needed for this batch
    const projectIds = [...new Set(papers.map(p => p.project_id).filter(Boolean))]
    const promptMap: Record<string, string | undefined> = {}
    await Promise.all(projectIds.map(async pid => {
      promptMap[pid] = await getProjectPrompt(pid)
    }))

    // Create job record
    const { data: job } = await supabase.from('digest_jobs').insert({
      status: 'running',
      total_papers: papers.length,
      processed: 0,
      failed: 0,
      force,
      project_id: projectId ?? null,
      started_at: new Date().toISOString(),
    }).select().single()

    if (!job) return NextResponse.json({ ok: false, message: 'Failed to create job' })

    // Return SSE stream — client subscribes for progress
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        function send(data: object) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        let processed = 0
        const failed: string[] = []

        send({ type: 'start', job_id: job.id, total: papers.length })

        for (const paper of papers) {
          await supabase.from('digest_jobs').update({ current_paper: paper.title, processed }).eq('id', job.id)
          send({ type: 'progress', processed, total: papers.length, current: paper.title })

          try {
            let text = await extractTextFromStoredPdf(paper.id)
            if (!text || text.trim().length < 200) text = buildTextFromMetadata(paper)
            if (!text || text.trim().length < 50) { failed.push(paper.title); continue }

            const systemPrompt = paper.project_id ? promptMap[paper.project_id] : undefined
            const result = await digestPaper(paper.id, text, systemPrompt)
            if (result.ok) {
              processed++
              await executeKnowledgeAction('embed_paper', { paper_id: paper.id }).catch(() => {})
              send({ type: 'paper_done', title: paper.title, processed, total: papers.length })
            } else {
              failed.push(paper.title)
              send({ type: 'paper_failed', title: paper.title, reason: result.message })
            }
          } catch (e) {
            failed.push(paper.title)
            send({ type: 'paper_failed', title: paper.title, reason: String(e) })
          }
        }

        await supabase.from('digest_jobs').update({
          status: failed.length === papers.length ? 'failed' : 'done',
          processed,
          failed: failed.length,
          current_paper: null,
          completed_at: new Date().toISOString(),
        }).eq('id', job.id)

        send({ type: 'done', job_id: job.id, processed, total: papers.length, failed })
        controller.close()
      },
    })

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  }

  // ── get_job_status — poll a specific job ──────────────────────────────────
  if (action === 'get_job_status') {
    const jobId = params.job_id as string
    if (!jobId) return NextResponse.json({ ok: false, message: 'job_id required' })
    const { data } = await supabase.from('digest_jobs').select('*').eq('id', jobId).single()
    return NextResponse.json({ ok: true, data })
  }

  // ── cancel_job — mark a job as failed/cancelled ───────────────────────────
  if (action === 'cancel_job') {
    const jobId = params.job_id as string
    if (!jobId) return NextResponse.json({ ok: false, message: 'job_id required' })
    await supabase.from('digest_jobs').update({ status: 'failed', error: 'Cancelled by user', completed_at: new Date().toISOString() }).eq('id', jobId)
    return NextResponse.json({ ok: true, message: 'Job cancelled' })
  }

  // ── save_project_prompt — update a project's digest prompt ────────────────
  if (action === 'save_project_prompt') {
    const projectId = params.project_id as string
    const prompt = params.prompt as string | null
    if (!projectId) return NextResponse.json({ ok: false, message: 'project_id required' })
    const { error } = await supabase
      .from('research_projects')
      .update({ digest_prompt: prompt ?? null, updated_at: new Date().toISOString() })
      .eq('id', projectId)
    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, message: 'Prompt saved' })
  }

  return NextResponse.json({ ok: false, message: 'Unknown action' }, { status: 400 })
}
