export type AgentId =
  | 'assistant'
  | 'research'
  | 'trading'
  | 'journal'
  | 'scheduler'
  | 'knowledge'
  | 'paper-digester'
  | 'habit-tracker'
  | 'memory'
  | 'email'

export interface AgentProfile {
  id: AgentId
  label: string
  shortLabel: string
  description: string
  icon: string        // emoji
  color: string       // brand color
  model: string
  phase: number       // which build phase this agent is complete in
  starters: string[]
}

export const AGENTS: AgentProfile[] = [
  {
    id: 'assistant',
    label: 'Personal Assistant',
    shortLabel: 'Assistant',
    description: 'Tasks, projects, meetings & daily workflow',
    icon: '🧠',
    color: '#0F766E',
    model: 'deepseek-r1:7b',
    phase: 1,
    starters: [
      "What are my open tasks?",
      "What should I focus on today?",
      "Add a task to YouTube Crawling: fix metadata parsing, high priority",
      "Show me all my projects",
      "Mark the 'Backfill Swedish metadata' task as done",
    ],
  },
  {
    id: 'research',
    label: 'Research Agent',
    shortLabel: 'Research',
    description: 'Papers, highlights, citations & dissertation writing',
    icon: '📚',
    color: '#7C3AED',
    model: 'deepseek-r1:7b',
    phase: 1,
    starters: [
      "What papers have I read recently?",
      "Show me my favorite papers",
      "Which papers are most relevant to my dissertation?",
      "Summarize my highlights for temporal networks",
      "What papers haven't I started reading yet?",
    ],
  },
  {
    id: 'trading',
    label: 'Trading Agent',
    shortLabel: 'Trading',
    description: 'P&L, risk state, signals & trade history',
    icon: '📈',
    color: '#B45309',
    model: 'deepseek-r1:7b',
    phase: 1,
    starters: [
      "How did trading go today?",
      "What's my current risk state?",
      "Show me today's trades",
      "Are there any open positions right now?",
      "What's my win rate recently?",
    ],
  },
  {
    id: 'journal',
    label: 'Journal & Health',
    shortLabel: 'Journal',
    description: 'Mood, energy, daily reflection & health logs',
    icon: '📓',
    color: '#0369A1',
    model: 'deepseek-r1:7b',
    phase: 1,
    starters: [
      "How was my energy this week?",
      "Log today's workout: 45min run",
      "What patterns do you see in my journal?",
      "How many days did I check in this month?",
      "What was I blocked on last week?",
    ],
  },
  {
    id: 'scheduler',
    label: 'Scheduler',
    shortLabel: 'Scheduler',
    description: 'Week planning, overdue alerts & calendar',
    icon: '🗓️',
    color: '#6D28D9',
    model: 'deepseek-r1:7b',
    phase: 1,
    starters: [
      "What's on my plate this week?",
      "What tasks are overdue?",
      "Help me plan tomorrow",
      "What should I tackle first today?",
      "Are there any upcoming deadlines I should know about?",
    ],
  },
  {
    id: 'habit-tracker',
    label: 'Habit Tracker',
    shortLabel: 'Habits',
    description: 'Streaks, routines & weekly consistency',
    icon: '✅',
    color: '#065F46',
    model: 'deepseek-r1:7b',
    phase: 1,
    starters: [
      "What are my active habits?",
      "Mark meditation as done today",
      "What's my current streak for exercise?",
      "Show me my weekly habit summary",
      "Which habits am I at risk of breaking?",
    ],
  },
  {
    id: 'paper-digester',
    label: 'Paper Digester',
    shortLabel: 'Digester',
    description: 'Deep PDF analysis — Claude Haiku (~$0.004/paper)',
    icon: '🔬',
    color: '#9D174D',
    model: 'claude-haiku-4-5-20251001',
    phase: 1,
    starters: [
      "Digest the paper I just added",
      "Summarize paper ID abc123",
      "Extract key findings from my latest paper",
      "What's the methodology of my newest upload?",
      "How relevant is paper xyz to my dissertation?",
    ],
  },
  {
    id: 'knowledge',
    label: 'Knowledge (RAG)',
    shortLabel: 'Knowledge',
    description: 'Search & answer across all your papers and notes',
    icon: '🔍',
    color: '#1D4ED8',
    model: 'deepseek-r1:7b + nomic-embed-text',
    phase: 3,
    starters: [
      "What do my papers say about temporal networks?",
      "Find research on data fusion methods",
      "Summarise what I know about graph neural networks",
      "Which of my papers discuss representativeness?",
      "What are the main debates in my research area?",
    ],
  },
  {
    id: 'memory',
    label: 'Memory & Code',
    shortLabel: 'Memory',
    description: 'Cross-agent memory, preferences & code debugging',
    icon: '💾',
    color: '#374151',
    model: 'deepseek-r1:7b',
    phase: 4,
    starters: [
      "What do you remember about my trading rules?",
      "Remember: I don't trade on Fridays",
      "What have I told you about my dissertation topic?",
      "Help me debug this TypeScript error",
      "What preferences have I set across all agents?",
    ],
  },
  {
    id: 'email',
    label: 'Email Agent',
    shortLabel: 'Email',
    description: 'Gmail inbox — read, triage, draft & send',
    icon: '📧',
    color: '#DC2626',
    model: 'deepseek-r1:7b',
    phase: 5,
    starters: [
      "How many unread emails do I have?",
      "Triage my inbox",
      "Summarize my latest email",
      "Draft a reply to the email from...",
      "Search emails about...",
    ],
  },
]

export function getAgent(id: AgentId): AgentProfile {
  return AGENTS.find(a => a.id === id) ?? AGENTS[0]
}

// Only agents live in Phase 1
export function getLiveAgents(): AgentProfile[] {
  return AGENTS.filter(a => a.phase <= 1)
}
