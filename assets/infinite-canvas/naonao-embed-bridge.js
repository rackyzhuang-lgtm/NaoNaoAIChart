(function () {
  'use strict'

  try {
    var themeState = JSON.parse(localStorage.getItem('infinite-canvas:theme_store') || '{}')
    var theme = themeState.state && themeState.state.theme === 'light' ? 'light' : 'dark'
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
  } catch (_) {}

  var agentUrl = new URLSearchParams(window.location.search).get('agentUrl')
  var agentToken = new URLSearchParams(window.location.search).get('agentToken')
  var volatileAgentSettings = {}
  var aiConfigStorageKey = 'infinite-canvas:ai_config_store'
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

  function importAiConfig(message) {
    function reply(ok, error) {
      window.parent.postMessage(
        { type: 'naonao-import-ai-config-result', requestId: message.requestId, ok: ok, error: error || undefined },
        '*'
      )
    }
    function rejectImport(error) {
      reply(false, error)
    }
    var payload = message && message.payload
    if (!payload || typeof payload !== 'object') return rejectImport('Invalid import payload')
    if (!Number.isInteger(payload.keyId) || typeof payload.keyName !== 'string' || typeof payload.apiKey !== 'string') return rejectImport('Invalid API key metadata')
    if (payload.apiKey.length < 1 || payload.apiKey.length > 8000) return rejectImport('Invalid API key')
    if (typeof payload.baseUrl !== 'string') return rejectImport('Invalid Base URL')
    var baseUrl
    try {
      baseUrl = new URL(payload.baseUrl)
      if (baseUrl.protocol !== 'https:' || baseUrl.username || baseUrl.password) return rejectImport('Only public HTTPS Base URLs are supported')
      baseUrl.hash = ''
      baseUrl.search = ''
      baseUrl.pathname = baseUrl.pathname.replace(/\/+$/, '')
    } catch (_) {
      return rejectImport('Invalid Base URL')
    }
    var models = Array.isArray(payload.models)
      ? payload.models.filter(function (model) {
          return model && typeof model.id === 'string' && model.id.length > 0 && model.id.length <= 256 &&
            (model.capability === 'text' || model.capability === 'image' || model.capability === 'video' || model.capability === 'audio')
        }).map(function (model) { return { name: model.id, capability: model.capability } })
      : []
    if (!models.length) return rejectImport('No importable models were returned')
    var marker = String(payload.keyId) + ':' + models.map(function (model) { return model.capability + ':' + model.name }).join('|')
    var stored = {}
    try { stored = JSON.parse(localStorage.getItem(aiConfigStorageKey) || '{}') || {} } catch (_) { return rejectImport('Unable to read the existing Canvas configuration') }
    var config = stored.state && stored.state.config && typeof stored.state.config === 'object' ? stored.state.config : {}
    var channelId = 'naonao-key-' + String(payload.keyId)
    var currentChannel = Array.isArray(config.channels) ? config.channels.find(function (item) { return item && item.id === channelId }) : null
    var currentModels = currentChannel && Array.isArray(currentChannel.models) ? currentChannel.models : []
    var channelUnchanged = currentChannel && currentChannel.name === payload.keyName.slice(0, 100) &&
      currentChannel.baseUrl === baseUrl.toString() && currentChannel.apiKey === payload.apiKey &&
      currentModels.length === models.length && currentModels.every(function (model, index) {
        return model && model.name === models[index].name && model.capability === models[index].capability
      })
    if (localStorage.getItem('naonaoai:last-canvas-import') === marker && channelUnchanged) return reply(true)
    var channel = {
      id: channelId,
      name: payload.keyName.slice(0, 100),
      baseUrl: baseUrl.toString(),
      apiKey: payload.apiKey,
      apiFormat: 'openai',
      models: models,
    }
    var channels = Array.isArray(config.channels) ? config.channels.filter(function (item) { return item && item.id !== channelId }) : []
    channels.push(channel)
    var encoded = models.map(function (model) { return channelId + '::' + model.name })
    var previousModels = Array.isArray(config.models) ? config.models.filter(function (value) {
      return typeof value !== 'string' || value.indexOf(channelId + '::') !== 0
    }) : []
    var nextConfig = Object.assign({}, config, {
      channelMode: 'local',
      baseUrl: channel.baseUrl,
      apiKey: channel.apiKey,
      apiFormat: 'openai',
      channels: channels,
      models: Array.from(new Set(previousModels.concat(encoded))),
    })
    ;['image', 'video', 'text', 'audio'].forEach(function (capability) {
      var index = models.findIndex(function (model) { return model.capability === capability })
      if (index >= 0) nextConfig[capability + 'Model'] = encoded[index]
      else if (typeof nextConfig[capability + 'Model'] === 'string' && nextConfig[capability + 'Model'].indexOf(channelId + '::') === 0) nextConfig[capability + 'Model'] = ''
    })
    nextConfig.model = encoded[0]
    try {
      localStorage.setItem(aiConfigStorageKey, JSON.stringify({ state: Object.assign({}, stored.state, { config: nextConfig }), version: stored.version || 0 }))
      localStorage.setItem('naonaoai:last-canvas-import', marker)
    } catch (_) {
      return rejectImport('Unable to save the Canvas configuration')
    }
    reply(true)
    window.location.reload()
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window.parent) return
    if (!event.data) return
    if (event.data.type === 'naonao-embed-bridge-ping') {
      window.parent.postMessage({ type: 'naonao-embed-bridge-ready' }, '*')
      return
    }
    if (event.data.type === 'naonao-import-ai-config') importAiConfig(event.data)
  })

  window.parent.postMessage({ type: 'naonao-embed-bridge-ready' }, '*')

  function encodeProxyTarget(target) {
    var bytes = new TextEncoder().encode(target.toString())
    var binary = ''
    bytes.forEach(function (byte) { binary += String.fromCharCode(byte) })
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  function resolveUrl(input) {
    var raw = typeof input === 'string' ? input : input && input.url
    if (!raw) return { kind: 'passthrough' }
    try {
      var target = new URL(raw, window.location.href)
      if (target.origin === window.location.origin) return { kind: 'passthrough' }
      if (target.protocol === 'https:') return { kind: 'proxy', url: '/_naonao_proxy/' + encodeProxyTarget(target) }
      if (target.protocol === 'http:') return { kind: 'blocked' }
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
