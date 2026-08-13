import { describe, expect, test } from 'vitest'
import { openaiResponsesProvider } from './openai-responses'

describe('OpenAI Responses model catalog', () => {
  test('keeps the GPT-5.6 Sol display name separate from the transmitted model ID', () => {
    const model = openaiResponsesProvider.defaultSettings?.models?.find(
      (candidate) => candidate.modelId === 'gpt-5.6-sol'
    )

    expect(model).toMatchObject({
      modelId: 'gpt-5.6-sol',
      nickname: 'GPT-5.6 Sol',
      capabilities: ['vision', 'tool_use', 'reasoning'],
    })
    expect(openaiResponsesProvider.curatedModelIds?.[0]).toBe('gpt-5.6-sol')
  })
})
