import { settings as defaultSettings } from '@shared/defaults'
import { ModelProviderEnum, ModelProviderType, type Settings } from '@shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getModelManifestMock } = vi.hoisted(() => ({
  getModelManifestMock: vi.fn(),
}))

vi.mock('@/packages/remote', () => ({ getModelManifest: getModelManifestMock }))
vi.mock('@/platform', () => ({ default: { type: 'desktop' } }))
vi.mock('@/stores/settingsStore', () => ({ settingsStore: { getState: vi.fn() } }))
vi.mock('@/lib/utils', () => ({ getLogger: () => ({ error: vi.fn() }) }))

import { getAvailableImageModels } from './image-model-catalog'

function createSettings(): Settings {
  return defaultSettings()
}

describe('image model catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not load the removed Chatbox manifest', async () => {
    const settings = createSettings()
    settings.licenseKey = 'license'

    await expect(getAvailableImageModels(settings)).resolves.toEqual([])
    expect(getModelManifestMock).not.toHaveBeenCalled()
  })

  it('merges remote and manual models for configured built-in and custom providers', async () => {
    const settings = createSettings()
    settings.providers = {
      [ModelProviderEnum.Gemini]: {
        apiKey: 'gemini-key',
        models: [{ modelId: 'gemini-remote', type: 'image', nickname: 'Manual Gemini Name' }],
      },
      [ModelProviderEnum.OpenAI]: {
        apiKey: 'openai-key',
        models: [{ modelId: 'openai-manual', type: 'image', nickname: 'Manual OpenAI' }],
      },
      'custom-provider-gemini': {
        models: [{ modelId: 'custom-image', type: 'image', nickname: 'Custom Image' }],
      },
    }
    settings.customProviders = [
      {
        id: 'custom-provider-gemini',
        name: 'Custom Gemini',
        type: ModelProviderType.Gemini,
        isCustom: true,
      },
    ]
    await expect(getAvailableImageModels(settings)).resolves.toEqual([
      { provider: ModelProviderEnum.Gemini, modelId: 'gemini-remote', nickname: 'Manual Gemini Name' },
      { provider: 'custom-provider-gemini', modelId: 'custom-image', nickname: 'Custom Image' },
      { provider: ModelProviderEnum.OpenAI, modelId: 'openai-manual', nickname: 'Manual OpenAI' },
    ])
    expect(getModelManifestMock).not.toHaveBeenCalled()
  })

  it('omits unconfigured providers', async () => {
    const settings = createSettings()

    await expect(getAvailableImageModels(settings)).resolves.toEqual([])
    expect(getModelManifestMock).not.toHaveBeenCalled()
  })

  it('keeps manually configured image models without a manifest request', async () => {
    const settings = createSettings()
    settings.providers = {
      [ModelProviderEnum.OpenAI]: {
        apiKey: 'openai-key',
        models: [{ modelId: 'manual-only', type: 'image', nickname: 'Manual Only' }],
      },
    }
    await expect(getAvailableImageModels(settings)).resolves.toEqual([
      { provider: ModelProviderEnum.OpenAI, modelId: 'manual-only', nickname: 'Manual Only' },
    ])
    expect(getModelManifestMock).not.toHaveBeenCalled()
  })
})
