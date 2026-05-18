import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

// Next.js ships SWC bindings we can reuse to transpile TSX for tests without extra deps.
import { transformSync } from 'next/dist/build/swc/index.js'

const PROJECT_ROOT = pathToFileURL(process.cwd() + path.sep)

function isUnder(url, relDir) {
  try {
    const p = fileURLToPath(url)
    return p.startsWith(path.join(process.cwd(), relDir) + path.sep)
  } catch {
    return false
  }
}

export async function resolve(specifier, context, defaultResolve) {
  // Next.js ESM entrypoints sometimes require explicit ".js" for Node resolution.
  if (specifier === 'next/server') {
    return defaultResolve('next/server.js', context, defaultResolve)
  }

  // Ollama calls are stubbed (no dependency on local server for unit tests).
  if (specifier === '@/agents/shared/models' || specifier === '@/agents/shared/models.ts' || specifier.endsWith('/agents/shared/models')) {
    return defaultResolve(new URL('./tests/stubs/agents-shared-models.ts', PROJECT_ROOT).href, context, defaultResolve)
  }

  // Support tsconfig path alias "@/*" -> "<projectRoot>/*"
  if (specifier.startsWith('@/')) {
    const rel = specifier.slice(2)
    const base = new URL(rel, PROJECT_ROOT)
    try {
      return await defaultResolve(base.href, context, defaultResolve)
    } catch {
      // Try common source extensions used in this repo.
      for (const ext of ['.ts', '.tsx', '.js', '.mjs']) {
        try {
          return await defaultResolve((base.href + ext), context, defaultResolve)
        } catch { /* try next */ }
      }
      // Try directory index resolution (Next/Webpack behavior).
      for (const idx of ['/index.ts', '/index.tsx', '/index.js', '/index.mjs']) {
        try {
          return await defaultResolve(base.href + idx, context, defaultResolve)
        } catch { /* try next */ }
      }
      throw new Error(`Failed to resolve alias ${specifier}`)
    }
  }

  // Lightweight stubs to let client components render in Node tests.
  if (specifier === 'next/link') {
    return defaultResolve(new URL('./tests/stubs/next-link.ts', PROJECT_ROOT).href, context, defaultResolve)
  }
  if (specifier === 'next/navigation') {
    return defaultResolve(new URL('./tests/stubs/next-navigation.ts', PROJECT_ROOT).href, context, defaultResolve)
  }

  // Supabase client is always stubbed in tests (no network; deterministic).
  if (specifier === '@supabase/supabase-js') {
    return defaultResolve(new URL('./tests/stubs/supabase-js.ts', PROJECT_ROOT).href, context, defaultResolve)
  }

  // Avoid sending real email in tests.
  if (specifier === 'nodemailer') {
    return defaultResolve(new URL('./tests/stubs/nodemailer.ts', PROJECT_ROOT).href, context, defaultResolve)
  }

  // Avoid spawning real OS processes in tests.
  if (specifier === 'child_process') {
    return defaultResolve(new URL('./tests/stubs/child-process.ts', PROJECT_ROOT).href, context, defaultResolve)
  }

  // Research-app file-serving routes read from a sibling repo; stub fs there to keep tests hermetic.
  if (specifier === 'fs' && context.parentURL && isUnder(context.parentURL, 'app/api/research-app')) {
    return defaultResolve(new URL('./tests/stubs/fs-research-app.ts', PROJECT_ROOT).href, context, defaultResolve)
  }

  // Node ESM requires explicit extensions; the app code (and Next) commonly omits them.
  // Try resolving extensionless relative imports like "../foo" -> "../foo.ts|tsx|js".
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !path.extname(specifier)) {
    try {
      return await defaultResolve(specifier, context, defaultResolve)
    } catch {
      for (const ext of ['.ts', '.tsx', '.js', '.mjs']) {
        try {
          return await defaultResolve(specifier + ext, context, defaultResolve)
        } catch { /* keep trying */ }
      }
    }
  }

  return defaultResolve(specifier, context, defaultResolve)
}

export async function load(url, context, defaultLoad) {
  // Let Node handle JSON and builtins.
  if (url.startsWith('node:') || url.endsWith('.json')) {
    return defaultLoad(url, context, defaultLoad)
  }

  // Node doesn't understand .tsx; transpile TS/TSX through Next's SWC bindings.
  const pathname = fileURLToPath(url)
  if (pathname.endsWith('.ts') || pathname.endsWith('.tsx')) {
    const src = await readFile(pathname, 'utf8')
    const isTsx = pathname.endsWith('.tsx')
    const out = transformSync(src, {
      filename: pathname,
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', tsx: isTsx },
        transform: {
          react: { runtime: 'automatic', development: true },
        },
      },
      module: { type: 'es6' },
      sourceMaps: false,
    })
    return { format: 'module', source: out.code, shortCircuit: true }
  }

  return defaultLoad(url, context, defaultLoad)
}
