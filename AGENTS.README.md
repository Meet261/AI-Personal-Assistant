# Personal AI Agent Ecosystem

One orchestrator. Ten specialists. Everything local. $3–5/month max.

---

## Architecture

```
User Message
     │
     ▼
┌─────────────────────────────────────────┐
│           NEXUS — Orchestrator          │
│  keyword classify → LLM classify        │
│  builds cross-agent context once        │
│  routes to 1–N specialists in parallel  │
│  synthesizes if multi-agent             │
└─────────────────────────────────────────┘
     │
     ├──► Assistant     tasks, projects, meetings, action items
     ├──► Research      papers, highlights, citations, dissertation writing
     ├──► Trading       P&L, risk state, signals, expense summaries
     ├──► Journal       mood, energy, health logs, sleep, nutrition
     ├──► Scheduler     week view, cron alerts, calendar management
     ├──► Knowledge     RAG over all papers + notes (ChromaDB)
     ├──► Paper Digest  deep PDF analysis — Claude Haiku only
     ├──► Habit Track   streaks, consistency, weekly email digests
     └──► Memory        cross-agent facts, code debug, user preferences
```

---

## The 10 Agents

### 1. Orchestrator (NEXUS)
**File:** `agents/orchestrator/index.ts`  
**Entry:** `app/api/orchestrator/route.ts`  
**Model:** deepseek-r1:7b (Ollama)

Receives every user message. Builds full cross-agent context from Supabase + CSV files in ~50ms (no LLM). Classifies intent with keyword regex first (zero tokens), falls back to Ollama for ambiguous queries. Routes to one or more specialists in parallel. Synthesizes multi-agent replies into one coherent response. Logs every routing decision to `agent_intent_log`.

**Routes to multiple agents when:** query spans domains ("how did my energy correlate with trading this week" → Journal + Trading).

---

### 2. Assistant
**File:** `agents/specialist/assistant.ts`  
**Model:** deepseek-r1:7b (Ollama)

Your primary productivity brain. Manages everything work and life management.

**Absorbed:** Task management + Project management + Meeting prep + Action item creation

| Capability | Actions |
|-----------|---------|
| Projects | add, list, delete |
| Tasks | add, bulk add, update status, delete |
| Meetings | prep brief, capture notes, create follow-up tasks |
| Multi-add | "add project X with tasks A, B, C" in one shot |

**Cross-agent:** Knows your current research projects and trading schedule. Meeting notes automatically create tasks.

---

### 3. Research
**File:** `agents/specialist/research.ts`  
**Model:** deepseek-r1:7b (Ollama)

Academic research management + dissertation writing support. Your 750+ papers, organised.

**Absorbed:** Paper management + Reading tracking + Citation lookup + Writing Agent (dissertation drafts)

| Capability | Actions |
|-----------|---------|
| Papers | list, search, get details, reading status |
| Highlights | list per paper, search across all |
| Writing | draft dissertation sections citing your actual papers |
| Stats | reading pace, completion rate, papers per project |

**Cross-agent:** Pulls your current tasks (Assistant) to know dissertation deadlines. Writing drafts cite papers from Knowledge Agent RAG.

---

### 4. Trading
**File:** `agents/specialist/trading.ts`  
**Model:** deepseek-r1:7b (Ollama)

Read-only trading intelligence. Reads directly from `trades.csv` and `risk_state.json` — no API, no latency.

**Absorbed:** Trade history + Risk monitoring + P&L summaries + Finance (budget context)

| Capability | Actions |
|-----------|---------|
| Risk state | current drawdown, exposure, open positions |
| Trade history | recent trades, today's trades, W/L breakdown |
| Performance | win rate, avg R:R, symbol breakdown |
| Finance | budget overview cross-referenced with trading P&L |

**Cross-agent:** Journal Agent gets today's P&L to correlate with mood/energy.

---

### 5. Journal
**File:** `agents/specialist/journal.ts`  
**Model:** deepseek-r1:7b (Ollama)

Daily reflection + health tracking in one agent. Private data — never leaves your machine.

