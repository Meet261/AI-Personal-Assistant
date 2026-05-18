/* Minimal in-memory Supabase client stub for unit tests.
   Supports the query patterns used across app/api routes + specialists. */

function uuid() {
  // good-enough deterministic-ish id for tests
  return 'id_' + Math.random().toString(16).slice(2)
}

type Row = Record<string, any>
type Store = Record<string, Row[]>

const STORE: Store = Object.create(null)

export function __resetSupabaseStore() {
  for (const k of Object.keys(STORE)) delete STORE[k]
}

export function __seed(table: string, rows: Row[]) {
  STORE[table] = (STORE[table] ?? []).concat(rows.map(r => ({ ...r })))
}

export function __table(table: string) {
  return (STORE[table] ?? []).map(r => ({ ...r }))
}

class Query {
  private table: string
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  private payload: any = null
  private filters: ((r: Row) => boolean)[] = []
  private orders: { field: string; asc: boolean }[] = []
  private max: number | null = null
  private singleRow = false
  private conflictKeys: string[] | null = null
  private scheduled: Promise<{ data: any; error: any }> | null = null

  constructor(table: string) {
    this.table = table
    STORE[this.table] ||= []
  }

  select(_cols?: any) { this.op = this.op ?? 'select'; return this }
  order(field: string, opts?: { ascending?: boolean }) {
    this.orders.push({ field, asc: opts?.ascending !== false })
    return this
  }
  limit(n: number) { this.max = n; return this }
  single() { this.singleRow = true; return this }

  eq(field: string, value: any) { this.filters.push(r => r?.[field] === value); return this }
  neq(field: string, value: any) { this.filters.push(r => r?.[field] !== value); return this }
  lt(field: string, value: any) { this.filters.push(r => r?.[field] < value); return this }
  gte(field: string, value: any) { this.filters.push(r => r?.[field] >= value); return this }
  ilike(field: string, pattern: string) {
    const needle = String(pattern ?? '').replace(/%/g, '').toLowerCase()
    this.filters.push(r => String(r?.[field] ?? '').toLowerCase().includes(needle))
    return this
  }
  in(field: string, values: any[]) {
    const set = new Set(values ?? [])
    this.filters.push(r => set.has(r?.[field]))
    return this
  }
  is(field: string, value: any) { this.filters.push(r => (r?.[field] ?? null) === value); return this }
  not(field: string, _op: string, value: any) { this.filters.push(r => (r?.[field] ?? null) !== value); return this }

  private scheduleExec() {
    // Supabase builders execute when awaited/then'ed, but in app code we often
    // intentionally "fire-and-forget" via `void builder`. To simulate that in
    // tests, schedule execution on the microtask queue once a mutating op is set.
    if (!this.scheduled) this.scheduled = Promise.resolve().then(() => this.exec())
  }

  insert(payload: any) { this.op = 'insert'; this.payload = payload; this.scheduleExec(); return this }
  update(payload: any) { this.op = 'update'; this.payload = payload; this.scheduleExec(); return this }
  delete() { this.op = 'delete'; this.scheduleExec(); return this }
  upsert(payload: any, opts?: { onConflict?: string }) {
    this.op = 'upsert'
    this.payload = payload
    this.conflictKeys = (opts?.onConflict ?? '').split(',').map(s => s.trim()).filter(Boolean)
    this.scheduleExec()
    return this
  }

  then(onFulfilled: any, onRejected: any) {
    // If previously scheduled (fire-and-forget), reuse that result; else execute now.
    const p = this.scheduled ?? Promise.resolve().then(() => this.exec())
    return p.then(onFulfilled, onRejected)
  }

  private exec(): { data: any; error: any } {
    try {
      const rows = STORE[this.table] ||= []
      if (this.op === 'select') {
        let out = rows.filter(r => this.filters.every(f => f(r)))
        for (const o of this.orders) {
          out = out.slice().sort((a, b) => {
            const av = a?.[o.field]
            const bv = b?.[o.field]
            if (av === bv) return 0
            if (av === undefined) return 1
            if (bv === undefined) return -1
            return (av < bv ? -1 : 1) * (o.asc ? 1 : -1)
          })
        }
        if (this.max != null) out = out.slice(0, this.max)
        return { data: this.singleRow ? (out[0] ?? null) : out, error: null }
      }

      if (this.op === 'insert') {
        const arr = Array.isArray(this.payload) ? this.payload : [this.payload]
        const inserted = arr.map((r: any) => ({ id: r?.id ?? uuid(), ...r }))
        rows.push(...inserted)
        return { data: this.singleRow ? inserted[0] : inserted, error: null }
      }

      if (this.op === 'update') {
        const updated: Row[] = []
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i]
          if (!this.filters.every(f => f(r))) continue
          rows[i] = { ...r, ...this.payload }
          updated.push(rows[i])
        }
        return { data: this.singleRow ? (updated[0] ?? null) : updated, error: null }
      }

      if (this.op === 'delete') {
        const keep: Row[] = []
        const removed: Row[] = []
        for (const r of rows) {
          if (this.filters.every(f => f(r))) removed.push(r)
          else keep.push(r)
        }
        STORE[this.table] = keep
        return { data: removed, error: null }
      }

      if (this.op === 'upsert') {
        const arr = Array.isArray(this.payload) ? this.payload : [this.payload]
        const keys = this.conflictKeys ?? []
        const out: Row[] = []
        for (const item of arr) {
          const row = { id: item?.id ?? uuid(), ...item }
          const idx = keys.length
            ? rows.findIndex(r => keys.every(k => r?.[k] === row?.[k]))
            : -1
          if (idx >= 0) rows[idx] = { ...rows[idx], ...row }
          else rows.push(row)
          out.push(row)
        }
        return { data: this.singleRow ? (out[0] ?? null) : out, error: null }
      }

      return { data: null, error: null }
    } catch (e: any) {
      return { data: null, error: { message: e?.message ?? String(e) } }
    }
  }
}

class Client {
  from(table: string) {
    return new Query(table)
  }
}

export function createClient(_url: string, _key: string) {
  return new Client()
}
