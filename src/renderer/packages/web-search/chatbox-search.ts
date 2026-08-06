import type { SearchResult } from '@shared/types'
import WebSearch from './base'

export class ChatboxSearch extends WebSearch {
  override supportsParseLink = false

  constructor(_licenseKey: string) {
    super()
  }

  async search(_query: string, _signal?: AbortSignal): Promise<SearchResult> {
    return { items: [] }
  }
}
