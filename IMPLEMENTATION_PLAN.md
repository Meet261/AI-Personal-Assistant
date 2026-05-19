# Implementation Plan — Personal OS Ecosystem

> Last updated: 2026-05-19  
> Stack: Next.js 16.2.4 · Ollama (deepseek-r1:7b, pa-assistant, pa-trading, pa-research, plutus) · DeepSeek V3 API · Supabase · ChromaDB · Python trading agent

---

## What's Already Done ✅

| Feature | Commit |
|---------|--------|
| 10 specialist agents + orchestrator | Phase 1-6 |
| Shared AgentPageLayout (5-tab shell) | `f7c404a` |
| useAgentChat + session persistence | `d43ea94` |
| Custom Modelfiles (pa-assistant 16K, pa-trading 8K, pa-research 8K) | `bb3d460` |
| plutus finance model for trading | `bb3d460` |
| DeepSeek V3 for tool-call dispatch + R1 for reasoning | `e4d9d25` |
| Hybrid retrieval: ChromaDB vector + Supabase BM25/FTS with RRF | `a51cd65` |
| FTS trigger + GIN index on research_papers | `5aa2360` |
| Orchestrator top-level try/catch (resilience) | `8165cb4` |
| Trading dedup: fingerprint key, symbol normalisation | `b1cc198` |
| Cascade: trading → journal → scheduler nightly chain | Phase 6 |
| Async paper digest with SSE progress | `3fa4464` |

---

## Priority 0 — Reliability & Robustness (Build Next)

These fix current fragility before adding new features.

### P0-A: Ollama native tool calling (replace regex fence parsing)
**Why**: Current tool-call parsing uses regex on fenced code blocks — fragile, silently drops malformed JSON. Ollama supports native function calling with JSON schemas since v0.3. V3 already does this correctly; R1 should too.  
**What**: Define tool schemas per agent, pass via `tools:[]` in Ollama API, parse `tool_calls` from response instead of regex.  
**Impact**: Eliminates entire class of silent tool failures. Makes V3 path unnecessary for write ops long-term.  
**Effort**: 1 day  

### P0-B: Per-agent tool allowlists + parameter validation
**Why**: Any agent can currently call any tool via the dispatcher — no governance. A badly-prompted agent could call delete actions it shouldn't touch.  
**What**: Add `AGENT_TOOL_ALLOWLIST` map in orchestrator. Validate action names + param schemas before dispatch. Return clear error if violated.  
**Impact**: Prevents prompt injection from causing unintended writes. Required before adding MCP-style plugins.  
**Effort**: Half day  

### P0-C: Single event log (observability)
**Why**: Currently `agent_intent_log` captures routing decisions but not individual tool call inputs/outputs/latency. "Why did it do this?" is hard to answer.  
**What**: Extend `agent_intent_log` or add `agent_tool_events` table: `{session_id, agent_id, action, params, result_ok, result_preview, latency_ms, model, cost_estimate}`. Log every tool dispatch.  
**Impact**: Enables "what broke?", "what's slow?", cost tracking per agent.  
**Effort**: Half day  

---

## Priority 1 — High Value Features (Week 2–3)

### P1-A: Auto-tag trades on close ⭐ Highest leverage
**Why**: Win rate without setup segmentation is nearly useless. After tagging, the agent can say "your breakout trades have +0.6R, your reversal trades have -0.2R."  
**What**:  
1. On every `append_csv` write in `io.py`, fire background V3 call: `{setup_type, session_phase, market_regime, planned_vs_impulse}`  
2. Store tags in `trade_tags` Supabase table linked by `order_ticket + symbol + close_time`  
3. Expose in trading agent: filter/group analytics by tag  
**Schema**:
```sql
create table trade_tags (
  id uuid primary key default gen_random_uuid(),
  order_ticket text,
  symbol text,
  close_time text,
  setup_type text,       -- breakout, pullback, reversal, vwap, scalp
  session_phase text,    -- open, midday, close
  market_regime text,    -- trending, ranging, volatile
  planned_vs_impulse text, -- planned, impulse
  tagged_at timestamptz default now()
);
```
**Effort**: 1 day  

### P1-B: MAE/MFE tracking
**Why**: Maximum Adverse/Favorable Excursion reveals stop placement and target quality. The #1 metric serious traders track.  
**What**: EA already has price data during trade lifetime. Add two fields to trades CSV: `mae` (max adverse excursion in R) and `mfe` (max favorable excursion in R). Display in trading Today tab. After 100 trades, agent can identify stop/target patterns.  
**Effort**: 1 day (requires EA-side change to send MAE/MFE on trade close)  

### P1-C: Episodic memory layer
**Why**: Memory agent saves facts but not reasoning traces. With episodic memory, after 2 weeks the assistant can say "last 3 times you traded during a 3+ loss streak you averaged -1.8R."  
**What**:
```sql
create table agent_episodes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references agent_sessions(id),
  agent_id text,
  user_question text,
  data_retrieved jsonb,  -- what preflight fetched
  conclusion text,        -- what the agent said
  created_at timestamptz default now()
);
```
Store on every orchestrator response. Retrieve last N relevant episodes by semantic similarity in preflight for memory/trading/journal agents.  
**Effort**: 1.5 days  

