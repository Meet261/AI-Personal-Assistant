// ─── Memory Agent — cross-agent memory + code debug ──────────────────────
// Reads/writes agent_memory table across ALL agents.
// Also handles code debugging using actual project files.

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join, extname } from 'path'
import { callOllama } from '../shared/models'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const ALL_AGENT_IDS = ['assistant', 'research', 'trading', 'journal', 'scheduler', 'knowledge', 'paper-digester', 'habit-tracker', 'memory']

// ── File reader for code debug (safe — only reads project files) ──────────
function readProjectFile(relativePath: string): string | null {
  const projectRoot = join(process.cwd())
  // Prevent path traversal outside project
  const fullPath = join(projectRoot, relativePath.replace(/^\/+/, ''))
  if (!fullPath.startsWith(projectRoot)) return null
  if (!existsSync(fullPath)) return null
  try {
    return readFileSync(fullPath, 'utf-8').slice(0, 8000) // cap at 8k chars
  } catch { return null }
}

function listProjectFiles(dir: string, ext: string[] = ['.ts', '.tsx', '.py', '.mq5']): string[] {
  const projectRoot = join(process.cwd())
  const fullDir = join(projectRoot, dir.replace(/^\/+/, ''))
  if (!fullDir.startsWith(projectRoot) || !existsSync(fullDir)) return []
  try {
    return readdirSync(fullDir, { withFileTypes: true })
      .filter(f => f.isFile() && ext.includes(extname(f.name)))
      .map(f => join(dir, f.name))
      .slice(0, 20)
  } catch { return [] }
}

