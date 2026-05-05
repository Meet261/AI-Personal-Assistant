const OLLAMA_BASE = 'http://localhost:11434'

export type OllamaModel = 'deepseek-r1:7b'

export async function ollamaChat(
  prompt: string,
  model: OllamaModel = 'deepseek-r1:7b',
  systemPrompt?: string
): Promise<string> {
  const messages = []
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
  messages.push({ role: 'user', content: prompt })

  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false }),
  })

  if (!res.ok) throw new Error(`Ollama error: ${res.statusText}`)
  const data = await res.json()
  // Strip <think>...</think> blocks from DeepSeek R1 reasoning
  return data.message.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
}

export async function ollamaStream(
  prompt: string,
  model: OllamaModel = 'deepseek-r1:7b',
  systemPrompt?: string,
  onChunk?: (text: string) => void
): Promise<string> {
  const messages = []
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
  messages.push({ role: 'user', content: prompt })

  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true }),
  })

  if (!res.ok) throw new Error(`Ollama error: ${res.statusText}`)

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const lines = decoder.decode(value).split('\n').filter(Boolean)
    for (const line of lines) {
      try {
        const json = JSON.parse(line)
        if (json.message?.content) {
          full += json.message.content
          onChunk?.(json.message.content)
        }
      } catch {}
    }
  }

  return full.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
}
