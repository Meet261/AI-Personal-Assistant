// Streaming chat endpoint — DeepSeek V3 (replaces previous Ollama streaming)
// Used by the agent chat sidebar for real-time token streaming.
import { NextRequest } from 'next/server'

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'

export async function POST(req: NextRequest) {
  const { messages, systemPrompt } = await req.json()

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'DEEPSEEK_API_KEY not set' }), { status: 400 })
  }

  const chatMessages = []
  if (systemPrompt) chatMessages.push({ role: 'system', content: systemPrompt })
  chatMessages.push(...messages)

  const dsRes = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'deepseek-chat',  // V3
      messages: chatMessages,
      stream: true,
      temperature: 0.3,
      max_tokens: 1500,
    }),
  })

  if (!dsRes.ok) {
    const err = await dsRes.text()
    return new Response(JSON.stringify({ error: `DeepSeek error: ${dsRes.status} ${err}` }), { status: 502 })
  }

  // DeepSeek streams SSE: "data: {json}\n\n" — forward tokens to client
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const reader = dsRes.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) { controller.close(); break }

        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6).trim()
          if (payload === '[DONE]') { controller.close(); return }
          try {
            const json = JSON.parse(payload)
            const chunk: string = json.choices?.[0]?.delta?.content ?? ''
            if (chunk) controller.enqueue(encoder.encode(chunk))
          } catch {}
        }
      }
    }
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Transfer-Encoding': 'chunked' }
  })
}
