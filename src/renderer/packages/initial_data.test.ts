import { describe, expect, it } from 'vitest'
import { defaultSessionsForCN, defaultSessionsForEN, historicalDefaultSessionIds } from './initial_data'

describe('first-run session templates', () => {
  it('creates only one English chat for a new profile', () => {
    expect(defaultSessionsForEN).toHaveLength(1)
    expect(defaultSessionsForEN[0]).toMatchObject({
      id: 'justchat-b612-406a-985b-3ab4d2c482ff',
      name: 'Just chat',
      type: 'chat',
      starred: true,
    })
    expect(defaultSessionsForEN[0].messages).toHaveLength(1)
    expect(defaultSessionsForEN[0].messages[0].role).toBe('system')
  })

  it('uses the same single chat for a Chinese new profile', () => {
    expect(defaultSessionsForCN).toHaveLength(1)
    expect(defaultSessionsForCN[0]).toBe(defaultSessionsForEN[0])
  })

  it('retains historical template IDs for migration compatibility', () => {
    expect(historicalDefaultSessionIds).toContain('justchat-b612-406a-985b-3ab4d2c482ff')
    expect(historicalDefaultSessionIds).toContain('81cfc426-48b4-4a13-ad42-bfcfc4544299')
    expect(historicalDefaultSessionIds).toContain('776eac23-7b4a-40da-91cd-f233bb4742ed')
  })
})
