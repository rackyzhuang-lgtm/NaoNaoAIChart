import { getMessageText } from '@shared/utils/message'
import { describe, expect, it } from 'vitest'
import { defaultSessionsForCN, defaultSessionsForEN } from './initial_data'

function visibleMessageText(session: (typeof defaultSessionsForCN)[number]) {
  return session.messages.map((message) => getMessageText(message)).join('\n')
}

describe('first-run session templates', () => {
  it('keeps only the curated English templates', () => {
    expect(defaultSessionsForEN.map((session) => session.name)).toEqual([
      'Just chat',
      'Markdown 101 (Example)',
      'Software Developer (Example)',
      'Translator (Example)',
    ])
    expect(defaultSessionsForEN.filter((session) => session.starred).map((session) => session.name)).toEqual([
      'Just chat',
      'Markdown 101 (Example)',
      'Software Developer (Example)',
    ])
  })

  it('matches the curated Chinese sidebar examples and brand wording', () => {
    expect(defaultSessionsForCN.map((session) => session.name)).toEqual([
      '小红书文案生成器 (示例)',
      '夸夸机 (示例)',
      '翻译助手 (示例)',
      '简单问候',
      '做图表',
      'Just chat',
      'Markdown 101 (Example)',
      'Software Developer (Example)',
      'Translator (Example)',
    ])

    const text = defaultSessionsForCN.map(visibleMessageText).join('\n')
    expect(text).not.toContain('Chatbox')
    expect(text).toContain('NaoNaoAI Chat')
  })
})
