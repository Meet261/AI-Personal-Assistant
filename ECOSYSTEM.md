# Agent Ecosystem

## Architecture

```
User → Orchestrator (PA) → routes to specialist → synthesizes → responds
```

## Agent Registry

| Agent | Model | Purpose | Cost |
|-------|-------|---------|------|
| Orchestrator | Local (7b) | Routes all requests, synthesizes multi-agent responses | Free |
| Assistant | Local (7b) | Tasks, projects, deadlines, work management | Free |
| Research | Local (7b) | Papers, highlights, citations, reading status | Free |
| Trading | Local (7b) | P&L, risk state, trade history (read-only) | Free |
| Journal | Local (7b) | Mood, energy, daily reflection, patterns | Free |
| Scheduler | Local (7b) | Planning, week view, overdue alerts | Free |
| Paper Digester | Claude Haiku | Deep PDF comprehension, auto-summary | ~$0.004/paper |
| Habit Tracker | Local (7b) | Habits, streaks, daily consistency | Free |

## Monthly Budget: $3-5
- Paper Digester: $0.004/paper × ~750 papers = $3/month max
- Everything else: $0 (local Ollama)

## Folder Structure

```
agents/
  orchestrator/       # Intent classification + routing
    index.ts
  specialist/         # One file per agent
    assistant.ts
    research.ts
    trading.ts
    journal.ts
    scheduler.ts
    paper-digester.ts
    habit-tracker.ts
  shared/
    types.ts          # Shared TypeScript types
    models.ts         # Model config + callOllama/callHaiku
    context.ts        # Cross-agent context builder

app/api/
  orchestrator/       # Main entry point — routes all messages
  agents/
    journal/          # Journal agent API
    scheduler/        # Scheduler API + cron
    paper-digester/   # PDF digest trigger
    habit/            # Habit tracking API

supabase/migrations/
  001_ecosystem.sql   # New tables: habits, habit_logs, scheduler_alerts, agent_token_usage, agent_intent_log
```

## Phase Roadmap

- [x] Phase 1: Orchestrator routing (intent classification → specialist)
- [x] Phase 1: Shared context builder (cross-agent awareness)
- [x] Phase 1: All specialist executors migrated
- [ ] Phase 2: Journal Agent API + pattern detection
- [ ] Phase 2: Scheduler Agent cron + proactive alerts
- [ ] Phase 3: Paper Digester webhook (auto-trigger on new paper)
- [ ] Phase 4: Habit Tracker UI
- [ ] Phase 5: Full cascade (trading → journal → scheduler)

## How the Orchestrator Routes

1. User sends message to `/api/orchestrator`
2. Context built (DB + file reads, ~50ms, no LLM)
3. Local 7b classifies intent (~1s, ~500 tokens)
4. Primary specialist runs (executes tools + generates reply)
5. If multi-domain, secondary specialists run in parallel
6. Synthesize into one response (only if 2+ agents)
7. Save to Supabase, return to UI

## Adding a New Agent

1. Create `agents/specialist/my-agent.ts` with `executeMyAgentAction()`
2. Add to `agents/orchestrator/index.ts` — add keywords to `keywordClassify()`
3. Add to `app/api/orchestrator/route.ts` — add case to the switch
4. Add to `lib/agents.ts` for UI display
5. Add SQL table if needed in `supabase/migrations/`
