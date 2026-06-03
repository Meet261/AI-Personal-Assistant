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

export async function digestPaper(paperId: string, paperText: string, systemPrompt?: string): Promise<{
  ok: boolean
  summary?: string
  message: string
}> {
  try {
    const raw = await callHaiku(
      [{ role: 'user', content: `Please analyze this academic paper:\n\n${paperText.slice(0, 12000)}` }],
      systemPrompt ?? DIGEST_SYSTEM
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

    // Second Haiku call: structured argument extraction
    extractArguments(paperId, paperText, parsed.summary ?? '').catch((e) => console.error('[paper-digester] extractArguments failed:', e))

    // Log token usage for budget tracking
    await supabase.from('agent_token_usage').insert({
      agent_id: 'paper-digester',
      model: 'claude-haiku-4-5-20251001',
      input_tokens: Math.round(paperText.slice(0, 12000).length / 4),
      output_tokens: Math.round(raw.length / 4),
      cost_usd: (Math.round(paperText.slice(0, 12000).length / 4) / 1_000_000) * 0.25 + (Math.round(raw.length / 4) / 1_000_000) * 1.25,
    }).then(() => {}, (e) => console.error('[paper-digester] token_usage insert failed:', e))

    return { ok: true, summary: parsed.summary, message: `Paper "${paperId}" digested successfully` }
  } catch (e) {
    return { ok: false, message: `Digest failed: ${String(e)}` }
  }
}

const ARGUMENT_SYSTEM = `You are an expert at extracting structured arguments from academic papers.
Given a paper's text and summary, extract the following. Respond ONLY in valid JSON:
{
  "main_claim": "The central thesis or contribution in 1-2 sentences",
  "methodology": "Research design and methods in 1 sentence",
  "key_findings": "The top 2-3 concrete findings as a single paragraph",
  "limitations": "Acknowledged limitations or weaknesses in 1-2 sentences"
}
Be precise and quote the paper's own language where possible.`

async function extractArguments(paperId: string, paperText: string, summary: string): Promise<void> {
  try {
    const prompt = `Summary: ${summary}\n\nPaper (first 6000 chars):\n${paperText.slice(0, 6000)}`
    const raw = await callHaiku([{ role: 'user', content: prompt }], ARGUMENT_SYSTEM)
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return
    const parsed = JSON.parse(jsonMatch[0])

    await supabase.from('research_papers').update({
      main_claim:               parsed.main_claim ?? null,
      methodology:              parsed.methodology ?? null,
      key_findings:             parsed.key_findings ?? null,
      limitations:              parsed.limitations ?? null,
      arguments_extracted_at:   new Date().toISOString(),
    }).eq('id', paperId)
  } catch {
    // Non-fatal — argument extraction is best-effort
  }
}

export async function executeDigesterAction(action: string, params: Record<string, unknown>) {
  try {
    switch (action) {
      case 'digest_paper': {
        const paperId = params.paper_id as string
        const text = params.text as string
        const systemPrompt = params.system_prompt as string | undefined
        if (!paperId || !text) return { ok: false, message: 'paper_id and text required' }
        return digestPaper(paperId, text, systemPrompt)
      }
      case 'get_undigested': {
        const projectId = params.project_id as string | undefined
        let q = supabase.from('research_papers').select('id,title,has_pdf').is('summary', null).limit(10)
        if (projectId) q = q.eq('project_id', projectId)
        const { data } = await q
        return { ok: true, message: `${data?.length || 0} papers without summaries`, data }
      }

      // ── extract_arguments_for — run argument extraction on a specific paper ─
      case 'extract_arguments_for': {
        const paperId = params.paper_id as string
        if (!paperId) return { ok: false, message: 'paper_id required' }

        const { data: paper } = await supabase.from('research_papers')
          .select('id,title,summary,notes').eq('id', paperId).single()
        if (!paper) return { ok: false, message: 'Paper not found' }
        if (!paper.summary) return { ok: false, message: 'Digest paper first (no summary yet)' }

        // Use the notes field as stand-in for the paper text (it contains key findings from digest)
        const fakeText = `${paper.summary}\n\n${paper.notes ?? ''}`
        await extractArguments(paperId, fakeText, paper.summary)

        return { ok: true, message: `Arguments extracted for "${paper.title}"` }
      }

      default:
        return { ok: false, message: `Unknown action: ${action}` }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, message: `Paper Digester error: ${msg}` }
  }
}
