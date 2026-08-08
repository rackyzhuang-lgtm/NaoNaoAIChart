import { describe, expect, it } from 'vitest'
import { FEATURED_PROVIDER_IDS } from '../../renderer/components/settings/provider/providerIcons'
import { SystemProviders } from '../defaults'
import { AIModelProviderMenuOptionList } from '../models'
import { ModelProviderEnum } from '../types'
import { filterVisibleProviders, HIDDEN_PROVIDER_IDS, isProviderVisible } from './visibility'

describe('provider visibility', () => {
  it('hides the retired providers from the shared provider menu', () => {
    const menuProviderIds = AIModelProviderMenuOptionList.map((option) => option.value)

    expect(menuProviderIds).not.toEqual(expect.arrayContaining([...HIDDEN_PROVIDER_IDS]))
    expect(menuProviderIds).toContain(ModelProviderEnum.OpenAI)
  })

  it('hides the retired providers from featured and system provider choices', () => {
    const systemProviderIds = SystemProviders().map((provider) => provider.id)
    const visibleProviderIds = filterVisibleProviders(SystemProviders()).map((provider) => provider.id)

    expect(FEATURED_PROVIDER_IDS).not.toEqual(expect.arrayContaining([...HIDDEN_PROVIDER_IDS]))
    expect(visibleProviderIds).not.toEqual(expect.arrayContaining([...HIDDEN_PROVIDER_IDS]))
    expect(systemProviderIds).toEqual(expect.arrayContaining([...HIDDEN_PROVIDER_IDS]))
    expect(isProviderVisible(ModelProviderEnum.DeepSeek)).toBe(true)
  })
})
