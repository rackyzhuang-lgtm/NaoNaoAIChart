import { describe, expect, it } from 'vitest'
import { classifyInfiniteCanvasModels, inferInfiniteCanvasModelCapability } from './canvas-model-capability'

describe('Infinite Canvas model capability classification', () => {
  it.each([
    ['gpt-image-2', 'image'],
    ['seedance-2.0', 'video'],
    ['gpt-4o-mini-tts', 'audio'],
    ['gpt-5.6-sol', 'text'],
    ['gpt-5.6-terra', 'text'],
    ['gpt-5.5', 'text'],
    ['codex-auto-review', 'text'],
  ] as const)('classifies %s as %s', (id, capability) => {
    expect(inferInfiniteCanvasModelCapability({ id })).toBe(capability)
  })

  it('prefers explicit service metadata over the model name', () => {
    expect(inferInfiniteCanvasModelCapability({ id: 'custom-model', modality: 'image_generation' })).toBe('image')
    expect(inferInfiniteCanvasModelCapability({ id: 'image-looking-name', capabilities: ['chat'] })).toBe('text')
  })

  it('trims IDs and removes duplicates while preserving order', () => {
    expect(classifyInfiniteCanvasModels([{ id: ' gpt-image-2 ' }, { id: 'gpt-image-2' }, { id: 'gpt-5.5' }])).toEqual([
      { id: 'gpt-image-2', capability: 'image' },
      { id: 'gpt-5.5', capability: 'text' },
    ])
  })
})
