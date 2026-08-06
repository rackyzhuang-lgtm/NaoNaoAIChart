import { describe, expect, it } from 'vitest'

const enabled = process.env.RUN_SUB2API_STREAM_TESTS === '1'
const apiKey = process.env.SUB2API_TEST_API_KEY
const model = process.env.SUB2API_TEST_MODEL
const baseUrl = process.env.SUB2API_TEST_BASE_URL || 'https://naonaoai.shop'
const describeLive = enabled ? describe : describe.skip

describeLive('Sub2API live streaming contract', () => {
  it('is opt-in and validates a real SSE response', async () => {
    if (!apiKey || !model) {
      throw new Error('RUN_SUB2API_STREAM_TESTS=1 requires SUB2API_TEST_API_KEY and SUB2API_TEST_MODEL')
    }

    const endpoint = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with exactly the word OK.' }],
        max_tokens: 8,
        stream: true,
      }),
    })

    expect(response.ok).toBe(true)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const body = await response.text()
    expect(body).toContain('data:')
    expect(body).toContain('[DONE]')
  })
})
