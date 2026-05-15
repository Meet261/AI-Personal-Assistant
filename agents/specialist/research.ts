// ─── Research specialist — papers, highlights, projects + writing mode ────
import { createClient } from '@supabase/supabase-js'
import { callOllama } from '../shared/models'
import { executeKnowledgeAction } from './knowledge'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function executeResearchAction(action: string, params: Record<string, unknown>) {
  switch (action) {

    // ── Paper library ──────────────────────────────────────────────────────
    case 'list_research_projects': {
      const { data } = await supabase.from('research_projects').select('id,name,description').order('created_at', { ascending: false })
      return { ok: true, message: `${data?.length || 0} research projects`, data }
    }

    case 'list_papers': {
      let q = supabase.from('research_papers')
        .select('id,title,authors,year,journal,reading_status,favorite,summary,dissertation_relevance,tags')
        .order('created_at', { ascending: false }).limit(50)
      if (params.project_id) q = q.eq('project_id', params.project_id as string)
      if (params.reading_status) q = q.eq('reading_status', params.reading_status as string)
      if (params.favorite === true) q = q.eq('favorite', true)
      const { data } = await q
      return { ok: true, message: `${data?.length || 0} papers`, data }
    }

    case 'search_papers': {
      const query = String(params.query || '').toLowerCase()
      const { data } = await supabase.from('research_papers')
        .select('id,title,authors,year,journal,reading_status,summary,tags').limit(100)
      const filtered = data?.filter(p =>
        p.title?.toLowerCase().includes(query) ||
        p.authors?.toLowerCase().includes(query) ||
        p.summary?.toLowerCase().includes(query) ||
        p.tags?.some((t: string) => t.toLowerCase().includes(query))
      ).slice(0, 15)
      return { ok: true, message: `${filtered?.length || 0} matching papers`, data: filtered }
    }

    case 'get_paper_details': {
      const query = String(params.title || params.query || '')
      const { data } = await supabase.from('research_papers')
        .select('*').ilike('title', `%${query}%`).limit(1).single()
      if (!data) return { ok: false, message: `No paper matching "${query}"` }
      return { ok: true, message: `Found: ${data.title}`, data }
    }

    case 'list_highlights': {
      let q = supabase.from('research_highlights')
        .select('id,selected_text,note,color,paper_id').order('created_at', { ascending: false }).limit(30)
      if (params.paper_id) q = q.eq('paper_id', params.paper_id as string)
      if (params.project_id) q = q.eq('project_id', params.project_id as string)
      const { data } = await q
      return { ok: true, message: `${data?.length || 0} highlights`, data }
    }

    case 'get_reading_stats': {
      const { data } = await supabase.from('research_papers').select('reading_status')
      const stats: Record<string, number> = {}
      data?.forEach(p => { stats[p.reading_status] = (stats[p.reading_status] || 0) + 1 })
      return { ok: true, message: 'Reading statistics', data: stats }
    }

    // ── Writing mode — dissertation drafting with real citations ───────────
    // Uses ChromaDB RAG to pull relevant papers, then drafts with citations.

    case 'draft_section': {
      // params: topic (string), section_type? (intro/lit_review/methods/discussion/conclusion), word_count? (number)
      const topic       = params.topic as string
      const sectionType = (params.section_type as string) || 'literature review'
      const wordCount   = (params.word_count as number) || 400
      if (!topic) return { ok: false, message: 'topic required' }

      // 1. Pull relevant papers from ChromaDB
      const ragResult = await executeKnowledgeAction('search_knowledge', { query: topic, top_k: 6 })
      const citations = ragResult.ok && Array.isArray(ragResult.data) ? ragResult.data : []

      // 2. Also pull highlights related to topic from Supabase
      const { data: highlights } = await supabase
        .from('research_highlights')
        .select('selected_text,note')
        .limit(200)
      // Simple keyword filter on highlights
      const topicWords = topic.toLowerCase().split(' ').filter(w => w.length > 3)
      const relevantHighlights = (highlights ?? [])
        .filter(h => topicWords.some(w =>
          h.selected_text?.toLowerCase().includes(w) || h.note?.toLowerCase().includes(w)
        ))
        .slice(0, 5)

      // 3. Build context for the LLM
      const citationContext = citations.length
        ? `Relevant papers from your library:\n${citations.map((c, i) =>
            `[${i + 1}] ${c.title} (${c.authors}, ${c.year}) — ${c.snippet}`
          ).join('\n\n')}`
        : 'No closely matching papers found in ChromaDB — drafting from general knowledge.'

      const highlightContext = relevantHighlights.length
        ? `\nYour highlights on this topic:\n${relevantHighlights.map(h =>
            `"${h.selected_text?.slice(0, 200)}"${h.note ? ` [Note: ${h.note}]` : ''}`
          ).join('\n')}`
        : ''

      const draftPrompt = `You are writing a ${sectionType} section of a dissertation.

Topic: ${topic}
Target length: ~${wordCount} words

${citationContext}
${highlightContext}

Write a coherent, academic ${sectionType} on this topic.
- Cite papers using (Author, Year) format where relevant
- Use academic language appropriate for a dissertation
- Build a logical argument, don't just list papers
- If citing, only cite from the papers provided above

Draft the section now:`

      const draft = await callOllama(
        [{ role: 'user', content: draftPrompt }],
        'You are an expert academic writer helping with dissertation writing. Write clearly and academically.'
      )

      return {
        ok: true,
        message: `Draft ${sectionType} on "${topic}" (${citations.length} papers cited)`,
        data: {
          draft,
          citations_used: citations.map(c => `${c.authors} (${c.year}) — ${c.title}`),
          section_type: sectionType,
          topic,
        },
      }
    }

    case 'outline_chapter': {
      // params: chapter_title (string), research_questions? (string[])
      const chapterTitle     = params.chapter_title as string
      const researchQuestions = (params.research_questions as string[]) || []
      if (!chapterTitle) return { ok: false, message: 'chapter_title required' }

      // Pull papers relevant to the chapter
      const ragResult = await executeKnowledgeAction('search_knowledge', { query: chapterTitle, top_k: 8 })
      const citations = ragResult.ok && Array.isArray(ragResult.data) ? ragResult.data : []

      const rqContext = researchQuestions.length
        ? `Research questions:\n${researchQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
        : ''

      const citationList = citations.length
        ? `Papers available:\n${citations.map(c => `- ${c.title} (${c.authors}, ${c.year})`).join('\n')}`
        : ''

      const outlinePrompt = `Create a detailed chapter outline for a dissertation chapter titled: "${chapterTitle}"

${rqContext}
${citationList}

Provide:
1. Chapter overview (2-3 sentences)
2. Section breakdown (4-6 sections with subsections)
3. For each section: what argument it makes, which papers to cite
4. Suggested word count per section

Format as a structured outline.`

      const outline = await callOllama(
        [{ role: 'user', content: outlinePrompt }],
        'You are an expert dissertation advisor creating chapter outlines. Be specific and actionable.'
      )

      return {
        ok: true,
        message: `Chapter outline: "${chapterTitle}"`,
        data: { outline, chapter_title: chapterTitle, papers_available: citations.length },
      }
    }

    case 'improve_paragraph': {
      // params: text (string), instruction? (string)
      const text        = params.text as string
      const instruction = (params.instruction as string) || 'improve clarity and academic tone'
      if (!text) return { ok: false, message: 'text required' }

      const improvePrompt = `Improve this dissertation paragraph. Instruction: ${instruction}

Original:
${text}

Provide:
1. Improved version
2. Key changes made (2-3 bullet points)`

      const result = await callOllama(
        [{ role: 'user', content: improvePrompt }],
        'You are an academic writing editor. Maintain the author\'s voice while improving quality.'
      )

      return { ok: true, message: 'Paragraph improved', data: { result, original: text } }
    }

    case 'find_citations_for': {
      // params: claim (string) — find papers that support a specific claim
      const claim = params.claim as string
      if (!claim) return { ok: false, message: 'claim required' }

      const ragResult = await executeKnowledgeAction('search_knowledge', { query: claim, top_k: 5 })
      const papers = ragResult.ok && Array.isArray(ragResult.data) ? ragResult.data : []

      if (!papers.length) return { ok: true, message: 'No supporting papers found in your library', data: [] }

      return {
        ok: true,
        message: `${papers.length} papers that may support: "${claim}"`,
        data: papers.map(p => ({
          title: p.title,
          authors: p.authors,
          year: p.year,
          relevance_score: p.score,
          snippet: p.snippet,
          cite_as: `(${p.authors?.split(',')[0] ?? 'Unknown'}, ${p.year ?? 'n.d.'})`,
        })),
      }
    }

    default:
      return { ok: false, message: `Unknown research action: ${action}` }
  }
}
