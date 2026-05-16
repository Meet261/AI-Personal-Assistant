import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { NextRequest, NextResponse } from 'next/server'

const DIST = join(process.cwd(), '..', 'representativeness-and-data-fusion', 'dist')

const ALLOWED = ['pdf-manifest.json', 'seed-data.json']

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params
  if (!ALLOWED.includes(file)) return new NextResponse('Not found', { status: 404 })

  const filePath = join(DIST, file)
  if (!existsSync(filePath)) return new NextResponse('Not found', { status: 404 })

  const content = readFileSync(filePath, 'utf-8')
  return new NextResponse(content, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
  })
}