**Absorbed:** Mood/energy journaling + Health logs (workouts, sleep, nutrition)

| Capability | Actions |
|-----------|---------|
| Journal | today's entry, recent entries, patterns |
| Health | log workout, log sleep, log meals |
| Energy | weekly energy pattern, correlation with productivity |
| Checkins | stats, streaks, consistency score |

**Cross-agent:** Energy scores feed back to Scheduler for optimal deep-work time blocking. Trading P&L cross-referenced with mood.

**Privacy:** All journal + health data stays in Supabase (your instance). Ollama processes locally.

---

### 6. Scheduler
**File:** `agents/specialist/scheduler.ts`  
**Model:** deepseek-r1:7b (Ollama)

Proactive planning. Knows what's overdue before you ask.

**Absorbed:** Week planning + Cron alerts + Calendar management + Meeting scheduling

| Capability | Actions |
|-----------|---------|
| Week view | all tasks + deadlines for the next 7 days |
| Overdue | surfaces and reschedules overdue items |
| Alerts | pushes to `scheduler_alerts` table, shown in dashboard |
| Calendar | schedule/reschedule tasks by date |

**Cron:** Runs nightly at 22:00 — scans overdue tasks, pushes alerts for next morning's briefing.

**Cross-agent:** Reads trading calendar (no-trade days) and journal energy to suggest optimal work scheduling.

---

### 7. Knowledge (RAG)
**File:** `agents/specialist/knowledge.ts`  
**Entry:** `app/api/knowledge/route.ts`  
**Model:** deepseek-r1:7b (Ollama) + nomic-embed-text (Ollama)  
**Storage:** ChromaDB (local Docker)

Ask questions across all 750+ papers and get cited answers. The most powerful new agent.

| Capability | Actions |
|-----------|---------|
| Search | semantic search across all paper abstracts + highlights |
| Q&A | "what do my papers say about X?" with citations |
| Notes | embed and query your personal notes |
| Synthesis | summarise a topic across multiple papers |

**How it works:**
1. Paper abstracts + highlights embedded with `nomic-embed-text` (free, local)
2. User query embedded → top-5 chunks retrieved from ChromaDB
3. Chunks + query sent to deepseek-r1:7b → answer with citations
4. New papers auto-embedded when added to Supabase

**Cross-agent:** Research Agent uses Knowledge Agent for dissertation writing (cites real papers). Paper Digester results fed into ChromaDB automatically.

---

### 8. Paper Digester
**File:** `agents/specialist/paper-digester.ts`  
**Model:** Claude Haiku (claude-haiku-4-5-20251001) — ONLY agent using API  
**Cost:** ~$0.004/paper · 750 papers = $3/month max

Deep PDF comprehension. Extracts what a fast local model cannot.

| Output field | Description |
|-------------|-------------|
| `summary` | 3–5 sentence plain-language summary |
| `key_findings` | bullet list of core contributions |
| `methodology` | research design and approach |
| `relevance_note` | relevance to your current projects |
| `dissertation_relevance` | direct applicability to your dissertation |

**Trigger:** Manual via Agents Hub, or auto-webhook when new paper added (Phase 3).  
**Token logging:** Every call logged to `agent_token_usage` — budget never surprises you.  
**Output:** Stored in `research_papers.digest` column, embedded into ChromaDB (Knowledge Agent).

---

### 9. Habit Tracker
**File:** `agents/specialist/habit-tracker.ts`  
**Model:** deepseek-r1:7b (Ollama)

Daily consistency tracking + automated weekly summaries.

**Absorbed:** Streak tracking + Habit management + Weekly email digest

| Capability | Actions |
|-----------|---------|
| Habits | create, list, toggle active |
| Logs | mark complete, add notes |
| Streaks | current streak, longest streak, at-risk habits |
| Weekly digest | auto-emails summary every Sunday via Gmail |

**Cross-agent:** Habit completion feeds Journal Agent (mood/energy correlation). Scheduler nudges for uncompleted habits.

---

