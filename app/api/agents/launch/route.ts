import { NextRequest, NextResponse } from 'next/server'
import { spawn, execSync, ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import * as net from 'net'
import { isResearchEnabled, setResearchEnabled } from '@/lib/research-state'

// launchd runs with a minimal PATH — ensure system tools are found
const EXEC_ENV = { ...process.env, PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin' }

// ---------------------------------------------------------------------------
// Agent process registry (in-memory, lives as long as Next.js server runs)
// ---------------------------------------------------------------------------

interface ManagedProcess {
  proc: ChildProcess
  logs: string[]
  startedAt: string
}

const processes = new Map<string, ManagedProcess>()
const MAX_LOG_LINES = 200

function appendLog(agentId: string, line: string) {
  const entry = processes.get(agentId)
  if (!entry) return
  entry.logs.push(line)
  if (entry.logs.length > MAX_LOG_LINES) entry.logs.shift()
}

// ---------------------------------------------------------------------------
// Agent configs
// ---------------------------------------------------------------------------

const BASE = join(process.cwd(), '..')   // /Users/fury/AI Projects

const AGENT_CONFIGS: Record<string, {
  port?: number
  url: string
  cwd?: string
  cmd?: string
  args?: string[]
  env?: Record<string, string>
  watchdog?: string     // optional watchdog shell script path
  paManaged?: boolean   // controlled by toggle, not a process
}> = {
  research: {
    url: '/api/research-app',
    paManaged: true,
  },
  trading: {
    port: 8000,
    url: 'http://localhost:8000',
    cwd: join(BASE, 'Trading Agent', 'trading_agent'),
    cmd: join(BASE, 'Trading Agent', 'trading_agent', '.venv', 'bin', 'uvicorn'),
    args: ['trading_agent.api.server:app', '--host', '0.0.0.0', '--port', '8000'],
    env: { PYTHONPATH: join(BASE, 'Trading Agent', 'trading_agent', 'src') },
    watchdog: join(BASE, 'Trading Agent', 'trading_agent', 'scripts', 'watchdog.sh'),
  },
}

// ---------------------------------------------------------------------------
// Port check — try socket first, fall back to /usr/sbin/lsof
// ---------------------------------------------------------------------------

function isPortOpen(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const sock = new net.Socket()
    sock.setTimeout(600)
    sock.on('connect', () => { sock.destroy(); resolve(true) })
    sock.on('error', () => {
      // Fallback: /usr/sbin/lsof check (more reliable on macOS)
      try {
        const out = execSync(`/usr/sbin/lsof -ti :${port} 2>/dev/null || true`, { timeout: 1000, env: EXEC_ENV }).toString().trim()
        resolve(out.length > 0)
      } catch {
        resolve(false)
      }
    })
    sock.on('timeout', () => {
      sock.destroy()
      try {
        const out = execSync(`/usr/sbin/lsof -ti :${port} 2>/dev/null || true`, { timeout: 1000, env: EXEC_ENV }).toString().trim()
        resolve(out.length > 0)
      } catch {
        resolve(false)
      }
    })
    sock.connect(port, '127.0.0.1')
  })
}

// ---------------------------------------------------------------------------
// GET — status of one or all agents
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agent')

  const ids = agentId ? [agentId] : Object.keys(AGENT_CONFIGS)
  const results: Record<string, unknown> = {}

  await Promise.all(ids.map(async id => {
    const cfg = AGENT_CONFIGS[id]
    if (!cfg) { results[id] = { running: false, error: 'unknown agent' }; return }

    if (cfg.paManaged) {
      results[id] = {
        running: id === 'research' ? isResearchEnabled() : true,
        url: cfg.url,
        managedByPA: true,
        startedAt: null,
        logs: [],
      }
      return
    }

    const portOpen = cfg.port ? await isPortOpen(cfg.port) : false
    const managed = processes.get(id)

    results[id] = {
      running: portOpen,
      url: cfg.url,
      port: cfg.port,
      managedByPA: !!managed,
      startedAt: managed?.startedAt ?? null,
      logs: managed?.logs.slice(-50) ?? [],
    }
  }))

  return NextResponse.json(agentId ? results[agentId] : results)
}

