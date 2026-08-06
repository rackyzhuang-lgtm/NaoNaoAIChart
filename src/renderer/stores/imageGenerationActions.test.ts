import { beforeEach, describe, expect, it, vi } from 'vitest'

const createRecordMock = vi.fn()

vi.mock('./imageGenerationStore', () => ({
  imageGenerationStore: {
    getState: () => ({
      currentGeneratingId: null,
      currentRecordId: null,
      setCurrentGeneratingId: vi.fn(),
      setCurrentRecordId: vi.fn(),
    }),
  },
  createRecord: (...args: unknown[]) => createRecordMock(...args),
  updateRecord: vi.fn(),
  addGeneratedImage: vi.fn(),
  IMAGE_GEN_LIST_QUERY_KEY: 'image-gen-list',
  IMAGE_GEN_QUERY_KEY: 'image-gen',
}))

vi.mock('./queryClient', () => ({
  queryClient: {
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
  },
}))

vi.mock('@/packages/remote', () => ({
  IMAGE_GENERATION_POLL_INTERVAL_MS: 2_000,
  submitImageGeneration: vi.fn(),
  pollTaskUntilComplete: vi.fn(),
  pollImageTask: vi.fn(),
}))

vi.mock('@/lib/utils', () => ({ getLogger: () => ({ debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() }) }))
vi.mock('@/utils/track', () => ({ trackEvent: vi.fn() }))
vi.mock('./settingsStore', () => ({ settingsStore: { getState: () => ({ licenseKey: 'legacy-key' }) } }))
vi.mock('@/adapters', () => ({ createModelDependencies: vi.fn() }))
vi.mock('@/platform', () => ({ default: {} }))
vi.mock('@/storage', () => ({ default: {} }))
vi.mock('@/storage/StoreStorage', () => ({ StorageKeyGenerator: {} }))

describe('imageGenerationActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects the removed Chatbox AI image generation path before creating a record', async () => {
    const { createAndGenerate } = await import('./imageGenerationActions')

    await expect(
      createAndGenerate({
        prompt: 'make an image',
        referenceImages: [],
        model: { provider: 'chatbox-ai', modelId: 'gpt-image-1' },
      })
    ).rejects.toThrow('Chatbox AI image generation is unavailable')
    expect(createRecordMock).not.toHaveBeenCalled()
  })
})
