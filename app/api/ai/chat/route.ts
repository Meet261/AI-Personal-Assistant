import { NextRequest } from 'next/server'

const OLLAMA_BASE = 'http://localhost:11434'

export async function POST(req: NextRequest) {
  const { messages, model = 'deepseek-r1:7b', systemPrompt } = await req.json()

  const ollamaMessages = []
  if (systemPrompt) ollamaMessages.push({ role: 'system', content: systemPrompt })
  ollamaMessages.push(...messages)

  const ollamaRes = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: ollamaMessages, stream: true }),
  })

  if (!ollamaRes.ok) {
    return new Response(JSON.stringify({ error: 'Ollama not reachable' }), { status: 502 })
  }

  // Stream the response back to the client
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const reader = ollamaRes.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let inThinkBlock = false
      let jsonBuf = ''   // buffer partial JSONL lines across TCP chunks

      while (true) {
        const { done, value } = await reader.read()
        if (done) { controller.close(); break }

        jsonBuf += decoder.decode(value, { stream: true })
        const rawLines = jsonBuf.split('\n')
        jsonBuf = rawLines.pop() ?? ''
        const lines = rawLines.filter(Boolean)
        for (const line of lines) {
          try {
            const json = JSON.parse(line)
            let chunk: string = json.message?.content || ''
            if (!chunk) continue

            // Strip <think>…</think> blocks (DeepSeek R1 reasoning)
            buffer += chunk
            let out = ''
            let i = 0
            while (i < buffer.length) {
              if (!inThinkBlock) {
                const start = buffer.indexOf('<think>', i)
                if (start === -1) { out += buffer.slice(i); buffer = ''; break }
                out += buffer.slice(i, start)
                inThinkBlock = true
                i = start + 7
              } else {
                const end = buffer.indexOf('</think>', i)
                if (end === -1) { buffer = buffer.slice(i); i = buffer.length; break }
                inThinkBlock = false
                i = end + 8
              }
            }
            if (out) controller.enqueue(encoder.encode(out))
          } catch {}
        }
      }
    }
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Transfer-Encoding': 'chunked' }
  })
}