### 10. Memory
**File:** `agents/specialist/memory.ts`  
**Model:** deepseek-r1:7b (Ollama)

The system's long-term brain. Learns who you are across all sessions.

**Absorbed:** Cross-agent memory + Code debugging help + User preferences

| Capability | Actions |
|-----------|---------|
| Remember | "remember I don't trade on Fridays" → stored fact |
| Recall | "what do you know about my trading rules?" |
| Forget | remove a specific memory |
| Code help | debug TypeScript/Python/MQL5 with your project context |
| Preferences | track how you like answers formatted, what to skip |

**How it works:** Every 4 messages, Ollama extracts memorable facts and upserts to `agent_memory` table with `agent_id`. Memory Agent can query across all agents' memories.

**Code debug:** Reads actual project files before suggesting fixes — not generic advice.

---

## Tech Stack

### Running Now
| Layer | Tech | Notes |
|-------|------|-------|
| Frontend | Next.js 16.2.4 + TypeScript | All dashboards in one app |
| Database | Supabase (Postgres) | All structured data |
| File storage | Supabase Storage | PDFs |
| Local LLM | Ollama + deepseek-r1:7b | 9 of 10 agents |
| API LLM | Claude Haiku | Paper Digester only |
| Trading backend | Python FastAPI | MT5 signal processing |
| Research frontend | Vite → single HTML | Served by PA |

### To Add (Knowledge Agent only)
| Component | Install | Purpose |
|-----------|---------|---------|
| ChromaDB | `docker run chromadb/chroma` | Vector store for RAG |
| nomic-embed-text | `ollama pull nomic-embed-text` | Local embeddings, free |

Everything else — Email, Health, Meeting, Writing — reuses existing infrastructure (Supabase tables + Ollama). No new services.

---

## LLM Decision Rules

```
Is data private (journal, health, trades)?  →  Ollama, always
Is it a PDF deep-read?                      →  Claude Haiku
Is it routing/classification?               →  keyword regex first, Ollama fallback
Everything else?                            →  Ollama deepseek-r1:7b
```

---

## Monthly Cost

| What | Cost |
|------|------|
| 9 Ollama agents (all local) | $0 |
| Paper Digester — 750 papers max | $3.00 |
| ChromaDB + embeddings | $0 |
| **Total** | **$0–$3/month** |

---

## Database Tables

### Existing
- `tasks` — project tasks
- `projects` — project metadata
- `research_projects`, `research_papers`, `paper_highlights`
- `journal_entries`, `checkin_stats`
- `agent_memory` — per-agent facts
- `briefings` — morning/evening briefings

### Added in Phase 1
- `agent_token_usage` — Haiku cost tracking
- `scheduler_alerts` — proactive nudges
- `habits`, `habit_logs` — habit tracker
- `agent_intent_log` — routing debug

### To Add (Phase 2+)
- `health_logs` — workouts, sleep, meals (Journal Agent)
- `meetings` — meeting notes + action items (Assistant)
- `knowledge_embeddings` — ChromaDB handles this externally

---

## Phase Roadmap

### Phase 1 — Core Ecosystem ✅ (Done)
- [x] Orchestrator with keyword + LLM routing
- [x] Shared context builder (cross-agent awareness)
- [x] All 8 specialist executors
- [x] `/api/orchestrator` entry point
- [x] SQL migration for new tables
- [x] Agent switcher UI with routing badge

### Phase 2 — Crons + Health ✅ (Done)
- [x] Journal Agent API (`app/api/agents/journal/route.ts`) — GET + POST
- [x] Scheduler Agent cron (`app/api/agents/scheduler/route.ts`) — nightly 22:00 alert push
- [x] Journal absorbs health: `health_logs` table + log_workout/log_sleep/log_meal actions
- [x] Pattern detection: low energy streak, missed check-ins, no workouts this week
- [x] Habit Tracker weekly email digest (Sunday 20:00 via cron)
- [x] Habit API route (`app/api/agents/habit/route.ts`)
- [x] SQL migration 002: `health_logs` + `meetings` tables
- [x] Cron extended: 22:00 nightly scheduler + 20:00 Sunday habit digest

