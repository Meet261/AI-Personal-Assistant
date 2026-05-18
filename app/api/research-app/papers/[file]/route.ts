// Serves PDF files from the research app's dist/papers/ directory
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { NextRequest, NextResponse } from 'next/server'

const PAPERS_DIR = join(process.cwd(), '..', 'representativeness-and-data-fusion', 'dist', 'papers')

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params
  // Reject any path containing .. to prevent directory traversal
  if (file.includes('..') || file.includes('/') || file.includes('\\')) {
    return new NextResponse('Invalid filename', { status: 400 })
  }
  const safe = file.replace(/[^a-zA-Z0-9.\-_ ()']/g, '')
  const filePath = join(PAPERS_DIR, safe)
  // Double-check resolved path stays inside PAPERS_DIR
  if (!filePath.startsWith(PAPERS_DIR)) {
    return new NextResponse('Invalid filename', { status: 400 })
  }

  if (!existsSync(filePath)) {
    return new NextResponse('PDF not found', { status: 404 })
  }

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
