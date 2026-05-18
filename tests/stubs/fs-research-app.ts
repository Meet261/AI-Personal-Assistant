// Stubbed fs module for app/api/research-app/* routes.
// Those routes read files from a sibling repo path; in tests we return deterministic fixtures.

const FIXTURES: Record<string, string | Buffer> = {
  'pdf-manifest.json': JSON.stringify({ papers: [{ file: 'example.pdf', title: 'Example' }] }),
  'seed-data.json': JSON.stringify({ ok: true }),
  'example.pdf': Buffer.from('%PDF-1.4\n%stub\n'),
}

export function existsSync(p: string) {
  const key = String(p).split('/').pop()!
  return key in FIXTURES
}

export function readFileSync(p: string, encoding?: any) {
  const key = String(p).split('/').pop()!
  const val = FIXTURES[key]
  if (val === undefined) throw new Error('ENOENT')
  if (typeof val === 'string') return val
  if (encoding) return val.toString(encoding)
  return val
}

