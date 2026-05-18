type Msg = { role: string; content: string }

// Test-controlled responses (set from tests via globalThis).
function nextResult(): string {
  const g: any = globalThis as any
  return typeof g.__TEST_OLLAMA_RESULT__ === 'string' ? g.__TEST_OLLAMA_RESULT__ : ''
}

export async function callOllama(_messages: Msg[], _systemPrompt?: string, _model?: string): Promise<string> {
  return nextResult()
}