// ── Main executor ─────────────────────────────────────────────────────────
export async function executeMemoryAction(action: string, params: Record<string, unknown>) {
  try {
  switch (action) {

    // ── Recall — query memories across one or all agents ─────────────────
    case 'recall': {
      const agentId = params.agent_id as string | undefined
      const query   = params.query as string | undefined

      let q = supabase.from('agent_memory').select('agent_id,key,value,updated_at').order('updated_at', { ascending: false })
      if (agentId && agentId !== 'all') q = q.eq('agent_id', agentId)
      q = q.limit(50)

      const { data, error } = await q
      if (error) return { ok: false, message: error.message }
      if (!data?.length) return { ok: true, message: 'No memories found', data: [] }

      // Client-side filter by query keyword if provided
      const filtered = query
        ? data.filter(m =>
            m.key.includes(query.toLowerCase()) ||
            m.value.toLowerCase().includes(query.toLowerCase())
          )
        : data

      return {
        ok: true,
        message: `${filtered.length} memories${agentId ? ` for ${agentId}` : ' across all agents'}`,
        data: filtered.map(m => ({ agent: m.agent_id, key: m.key, value: m.value, updated: m.updated_at?.slice(0, 10) })),
      }
    }

    // ── Save — store a new memory fact ────────────────────────────────────
    case 'save': {
      const agentId = (params.agent_id as string) || 'memory'
      const key     = params.key as string
      const value   = params.value as string
      if (!key || !value) return { ok: false, message: 'key and value are required' }

      const { error } = await supabase.from('agent_memory').upsert({
        agent_id: agentId,
        key: key.toLowerCase().replace(/\s+/g, '_').slice(0, 100),
        value: String(value).slice(0, 500),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'agent_id,key' })

      if (error) return { ok: false, message: error.message }
      return { ok: true, message: `Remembered: ${key} = ${value}` }
    }

    // ── Forget — delete a specific memory ────────────────────────────────
    case 'forget': {
      const agentId = (params.agent_id as string) || 'memory'
      const key     = params.key as string
      if (!key) return { ok: false, message: 'key is required' }

      const { error } = await supabase.from('agent_memory')
        .delete()
        .eq('agent_id', agentId)
        .eq('key', key.toLowerCase().replace(/\s+/g, '_'))

      if (error) return { ok: false, message: error.message }
      return { ok: true, message: `Forgotten: ${key}` }
    }

    // ── Summary — what does the system know about the user? ───────────────
    case 'get_summary': {
      const { data } = await supabase
        .from('agent_memory')
        .select('agent_id,key,value')
        .in('agent_id', ALL_AGENT_IDS)
        .order('agent_id')
        .limit(100)

      if (!data?.length) return { ok: true, message: 'No memories stored yet', data: {} }

      // Group by agent
      const grouped: Record<string, { key: string; value: string }[]> = {}
      for (const m of data) {
        if (!grouped[m.agent_id]) grouped[m.agent_id] = []
        grouped[m.agent_id].push({ key: m.key, value: m.value })
      }

      return { ok: true, message: `${data.length} total memories across ${Object.keys(grouped).length} agents`, data: grouped }
    }

    // ── Extract — run memory extraction over a conversation ───────────────
    case 'extract_from_conversation': {
      const messages = params.messages as { role: string; content: string }[]
      const agentId  = (params.agent_id as string) || 'memory'
      if (!messages?.length) return { ok: false, message: 'messages required' }

      const prompt = `You are a memory extractor. Extract 1-5 key facts worth remembering about the user.

Focus on: preferences, rules, goals, ongoing projects, recurring constraints (e.g. "doesn't trade Fridays").
Skip: transient details, questions already answered.

Conversation:
${messages.slice(-8).map(m => `${m.role}: ${m.content.slice(0, 200)}`).join('\n')}

Respond ONLY with a JSON array: [{"key":"snake_case_key","value":"the fact"}]
If nothing to remember, respond: []`

      const raw = await callOllama([{ role: 'user', content: prompt }], 'Extract memory facts. Respond only with valid JSON.')
      const jsonMatch = raw.match(/\[[\s\S]*\]/)
      if (!jsonMatch) return { ok: true, message: 'No facts to extract', data: [] }

      const facts: { key: string; value: string }[] = JSON.parse(jsonMatch[0])
      if (!Array.isArray(facts) || !facts.length) return { ok: true, message: 'No facts to extract', data: [] }

      const saved = []
      for (const f of facts) {
        if (!f.key || !f.value) continue
        await supabase.from('agent_memory').upsert({
          agent_id: agentId,
          key: f.key.toLowerCase().replace(/\s+/g, '_').slice(0, 100),
          value: String(f.value).slice(0, 500),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'agent_id,key' })
        saved.push(f)
      }

      return { ok: true, message: `Saved ${saved.length} memories for ${agentId}`, data: saved }
    }

    // ── Code debug — read real project files + reason about errors ────────
    case 'debug_code': {
      const errorText = params.error as string
      const filePath  = params.file as string | undefined
      const language  = (params.language as string) || 'TypeScript'

      if (!errorText) return { ok: false, message: 'error param required' }

      let fileContent = ''
      if (filePath) {
        const content = readProjectFile(filePath)
        if (content) {
          fileContent = `\n\nFile: ${filePath}\n\`\`\`${language.toLowerCase()}\n${content}\n\`\`\``
        }
      }

      // If no file specified, list relevant files for context
      const relevantFiles = filePath ? [] : [
        ...listProjectFiles('agents/specialist'),
        ...listProjectFiles('agents/shared'),
        ...listProjectFiles('app/api/orchestrator'),
      ]

      const contextHint = relevantFiles.length
        ? `\n\nProject files available: ${relevantFiles.join(', ')}`
        : ''

      const debugPrompt = `You are debugging a ${language} error in a Next.js personal AI assistant project.

Error:
${errorText}
${fileContent}
${contextHint}

Provide:
1. Root cause (1-2 sentences)
2. Exact fix (code if needed)
3. How to verify it's fixed`

      const reply = await callOllama(
        [{ role: 'user', content: debugPrompt }],
        `You are an expert ${language} debugger. Be precise and concise. Read the actual error carefully before suggesting a fix.`
      )

      return { ok: true, message: 'Debug analysis complete', data: { analysis: reply, file: filePath } }
    }

    // ── Read file — expose a project file for inspection ─────────────────
    case 'read_file': {
      const filePath = params.file as string
      if (!filePath) return { ok: false, message: 'file param required' }
      const content = readProjectFile(filePath)
      if (!content) return { ok: false, message: `File not found or unreadable: ${filePath}` }
      return { ok: true, message: `Read ${filePath}`, data: { file: filePath, content } }
    }

    // ── List files — show project structure ───────────────────────────────
    case 'list_files': {
      const dir = (params.dir as string) || 'agents'
      const files = listProjectFiles(dir)
      return { ok: true, message: `${files.length} files in ${dir}`, data: files }
    }

    default:
      return { ok: false, message: `Unknown memory action: ${action}` }
  }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[memory] ${action} error:`, msg)
    return { ok: false, message: `Memory error: ${msg}` }
  }
}
