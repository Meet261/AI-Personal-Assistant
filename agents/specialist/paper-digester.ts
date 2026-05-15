// ─── Paper Digester — Claude Haiku for deep PDF comprehension ─────────────
// Cost: ~$0.004 per paper (15k tokens avg). Budget: $3-5/month = 750-1250 papers.
import { createClient } from '@supabase/supabase-js'
import { callHaiku } from '../shared/models'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const DIGEST_SYSTEM = `You are an expert academic paper summarizer specializing in temporal networks, graph machine learning, critical transitions, and early warning signals.

Given a paper, extract ALL of the following. Respond ONLY in this exact JSON format:
{
  "summary": "2-3 sentence plain-language summary of the core contribution",
  "key_findings": ["finding 1", "finding 2", "finding 3", "finding 4"],
  "methodology": "1 sentence describing the research design and approach",
  "relevance_note": "1-2 sentences on relevance to temporal networks / critical transitions / early warning signals / graph ML",
  "dissertation_relevance": 4,
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "category": "one of: Temporal Networks | Graph ML | Critical Transitions | Early Warning Signals | Data Fusion | Representativeness | Methodology | Other",
  "themes": ["theme1", "theme2", "theme3"]
}

Rules:
- tags: 5-8 short lowercase keywords specific to this paper (e.g. "link prediction", "rolling window", "bifurcation")
- category: pick the SINGLE best fit from the fixed list above
- themes: 2-4 broader research themes this paper touches (e.g. "network dynamics", "anomaly detection")
- dissertation_relevance: 1-5 score for relevance to a dissertation on representativeness and data fusion in temporal networks
- Never return null fields — use empty array [] if truly nothing fits`

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

    // Save to Supabase — all Haiku-extracted fields
    await supabase.from('research_papers').update({
      summary:                parsed.summary,
      dissertation_relevance: parsed.dissertation_relevance,
      tags:                   parsed.tags ?? [],
      notes:                  [
        `**Key Findings:**\n${(parsed.key_findings ?? []).map((f: string) => `• ${f}`).join('\n')}`,
        `**Methodology:** ${parsed.methodology}`,
        `**Relevance:** ${parsed.relevance_note}`,
        `**Themes:** ${(parsed.themes ?? []).join(', ')}`,
      ].join('\n\n'),
      // Store category and themes in tags array prefixed for easy filtering
      updated_at: new Date().toISOString(),
    }).eq('id', paperId)

    // Store category + themes as structured metadata in a separate upsert
    // We reuse the tags column for category/themes with a prefix convention
    const allTags = [
      ...(parsed.tags ?? []),
      `category:${parsed.category ?? 'Other'}`,
      ...(parsed.themes ?? []).map((t: string) => `theme:${t}`),
    ]
    await supabase.from('research_papers').update({ tags: allTags }).eq('id', paperId)

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
