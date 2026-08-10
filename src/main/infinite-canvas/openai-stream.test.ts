import { describe, expect, it } from 'vitest'
import { readOpenAIChatCompletionStream, readOpenAIResponsesStream } from './openai-stream'

function streamFrom(lines: string[]) {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line))
      controller.close()
    },
  })
}

describe('readOpenAIChatCompletionStream', () => {
  it('streams text, usage, and tool calls split across SSE chunks', async () => {
    const events: unknown[] = []
    await readOpenAIChatCompletionStream(
      streamFrom([
        'data: {"choices":[{"delta":{"content":"hello "}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"canvas_apply_ops","arguments":"{\\\"ops\\\":"}}]}}]}\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"[]}"}}]}}],"usage":{"prompt_tokens":3,"completion_tokens":5}}\n\n',
        'data: [DONE]\n\n',
      ]),
      (event) => events.push(event)
    )
    expect(events).toEqual([
      { type: 'text', text: 'hello ' },
      { type: 'usage', inputTokens: 3, outputTokens: 5 },
      { type: 'tool-call', call: { id: 'call_1', name: 'canvas_apply_ops', arguments: '{"ops":[]}' } },
    ])
  })
})

describe('readOpenAIResponsesStream', () => {
  it('streams text, usage, and function calls from Responses events', async () => {
    const events: unknown[] = []
    await readOpenAIResponsesStream(
      streamFrom([
        'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"hello"}\n\n',
        'event: response.output_item.added\ndata: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"canvas_apply_ops","arguments":""}}\n\n',
        'event: response.function_call_arguments.delta\ndata: {"type":"response.function_call_arguments.delta","item_id":"fc_1","delta":"{\\"ops\\":"}\n\n',
        'event: response.function_call_arguments.done\ndata: {"type":"response.function_call_arguments.done","item_id":"fc_1","arguments":"{\\"ops\\":[]}"}\n\n',
        'event: response.completed\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":3,"output_tokens":5}}}\n\n',
      ]),
      (event) => events.push(event)
    )
    expect(events).toEqual([
      { type: 'text', text: 'hello' },
      { type: 'usage', inputTokens: 3, outputTokens: 5 },
      { type: 'tool-call', call: { id: 'call_1', name: 'canvas_apply_ops', arguments: '{"ops":[]}' } },
    ])
  })
})
