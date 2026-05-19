# Research Workflow — PhD in Temporal Complex Networks

**Project:** Learning and Explaining Critical Transitions in Temporal Complex Networks  
**Library:** 34 papers (all digested, 17 with citations fetched)  
**Last updated:** 2026-05-19

---

## System Overview

Your Personal Assistant has a full research pipeline built into it. Here is what every component does and how they connect:

| Component | What it does |
|-----------|--------------|
| **Paper Digester** | Runs Claude Haiku on each paper — extracts summary, tags, dissertation relevance (1–5), methodology, key findings, limitations, main claim |
| **Argument Extraction** | Second Haiku call after digest — populates `main_claim`, `methodology`, `key_findings`, `limitations` in the DB |
| **ChromaDB / Hybrid Search** | Embeds all digested papers with `nomic-embed-text` — enables semantic search + BM25 keyword search merged via RRF |
| **Citation Graph** | Fetches references and citing papers from Semantic Scholar — stored in `paper_citations` table |
| **Contradiction Detector** | Scans all papers with extracted arguments for opposing keyword pairs across main claims |
| **Citation Gap Finder** | Finds foundational papers cited by 2+ of your papers but not yet in your library |
| **Research Agent Chat** | Answers questions using your actual library — draft sections, find citations, outline chapters |
| **Episodic Memory** | Every research conversation is stored and retrieved semantically — agent remembers past discussions |

---

## Workflow A — Adding a Single New Paper

### Step 1 — Add to Library
Go to the Research app (`localhost:3000/research-app`) and add the paper:
- Upload the PDF if you have it
- Or add metadata manually (title, authors, year, journal, abstract)

### Step 2 — Digest It
Go to **Paper Digester → Actions tab**:
- Select the paper from the dropdown
- Click **Digest Paper**
- Takes ~10 seconds, costs ~$0.004 (Claude Haiku)
- Automatically extracts: summary, tags, dissertation relevance, methodology, key findings, limitations, main claim

### Step 3 — Embed It (for search)
In the **Research agent chat**, ask:
```
Embed this paper into the knowledge base: [paper title]
```
Or go to **Knowledge agent** and run `embed_paper`. This makes the paper searchable via semantic search.

### Step 4 — Fetch Citations
In the **Research agent chat**, ask:
```
Fetch citations for [paper title]
```
Or run directly:
```bash
curl -X POST http://localhost:3000/api/agents/research \
  -H "Content-Type: application/json" \
  -d '{"action":"fetch_citations","params":{"paper_id":"[paper_id]"}}'
```
This pulls references (what it cites) and citations (who cites it) from Semantic Scholar.

### Step 5 — Use It
Now the paper is fully integrated. Ask the research agent:
- *"What does [paper] say about temporal networks?"*
- *"Does [paper] contradict anything else in my library?"*
- *"Find papers that support the claim from [paper]"*

---

## Workflow B — Adding Multiple New Papers (Batch)

### Step 1 — Add All Papers to Library
Add all papers via the Research app or import them in bulk.

### Step 2 — Batch Digest
Go to **Paper Digester → Actions tab**:
- Click **Digest All Pending**
- Progress streams live — you can watch each paper being processed
- Cost: ~$0.004 per paper (e.g. 10 papers = $0.04)

### Step 3 — Fetch Citations for All
Run the script from terminal:
```bash
cd "/Users/fury/AI Projects/personal-assistant"
node scripts/fetch-all-citations.mjs
```
- Fetches citations for all papers not yet fetched
- 6 second delay between calls to respect Semantic Scholar rate limits (100 req/5min free tier)
- Idempotent — safe to run multiple times, skips already-fetched papers
- Takes ~3–4 minutes for 34 papers

### Step 4 — Embed All (if not already done)
In the Knowledge agent, run:
```
embed all papers
```
This re-embeds any papers added since last embedding.

---

## Workflow C — Writing a Dissertation Section

Use the **Research agent chat**. It has access to your full library via semantic search.

### Draft a section
```
Draft a literature review section on critical transitions in temporal networks
```
The agent will:
1. Run semantic search over your 34 papers for relevant ones
2. Pull your highlights on the topic
3. Write an academic paragraph citing papers from your library in (Author, Year) format