### P1-D: Citation graph for research
**Why**: Flat vector search treats every paper equally. A citation graph reveals which papers are foundational (cited by many others you've saved).  
**What**:
1. Register for Semantic Scholar API (free, no key needed for basic use)  
2. On paper add: fetch references via `api.semanticscholar.org/graph/v1/paper/{doi}/references`  
3. Store in `paper_citations` table: `{paper_id, cited_paper_doi, cited_title, cited_year}`  
4. Expose in research preflight: "papers most cited by your library on topic X"  
**Schema**:
```sql
create table paper_citations (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid references research_papers(id) on delete cascade,
  cited_doi text,
  cited_title text,
  cited_authors text,
  cited_year int,
  created_at timestamptz default now()
);
```
**Effort**: 1 day  

### P1-E: Argument extraction on paper ingest
**Why**: Currently Haiku extracts a summary. A structured extraction lets you query "papers that challenge representativeness" not just "papers about representativeness."  
**What**: Add second Haiku call on digest: extract `{main_claim, methodology, key_findings, limitations, contradicts: [], supports: []}`. Store as `argument_map jsonb` column on `research_papers`.  
**Effort**: Half day (add column + second Haiku call in digester)  

---

## Priority 2 — Compound Value (Month 2)

### P2-A: Command center UI ("Control Tower")
**Why**: Currently each agent is a separate page. A unified daily dashboard showing tasks + energy + trading state + research queue removes context switching.  
**What**: New `/dashboard` (or upgrade existing) with:
- Today panel: energy level, top 3 tasks, trading status, unread emails
- Quick-action buttons: "Plan my day", "Digest new papers", "End-of-day review"
- Workflow launchers (not chats) that chain multiple agent actions  
**Effort**: 2 days  

### P2-B: Weekly trading review (Sunday automation)
**Why**: Nightly cascade runs Mon-Sat. Add a Sunday report: R-multiple distribution, win rate by setup (needs P1-A tags), worst/best trades, one improvement task.  
**What**: Add Sunday 21:00 cron trigger in `cron.mjs`. Calls cascade + generates structured email review.  
**Effort**: Half day (after P1-A tags exist)  

### P2-C: Energy-aware task scheduling in morning briefing
**Why**: Journal already logs energy (1-5). Task list has cognitive loads. Connect them so briefing says "energy 4/5 → 3 deep work tasks 9-12, admin afternoon."  
**What**: In briefing route, fetch today's journal energy + task list. Pass both to assistant prompt with scheduling rules. When energy ≤ 2, flag: "low energy day — no deep work scheduled."  
**Effort**: Half day  

### P2-D: Project momentum radar
**Why**: Projects with no task activity in 7 days silently stall. One question per stalled project per week forces explicit decision.  
**What**: Add to morning briefing: query tasks table for projects with no updates in 7 days. Include in briefing: "3 projects stalled: X, Y, Z — paused, blocked, or dropped?"  
**Effort**: Half day  

### P2-E: Literature gap detection (monthly)
**Why**: After accumulating papers, thin topic areas = your next research direction.  
**What**: Monthly cron: cluster paper abstracts by concept, identify thin clusters, prompt R1 "given this coverage, what questions remain unstudied?" Email result.  
**Effort**: 1 day  

---

## Priority 3 — Architecture (When Ready)

### P3-A: Durable workflow execution
**Why**: Multi-step jobs (ingest → embed → draft → task) restart from scratch on failure. A persisted run graph with checkpoints makes them resumable.  
**What**: Add `workflow_runs` table with `{run_id, step, status, checkpoint_data}`. Each step writes its output before calling the next. Failure resumes from last checkpoint.  
**Effort**: 2 days  

### P3-B: Thumb feedback loop
**Why**: No signal today on which agent responses were good/bad. Feedback feeds prompt tuning.  
**What**: Add 👍/👎 buttons to chat messages. Store in `message_feedback` table. Weekly review of negative feedback → improve system prompts.  
**Effort**: 1 day (UI + table)  

---

## Build Order

```
Week 2 (now):
  ├── P0-B  Tool allowlists (half day)
  ├── P0-C  Event log (half day)
  └── P1-A  Auto-tag trades ⭐ (1 day)

Week 3:
  ├── P1-C  Episodic memory (1.5 days)
  ├── P1-D  Citation graph (1 day)
  └── P1-E  Argument extraction (half day)

Week 4:
  ├── P1-B  MAE/MFE (1 day — needs EA change)
  ├── P2-C  Energy-aware scheduling (half day)
  └── P2-D  Project momentum radar (half day)

Month 2:
  ├── P2-A  Command center UI (2 days)
  ├── P2-B  Weekly trading review (half day)
  ├── P2-E  Literature gap detection (1 day)
  └── P3-B  Feedback loop (1 day)

When ready:
  └── P3-A  Durable workflows (2 days)
```

---

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| V3 for tool dispatch, R1 for reasoning | R1 not trained for structured JSON; V3 is; cost ~$0.30/month |
| Plutus for trading agent | Finance fine-tune; better baseline for trading psychology |
| RRF hybrid search (vector + BM25) | Pure vector misses exact terms (tickers, dates, names) |
| Modelfiles over fine-tuning | Not enough domain examples yet; prompt baking is highest ROI |
| Supabase over separate vector DB | Already in stack; pgvector available if needed |
| No MCP plugins yet | Tool governance (P0-B) must come first |
