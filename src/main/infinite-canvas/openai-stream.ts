export type OpenAIStreamToolCall = { id: string; name: string; arguments: string }

export type OpenAIStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; call: OpenAIStreamToolCall }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number }

type OpenAIChunk = {
  choices?: Array<{
    delta?: {
      content?: string | null
      tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }>
    }
  }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

/** Parses OpenAI-compatible SSE chunks and assembles split function call arguments. */
export async function readOpenAIChatCompletionStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: OpenAIStreamEvent) => void,
): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const calls = new Map<number, OpenAIStreamToolCall>()
  let buffered = ''

  const consume = (line: string) => {
    if (!line.startsWith('data:')) return false
    const value = line.slice(5).trim()
    if (!value) return false
    if (value === '[DONE]') return true
    let chunk: OpenAIChunk
    try {
      chunk = JSON.parse(value) as OpenAIChunk
    } catch {
      return false
    }
    if (chunk.usage) onEvent({ type: 'usage', inputTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens })
    for (const choice of chunk.choices || []) {
      const delta = choice.delta
      if (delta?.content) onEvent({ type: 'text', text: delta.content })
      for (const part of delta?.tool_calls || []) {
        const index = part.index ?? calls.size
        const current = calls.get(index) || { id: '', name: '', arguments: '' }
        if (part.id) current.id = part.id
        if (part.function?.name) current.name = part.function.name
        if (part.function?.arguments) current.arguments += part.function.arguments
        calls.set(index, current)
      }
    }
    return false
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      buffered += decoder.decode(value || new Uint8Array(), { stream: !done })
      const lines = buffered.split(/\r?\n/)
      buffered = lines.pop() || ''
      let complete = false
      for (const line of lines) complete ||= consume(line)
      if (done || complete) break
    }
  } finally {
    reader.releaseLock()
  }

  for (const call of calls.values()) {
    if (call.id && call.name) onEvent({ type: 'tool-call', call })
  }
}
