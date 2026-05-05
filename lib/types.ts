export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived'
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low'
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'deferred'
export type TaskEffort = 'S' | 'M' | 'L' | 'XL'

export interface Project {
  id: string
  name: string
  description: string
  status: ProjectStatus
  color: string
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  project_id: string | null
  title: string
  description: string
  priority: TaskPriority
  status: TaskStatus
  effort: TaskEffort
  deadline: string | null
  scheduled_for: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  project?: Project
}

export interface JournalEntry {
  id: string
  date: string
  completed_today: string
  blocked_or_pushed: string
  new_tasks: string
  energy_level: number
  tomorrow_focus: string
  ai_summary: string
  ai_tasks_scheduled: string[]
  created_at: string
}

export interface DailyBriefing {
  id: string
  date: string
  type: 'morning' | 'evening'
  content: string
  top_priorities: string[]
  created_at: string
}

export interface TaskComment {
  id: string
  task_id: string
  body: string
  created_at: string
}

export interface CheckinAnswer {
  completed_today: string
  blocked_or_pushed: string
  new_tasks: string
  energy_level: number
  tomorrow_focus: string
}
