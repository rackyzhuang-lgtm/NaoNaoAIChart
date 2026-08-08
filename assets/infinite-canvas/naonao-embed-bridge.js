(function () {
  'use strict'

  var agentUrl = new URLSearchParams(window.location.search).get('agentUrl')
  var agentToken = new URLSearchParams(window.location.search).get('agentToken')
  var volatileAgentSettings = {}
  if (agentUrl && agentToken) {
    try {
      var parsedAgentUrl = new URL(agentUrl)
      if (parsedAgentUrl.protocol === 'http:' && parsedAgentUrl.hostname === '127.0.0.1') {
        volatileAgentSettings['canvas-agent-url'] = parsedAgentUrl.toString().replace(/\/$/, '')
        volatileAgentSettings['canvas-agent-token'] = agentToken
        var storageGetItem = Storage.prototype.getItem
        var storageSetItem = Storage.prototype.setItem
        Storage.prototype.getItem = function (key) {
          if (Object.prototype.hasOwnProperty.call(volatileAgentSettings, key)) return volatileAgentSettings[key]
          return storageGetItem.call(this, key)
        }
        Storage.prototype.setItem = function (key, value) {
          if (Object.prototype.hasOwnProperty.call(volatileAgentSettings, key)) return
          return storageSetItem.call(this, key, value)
        }
      }
    } catch (_) {}
  }

  var allowedOrigins = {
    'https://naonaoai.shop': 'naonaoai.shop',
    'https://eazyai.shop': 'eazyai.shop',
  }

  function resolveUrl(input) {
    var raw = typeof input === 'string' ? input : input && input.url
    if (!raw) return { kind: 'passthrough' }
    try {
      var target = new URL(raw, window.location.href)
      if (target.origin === window.location.origin) return { kind: 'passthrough' }
      var alias = allowedOrigins[target.origin]
      if (alias) return { kind: 'proxy', url: '/_naonao_proxy/' + alias + target.pathname + target.search }
      if (target.protocol === 'http:' || target.protocol === 'https:') return { kind: 'blocked' }
      return { kind: 'passthrough' }
    } catch (_) {
      return { kind: 'blocked' }
    }
  }

  var originalFetch = window.fetch.bind(window)
  window.fetch = function (input, init) {
    var resolved = resolveUrl(input)
    if (resolved.kind === 'blocked') return Promise.reject(new TypeError('External canvas requests are not permitted'))
    if (resolved.kind === 'passthrough') return originalFetch(input, init)
    if (typeof input === 'string') return originalFetch(resolved.url, init)
    return originalFetch(new Request(resolved.url, input), init)
  }

  var originalOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function (method, url) {
    var resolved = resolveUrl(url)
    if (resolved.kind === 'blocked') throw new DOMException('External canvas requests are not permitted', 'SecurityError')
    var args = Array.prototype.slice.call(arguments)
    if (resolved.kind === 'proxy') args[1] = resolved.url
    return originalOpen.apply(this, args)
  }
})()
