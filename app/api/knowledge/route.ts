import { NextRequest, NextResponse } from 'next/server'
import { executeKnowledgeAction } from '@/agents/specialist/knowledge'

// GET /api/knowledge?action=status
// GET /api/knowledge?action=search_knowledge&query=temporal+networks&top_k=5
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get('action') ?? 'status'
  const query  = req.nextUrl.searchParams.get('query') ?? ''
  const topK   = parseInt(req.nextUrl.searchParams.get('top_k') ?? '5')
  const result = await executeKnowledgeAction(action, { query, top_k: topK })
  return NextResponse.json(result)
}

// POST /api/knowledge  { action, params }
// Actions: search_knowledge, embed_paper, embed_all_papers, embed_highlights, remove_paper, status
export async function POST(req: NextRequest) {
  const { action, params = {} } = await req.json()
  if (!action) return NextResponse.json({ ok: false, message: 'action required' }, { status: 400 })
  const result = await executeKnowledgeAction(action, params)
  return NextResponse.json(result)
}
