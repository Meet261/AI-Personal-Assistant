// ─── Paper Digester — Claude Haiku for deep PDF comprehension ─────────────
// Cost: ~$0.004 per paper (15k tokens avg). Budget: $3-5/month = 750-1250 papers.
import { createClient } from '@supabase/supabase-js'
import { callHaiku } from '../shared/models'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const DIGEST_SYSTEM = `You are an expert academic paper summarizer. Given paper content, extract:
1. A concise summary (2-3 sentences) explaining the key contribution
2. Key findings (3-5 bullet points)
3. Methodology (1 sentence)
4. Relevance to: temporal networks, critical transitions, early warning signals, machine learning on graphs
5. Dissertation relevance score 1-5

Respond in this exact JSON format:
{
  "summary": "...",
  "key_findings": ["...", "..."],
  "methodology": "...",
  "relevance_note": "...",
  "dissertation_relevance": 4
}`

export async function digestPaper(paperId: string, paperText: string): Promise<{
  ok: boolean
  summary?: string
  message: string
}> {
  try {
    const raw = await callHaiku(
      [{ role: 'user', content: `Please analyze this academic paper:\n\n${paperText.slice(0, 12000)}` }],
      DIGEST_SYSTEM
    )

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in Haiku response')
    const parsed = JSON.parse(jsonMatch[0])

    // Save to Supabase
    await supabase.from('research_papers').update({
      summary: parsed.summary,
      notes: `Key findings:\n${parsed.key_findings?.map((f: string) => `• ${f}`).join('\n')}\n\nMethodology: ${parsed.methodology}\n\nRelevance: ${parsed.relevance_note}`,
      dissertation_relevance: parsed.dissertation_relevance,
      updated_at: new Date().toISOString(),
    }).eq('id', paperId)

    // Log token usage for budget tracking
    await supabase.from('agent_token_usage').insert({
      agent_id: 'paper-digester',
      model: 'claude-haiku-4-5-20251001',
      input_tokens: Math.round(paperText.slice(0, 12000).length / 4),
      output_tokens: Math.round(raw.length / 4),
      cost_usd: (Math.round(paperText.slice(0, 12000).length / 4) / 1_000_000) * 0.25 + (Math.round(raw.length / 4) / 1_000_000) * 1.25,
    }).then(() => {})

    return { ok: true, summary: parsed.summary, message: `Paper "${paperId}" digested successfully` }
  } catch (e) {
    return { ok: false, message: `Digest failed: ${String(e)}` }
  }
}

export async function executeDigesterAction(action: string, params: Record<string, unknown>) {
  switch (action) {
    case 'digest_paper': {
      const paperId = params.paper_id as string
      const text = params.text as string
      if (!paperId || !text) return { ok: false, message: 'paper_id and text required' }
      return digestPaper(paperId, text)
    }
    case 'get_undigested': {
      // Papers with no summary yet
      const { data } = await supabase.from('research_papers')
        .select('id,title,has_pdf').is('summary', null).limit(10)
      return { ok: true, message: `${data?.length || 0} papers without summaries`, data }
    }
    default:
      return { ok: false, message: `Unknown action: ${action}` }
  }
}
