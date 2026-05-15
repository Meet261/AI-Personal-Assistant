import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { digestPaper } from '@/agents/specialist/paper-digester'
import { executeKnowledgeAction } from '@/agents/specialist/knowledge'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// Extract text from PDF buffer using pdf-parse
async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
    const result = await pdfParse(buffer)
    return result.text ?? ''
  } catch {
    return ''
  }
}

// Auto-digest pipeline: extract text → Haiku digest → embed in ChromaDB
async function autoDigest(paperId: string, buffer: Buffer): Promise<void> {
  // 1. Check if ANTHROPIC_API_KEY is set — skip silently if not
  if (!process.env.ANTHROPIC_API_KEY) return

  // 2. Extract text from PDF
  const text = await extractPdfText(buffer)
  if (!text || text.trim().length < 200) return // too short to be useful

  // 3. Digest with Haiku
  const result = await digestPaper(paperId, text)
  if (!result.ok) return

  // 4. Re-embed paper in ChromaDB now that it has a summary
  await executeKnowledgeAction('embed_paper', { paper_id: paperId }).catch(() => {})
}

// Upload a PDF blob to Supabase Storage, return its public URL
export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const paperId = formData.get('paperId') as string | null

  if (!file || !paperId) {
    return NextResponse.json({ error: 'Missing file or paperId' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const path = `research-pdfs/${paperId}.pdf`

  const { error } = await supabase.storage
    .from('research-pdfs')
    .upload(path, buffer, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage
    .from('research-pdfs')
    .getPublicUrl(path)

  // Auto-digest in background — don't block the upload response
  autoDigest(paperId, buffer).catch(() => {})

  return NextResponse.json({ url: publicUrl, digest_triggered: !!process.env.ANTHROPIC_API_KEY })
}

// Get a signed URL for a PDF (for private buckets)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const paperId = searchParams.get('paper_id')
  if (!paperId) return NextResponse.json({ error: 'Missing paper_id' }, { status: 400 })

  const path = `research-pdfs/${paperId}.pdf`
  const { data, error } = await supabase.storage
    .from('research-pdfs')
    .createSignedUrl(path, 3600)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ url: data.signedUrl })
}