// ---------------------------------------------------------------------------
// POST — start or stop an agent
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const { agent, action } = await req.json()
  const cfg = AGENT_CONFIGS[agent]
  if (!cfg) return NextResponse.json({ error: 'Unknown agent' }, { status: 400 })

  // PA-managed agents use a toggle instead of a process
  if (cfg.paManaged) {
    if (agent === 'research') {
      setResearchEnabled(action === 'start')
      return NextResponse.json({ ok: true, message: action === 'start' ? 'Research app enabled' : 'Research app stopped' })
    }
    return NextResponse.json({ error: 'Unknown PA-managed agent' }, { status: 400 })
  }

  if (action === 'start') {
    // Already running?
    if (cfg.port && await isPortOpen(cfg.port)) {
      return NextResponse.json({ ok: true, message: `${agent} already running on port ${cfg.port}` })
    }

    if (!existsSync(cfg.cwd!)) {
      return NextResponse.json({ error: `Directory not found: ${cfg.cwd}` }, { status: 500 })
    }

    const entry: ManagedProcess = { proc: null as never, logs: [], startedAt: new Date().toISOString() }

    const proc = spawn(cfg.cmd!, cfg.args!, {
      cwd: cfg.cwd!,
      env: { ...process.env, ...cfg.env },
      detached: false,
    })

    entry.proc = proc
    processes.set(agent, entry)

    proc.stdout?.on('data', (d: Buffer) => {
      const lines = d.toString().split('\n').filter(Boolean)
      lines.forEach(l => appendLog(agent, l))
    })
    proc.stderr?.on('data', (d: Buffer) => {
      const lines = d.toString().split('\n').filter(Boolean)
      lines.forEach(l => appendLog(agent, l))
    })
    proc.on('exit', (code) => {
      appendLog(agent, `[process exited with code ${code}]`)
      processes.delete(agent)
    })

    // Start watchdog if configured (detached so it survives independently)
    if (cfg.watchdog && existsSync(cfg.watchdog)) {
      const wd = spawn('bash', [cfg.watchdog], {
        cwd: cfg.cwd!,
        env: { ...process.env, ...cfg.env },
        detached: true,
        stdio: 'ignore',
      })
      wd.unref()
      appendLog(agent, `[watchdog started pid ${wd.pid}]`)
    }

    return NextResponse.json({ ok: true, message: `Started ${agent} (pid ${proc.pid})`, pid: proc.pid })
  }

  if (action === 'stop') {
    const managed = processes.get(agent)
    if (managed) {
      managed.proc.kill('SIGKILL')
      processes.delete(agent)
    }
    // Kill watchdog + server via shell so pipes work correctly
    const killScript = [
      `/usr/bin/pkill -f "scripts/watchdog.sh" 2>/dev/null`,
      `pids=$(/usr/sbin/lsof -ti :${cfg.port} 2>/dev/null)`,
      `[ -n "$pids" ] && kill -9 $pids 2>/dev/null`,
      `exit 0`,
    ].join('\n')
    execSync(`bash -c '${killScript.replace(/'/g, "'\\''")}'`, { env: EXEC_ENV })
    // Wait up to 3s for port to clear
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 500))
      const pids = execSync(`/usr/sbin/lsof -ti :${cfg.port} 2>/dev/null || true`, { env: EXEC_ENV }).toString().trim()
      if (!pids) return NextResponse.json({ ok: true, message: `Stopped ${agent}` })
      execSync(`bash -c 'kill -9 ${pids.split('\n').join(' ')} 2>/dev/null || true'`, { env: EXEC_ENV })
    }
    return NextResponse.json({ ok: true, message: `Stopped ${agent}` })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
