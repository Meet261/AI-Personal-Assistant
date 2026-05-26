import test from 'node:test'
import assert from 'node:assert/strict'

// Mirrors the SSE token-aggregation logic in app/api/ai/chat/route.ts
function aggregateDeepSeekSSE(chunks: string[]): string {
  let buf = ''
  let full = ''
  const enc = new TextEncoder()
  const dec = new TextDecoder()

  for (const chunk of chunks) {
    buf += dec.decode(enc.encode(chunk))
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (payload === '[DONE]') continue
      try {
        const parsed = JSON.parse(payload)
        const delta = parsed?.choices?.[0]?.delta?.content
        if (delta) full += delta
      } catch { /* incomplete chunk */ }
    }
  }
  return full
}

test('Catalog 5: DeepSeek SSE aggregates tokens across fragmented TCP chunks', () => {
  // Simulate network fragmentation — two SSE events split across three chunks
  const chunks = [
    'data: {"choices":[{"delta":{"content":"Hello "}}]}\n',
    '\ndata: {"choices":[{"delta":{"content":"Wor',
    'ld"}}]}\n\ndata: [DONE]\n',
  ]
  const result = aggregateDeepSeekSSE(chunks)
  assert.equal(result, 'Hello World')
})

test('Catalog 5b: [DONE] sentinel is ignored and does not throw', () => {
  const chunks = [
    'data: {"choices":[{"delta":{"content":"Done"}}]}\n',
    'data: [DONE]\n',
  ]
  const result = aggregateDeepSeekSSE(chunks)
  assert.equal(result, 'Done')
})
