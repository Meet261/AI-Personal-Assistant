// ─── Shared types across all agents ───────────────────────────────────────

export type AgentId =
  | 'orchestrator'
  | 'assistant'      // tasks, projects, meetings
  | 'research'       // papers, highlights, dissertation writing
  | 'trading'        // P&L, risk, signals, finance
  | 'journal'        // mood, energy, health logs
  | 'scheduler'      // week view, cron alerts, calendar
  | 'knowledge'      // RAG over papers + notes (Phase 3)
  | 'paper-digester' // Haiku PDF analysis
  | 'habit-tracker'  // streaks, email digest
  | 'memory'         // cross-agent memory, code debug (Phase 4)
  | 'email'          // Gmail read, triage, send (Phase 5)

export type ModelTier = 'local' | 'haiku' | 'sonnet'

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface AgentRequest {
  messages: AgentMessage[]
  sessionId?: string
  context?: Record<string, unknown>   // cross-agent context passed by orchestrator
}

export interface AgentResponse {
  reply: string
  agentId: AgentId
  toolResults?: ToolResult[]
  delegatedTo?: AgentId[]             // which specialists were called
  tokensUsed?: { input: number; output: number; model: string }
}

export interface ToolResult {
  ok: boolean
  message: string
  data?: unknown
}

export interface Intent {
  primaryAgent: AgentId
  secondaryAgents: AgentId[]          // agents to fan-out to
  confidence: number                  // 0-1
  reason: string
}

export interface MemoryFact {
  agentId: AgentId
  key: string
  value: string
  sourceSessionId?: string
}

export interface AgentContext {
  // Snapshot of each domain — built once per request by orchestrator
  tasks?: { title: string; priority: string; deadline?: string }[]
  projects?: { name: string; status: string }[]
  tradingToday?: { pnl: number; trades: number; wins: number; openPositions: string[] }
  researchActive?: { title: string; status: string }[]
  journalToday?: { energy: number; completed: string; blocked: string } | null
  schedulerAlerts?: string[]
  memories?: Record<AgentId, MemoryFact[]>
}
