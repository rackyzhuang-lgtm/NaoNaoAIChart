import type { ProviderModelInfo } from '@shared/types'
import type { ChatboxAIModelList } from '@/packages/remote'

/**
 * The legacy hosted catalog is intentionally unavailable. Keeping this hook's
 * shape lets old selector code read historical settings without creating a
 * provider or issuing a network request.
 */
const useChatboxAIModels = () => {
  const emptyModels: ProviderModelInfo[] = []
  return {
    allChatboxAIModels: emptyModels,
    chatboxAIModels: emptyModels,
    chatboxAIImageModels: emptyModels,
    chatboxAIModelList: null as ChatboxAIModelList | null,
    isLoading: false,
    isFetching: false,
    refetch: async () => ({ data: undefined }),
  }
}

export default useChatboxAIModels
