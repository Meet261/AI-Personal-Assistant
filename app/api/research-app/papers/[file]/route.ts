// Serves PDF files — checks local dist/papers/ first, then falls back to Supabase storage.
// This handles both original bundled PDFs (33 files in dist) and newer papers uploaded
// via the digester (stored in Supabase as research-pdfs/{paperId}.pdf).
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const PAPERS_DIR = join(process.cwd(), '..', 'representativeness-and-data-fusion', 'dist', 'papers')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params
  if (file.includes('..') || file.includes('/') || file.includes('\\')) {
    return new NextResponse('Invalid filename', { status: 400 })
  }
  const safe = file.replace(/[^a-zA-Z0-9.\-_ ()']/g, '')
  const filePath = join(PAPERS_DIR, safe)
  if (!filePath.startsWith(PAPERS_DIR)) {
    return new NextResponse('Invalid filename', { status: 400 })
  }

  // ── 1. Try local dist/papers/ ─────────────────────────────────────────────
  if (existsSync(filePath)) {
    try {
      const buf = readFileSync(filePath)
      return new NextResponse(buf, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${safe}"`,
          'Cache-Control': 'public, max-age=86400',
        },
      })
    } catch {
      return new NextResponse('Failed to read PDF', { status: 500 })
    }
  }

  // ── 2. Fall back to Supabase storage (research-pdfs/{paperId}.pdf) ────────
  // The file parameter is the paper ID (e.g. "kazemi2020") — try with .pdf extension
  const paperId = safe.replace(/\.pdf$/i, '')
  const storagePath = `research-pdfs/${paperId}.pdf`

  try {
    const { data, error } = await supabase.storage
      .from('research-pdfs')
      .download(storagePath)

    if (error || !data) {
      return new NextResponse('PDF not found', { status: 404 })
    }

    const arrayBuf = await data.arrayBuffer()
    return new NextResponse(arrayBuf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${paperId}.pdf"`,
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch {
    return new NextResponse('PDF not found', { status: 404 })
  }
}
