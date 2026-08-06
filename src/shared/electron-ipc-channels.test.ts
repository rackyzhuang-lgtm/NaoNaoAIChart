import { describe, expect, test } from 'vitest'
import { assertRendererInvokeChannel } from './electron-ipc-channels'
import { SUB2API_IPC_CHANNELS } from './sub2api/ipc'

describe('renderer IPC channel allowlist', () => {
  test('allows existing compatibility channels', () => {
    expect(() => assertRendererInvokeChannel('getVersion')).not.toThrow()
    expect(() => assertRendererInvokeChannel('sandbox:exec-code')).not.toThrow()
    expect(() => assertRendererInvokeChannel('oauth:login')).not.toThrow()
  })

  test('rejects unknown and sub2api business channels', () => {
    expect(() => assertRendererInvokeChannel('future:unreviewed-handler')).toThrow('not allowed')
    expect(() => assertRendererInvokeChannel(SUB2API_IPC_CHANNELS.login)).toThrow('not allowed')
  })
})
