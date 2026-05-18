import test from 'node:test'
import assert from 'node:assert/strict'
import { ollamaStream } from '../lib/ollama.ts'

test('Catalog 5: ollamaStream aggregates JSONL tokens (non-fragmented lines)', async () => {
  const prevFetch = globalThis.fetch
  globalThis.fetch = async () => {
    const lines = [
      JSON.stringify({ message: { content: 'Hello ' } }) + '\n',
      JSON.stringify({ message: { content: '<think>ignore</think>World' } }) + '\n',
    ]
    const stream = new ReadableStream({
      start(controller) {
        for (const l of lines) controller.enqueue(new TextEncoder().encode(l))
        controller.close()
      },
    })
    return new Response(stream, { status: 200 })
  }

  const full = await ollamaStream('hi', 'deepseek-r1:7b')
  assert.equal(full, 'Hello World')

  globalThis.fetch = prevFetch
})