### Outline a chapter
```
Outline Chapter 2: Temporal Network Representations and their Limitations
```
Returns a full chapter structure with section breakdown, which papers to cite in each section, and suggested word counts.

### Find supporting citations for a claim
```
Find citations for: temporal networks exhibit critical transitions before structural collapse
```
Returns ranked papers from your library that support that specific claim.

### Improve a paragraph
```
Improve this paragraph: [paste your text]
```
Returns an improved version with academic language + a note on what changed.

---

## Workflow D — Discovering What You're Missing

### Find contradictions (for lit review tension)
```
Find contradictions between papers in my library
```
Surfaces paper pairs with opposing claims — useful for framing debates in your lit review.
Example found: Tufekci (2014) vs Peng (2011) on representativeness and validity methodology.

### Find citation gaps (discover missing foundational papers)
```
Find citation gaps in my library
```
Shows papers cited by multiple of your papers but not yet in your library — these are the foundational works you should add.
Currently found (with 17/34 papers fetched):
- Watts & Strogatz (1998) — *Small-world networks* — 42,355 citations
- Barabási & Albert (2001) — *Statistical mechanics of complex networks* — 19,902 citations  
- Newman (2003) — *Structure and function of complex networks* — 17,822 citations
- PageRank (1999) — 16,569 citations

These are strong candidates to add to your library.

### Find foundational papers
```
Find foundational papers in my citation graph
```
Returns the highest cited-count papers that your library references — the foundational work in your field.

---

## Workflow E — Daily Research Session

A recommended routine when working on the dissertation:

1. **Morning** — open Research agent chat, ask:
   ```
   What are the most relevant papers for what I'm working on today: [topic]
   ```

2. **While reading** — add highlights in the Research app as you read papers

3. **When you find a new paper** — run Workflow A immediately (digest + embed + citations) so it's in the system before you need it

4. **When drafting** — use the agent to draft, then refine yourself. The agent cites only from your library, so citations are always real.

5. **Weekly** — run `node scripts/fetch-all-citations.mjs` to catch any new papers added that week

---

## Quick Reference — Research Agent Commands

| What you want | What to ask |
|---------------|-------------|
| Find papers on a topic | `"Find papers about [topic]"` |
| Get full paper details | `"Tell me about the [author] [year] paper"` |
| Draft a section | `"Draft a [intro/lit review/methods] section on [topic]"` |
| Outline a chapter | `"Outline chapter [N]: [title]"` |
| Find supporting citations | `"Find citations for: [claim]"` |
| Improve writing | `"Improve this paragraph: [text]"` |
| Find contradictions | `"Find contradictions between papers in my library"` |
| Find missing papers | `"Find citation gaps in my library"` |
| Fetch a paper's references | `"Fetch citations for [paper title]"` |
| Reading stats | `"Show my reading statistics"` |

---

## Current Library Status

```
Total papers:          34
Digested (summary):    34  ✅ all done
Arguments extracted:   34  ✅ all done
Citations fetched:     17  ⚡ run fetch-all-citations.mjs for remaining 17
Embedded (ChromaDB):   34  ✅ all done
```

### Papers still needing citation fetch
Run `node scripts/fetch-all-citations.mjs` to fetch the remaining 17. The script will skip already-fetched papers automatically.

---

## Cost Reference

| Action | Model | Cost per paper |
|--------|-------|---------------|
| Digest | Claude Haiku | ~$0.004 |
| Argument extraction | Claude Haiku | ~$0.001 |
| Embedding | nomic-embed-text (local) | Free |
| Citation fetch | Semantic Scholar API | Free |
| Research chat | DeepSeek R1 7b (local) | Free |
| Morning briefing | DeepSeek V3 | ~$0.001 |

**Estimated cost for 34 papers fully processed: ~$0.17 total**

---

## Technical Notes

- **Semantic Scholar rate limit**: 100 requests per 5 minutes on the free tier. The fetch script uses 6s delays to stay well within this. If you get rate limited, just wait 5 minutes and run again.
- **ChromaDB**: Must be running for semantic search to work. Check the system health bar on the dashboard — the ChromaDB dot must be green.
- **Episodic memory**: Every research conversation is stored. The agent will reference past discussions automatically when relevant.
- **Re-digest**: If a paper's summary seems wrong, go to **Paper Digester → Actions → Re-digest All** to force a fresh Haiku pass.