### Phase 3 — Knowledge Agent (RAG) ✅ (Done)
- [x] ChromaDB running via `chroma run --port 8001 --path .chroma-data` (no Docker needed — Anaconda)
- [x] `nomic-embed-text` pulled via Ollama
- [x] `agents/specialist/knowledge.ts` — embed_paper, embed_all_papers, embed_highlights, search_knowledge, remove_paper, status
- [x] `/api/knowledge` route (GET + POST)
- [x] Auto-embed on new paper add (papers POST route hooks in)
- [x] Auto-remove on paper delete
- [x] Knowledge executor wired into orchestrator route
- [x] ChromaDB added to `dev:all` script — starts automatically
- [x] `CHROMA_URL` added to `.env.local`
- [ ] **Run once:** `POST /api/knowledge { "action": "embed_all_papers" }` to index existing papers

### Phase 4 — Memory Agent + Writing ✅ (Done)
- [x] `agents/specialist/memory.ts` — recall, save, forget, get_summary, extract_from_conversation, debug_code, read_file, list_files
- [x] Research Agent writing mode — draft_section (RAG citations), outline_chapter, improve_paragraph, find_citations_for
- [x] Memory executor wired into orchestrator route
- [x] Auto memory extraction every 4 user messages (fire-and-forget)
- [x] Writing drafts pull from ChromaDB — only cites papers in your actual library

### Phase 5 — Email + Meetings ✅ (Done)
- [x] `agents/specialist/email.ts` — fetch_inbox, read_email, triage_inbox, summarize_email, draft_reply, send_email, send_reply, search_emails, get_unread_count
- [x] `app/api/agents/email/route.ts` — GET + POST endpoint
- [x] Email wired into orchestrator route + keyword classifier
- [x] Email added to AgentId types, lib/agents.ts, AGENT_ICONS
- [x] Assistant absorbs meetings: create_meeting, get_meetings, capture_meeting_notes, extract_action_items (auto-creates tasks), prep_meeting_brief
- [x] imapflow + mailparser installed for Gmail IMAP
- [x] All email processing local via Ollama — never sent to cloud

### Phase 6 — Full Cascade
- [x] Trading → Journal → Scheduler chain
- [x] Paper Digester auto-webhook on new paper (app/api/research/pdfs/route.ts → autoDigest())
- [x] Knowledge Agent auto-queries in Research Agent writing mode (draft_section, outline_chapter, find_citations_for)

---

## Adding a New Agent

1. Create `agents/specialist/my-agent.ts` with `executeMyAgentAction()`
2. Add keywords to `keywordClassify()` in `agents/orchestrator/index.ts`
3. Add case to switch in `app/api/orchestrator/route.ts`
4. Add entry to `lib/agents.ts` for UI display
5. Add SQL table if needed in `supabase/migrations/`

---

## File Structure

```
agents/
  orchestrator/
    index.ts              — classifyIntent, keywordClassify, synthesize
  specialist/
    assistant.ts          — tasks, projects, meetings
    research.ts           — papers, highlights, writing
    trading.ts            — CSV reader, P&L, risk
    journal.ts            — mood, energy, health
    scheduler.ts          — week view, cron alerts
    knowledge.ts          — RAG query (Phase 3)
    paper-digester.ts     — Haiku PDF analysis
    habit-tracker.ts      — streaks, email digest
    memory.ts             — cross-agent memory (Phase 4)
  shared/
    types.ts              — AgentId, AgentContext, Intent
    models.ts             — callOllama, callHaiku
    context.ts            — buildAgentContext, contextToString

app/api/
  orchestrator/           — main entry point
  knowledge/              — RAG endpoint (Phase 3)
  agents/
    journal/              — journal API + health logs
    scheduler/            — scheduler API + cron
    paper-digester/       — PDF trigger
    habit/                — habit tracking API

supabase/migrations/
  001_ecosystem.sql       — habits, scheduler_alerts, token_usage, intent_log
  002_health_meetings.sql — health_logs, meetings (Phase 2)
```
