import crypto from 'node:crypto'

export type CanvasSnapshot = {
  projectId?: string
  title?: string
  nodes?: Array<{
    id: string
    type: string
    title: string
    position: { x: number; y: number }
    width: number
    height: number
    metadata?: Record<string, unknown>
  }>
  connections?: Array<{ id: string; fromNodeId: string; toNodeId: string }>
  selectedNodeIds?: string[]
  viewport?: { x: number; y: number; k: number }
  [key: string]: unknown
}

type ToolDefinition = { type: 'function'; name: string; description: string; parameters: Record<string, unknown> }
type ToolName =
  | 'canvas_get_state'
  | 'canvas_get_selection'
  | 'canvas_export_snapshot'
  | 'canvas_apply_ops'
  | 'canvas_create_node'
  | 'canvas_create_text_node'
  | 'canvas_create_text_nodes'
  | 'canvas_create_config_node'
  | 'canvas_create_image_prompt_flow'
  | 'canvas_create_generation_flow'
  | 'canvas_generate_text'
  | 'canvas_generate_image'
  | 'canvas_generate_video'
  | 'canvas_generate_audio'
  | 'canvas_update_node'
  | 'canvas_update_node_text'
  | 'canvas_move_nodes'
  | 'canvas_resize_node'
  | 'canvas_delete_nodes'
  | 'canvas_connect_nodes'
  | 'canvas_select_nodes'
  | 'canvas_set_viewport'
  | 'canvas_run_generation'

const nodeTypes = ['image', 'text', 'config', 'video', 'audio'] as const
const modes = ['text', 'image', 'video', 'audio'] as const
const object = { type: 'object', additionalProperties: false } as const
const string = { type: 'string' } as const
const number = { type: 'number' } as const
const modeSchema = { type: 'string', enum: [...modes] }
const viewportSchema = {
  type: 'object',
  properties: { x: number, y: number, k: number },
  required: ['x', 'y', 'k'],
  additionalProperties: false,
}
const generationProperties = {
  model: string,
  size: string,
  quality: string,
  count: number,
  seconds: string,
  vquality: string,
  generateAudio: string,
  watermark: string,
  audioVoice: string,
  audioFormat: string,
  audioSpeed: string,
  audioInstructions: string,
}

const definitions: Array<[ToolName, string, Record<string, unknown>]> = [
  ['canvas_get_state', 'Read the current canvas nodes, connections, selection, and viewport.', object],
  ['canvas_get_selection', 'Read the nodes currently selected on the canvas.', object],
  ['canvas_export_snapshot', 'Read a compact snapshot of the current canvas layout.', object],
  [
    'canvas_apply_ops',
    'Propose a batch of canvas operations. The user approves writes before they are applied.',
    {
      ...object,
      properties: { ops: { type: 'array', items: { type: 'object' } } },
      required: ['ops'],
    },
  ],
  [
    'canvas_create_node',
    'Create a text, image, config, video, or audio node.',
    {
      ...object,
      properties: {
        nodeType: { type: 'string', enum: [...nodeTypes] },
        title: string,
        x: number,
        y: number,
        width: number,
        height: number,
        metadata: { type: 'object' },
      },
      required: ['nodeType'],
    },
  ],
  [
    'canvas_create_text_node',
    'Create one text node on the current canvas.',
    {
      ...object,
      properties: { text: string, title: string, x: number, y: number, width: number, height: number },
      required: ['text'],
    },
  ],
  [
    'canvas_create_text_nodes',
    'Create multiple text nodes on the current canvas.',
    {
      ...object,
      properties: {
        items: { type: 'array', minItems: 1, items: { type: 'object' } },
        x: number,
        y: number,
        gap: number,
        direction: { type: 'string', enum: ['row', 'column'] },
      },
      required: ['items'],
    },
  ],
  [
    'canvas_create_config_node',
    'Create a generation configuration node, optionally triggering it.',
    {
      ...object,
      properties: {
        prompt: string,
        mode: modeSchema,
        title: string,
        x: number,
        y: number,
        width: number,
        height: number,
        autoRun: { type: 'boolean' },
        ...generationProperties,
      },
    },
  ],
  [
    'canvas_create_image_prompt_flow',
    'Create a prompt node and image generation config connected together.',
    {
      ...object,
      properties: { prompt: string, x: number, y: number, autoRun: { type: 'boolean' }, ...generationProperties },
      required: ['prompt'],
    },
  ],
  [
    'canvas_create_generation_flow',
    'Create a prompt and generation config flow, with optional reference nodes.',
    {
      ...object,
      properties: {
        prompt: string,
        title: string,
        x: number,
        y: number,
        referenceNodeIds: { type: 'array', items: string },
        mode: modeSchema,
        autoRun: { type: 'boolean' },
        ...generationProperties,
      },
      required: ['prompt'],
    },
  ],
  ['canvas_generate_text', 'Create and immediately run a text generation flow.', generationFlowSchema('text')],
  ['canvas_generate_image', 'Create and immediately run an image generation flow.', generationFlowSchema('image')],
  ['canvas_generate_video', 'Create and immediately run a video generation flow.', generationFlowSchema('video')],
  ['canvas_generate_audio', 'Create and immediately run an audio generation flow.', generationFlowSchema('audio')],
  [
    'canvas_update_node',
    'Update a node fields or metadata.',
    {
      ...object,
      properties: { id: string, patch: { type: 'object' }, metadata: { type: 'object' } },
      required: ['id'],
    },
  ],
  [
    'canvas_update_node_text',
    'Update a text node content and optional title.',
    {
      ...object,
      properties: { id: string, text: string, title: string },
      required: ['id', 'text'],
    },
  ],
  [
    'canvas_move_nodes',
    'Move nodes with absolute coordinates or dx/dy offsets.',
    {
      ...object,
      properties: { items: { type: 'array', minItems: 1, items: { type: 'object' } } },
      required: ['items'],
    },
  ],
  [
    'canvas_resize_node',
    'Resize one node.',
    {
      ...object,
      properties: { id: string, width: number, height: number, freeResize: { type: 'boolean' } },
      required: ['id', 'width', 'height'],
    },
  ],
  [
    'canvas_delete_nodes',
    'Delete nodes and their connected edges.',
    {
      ...object,
      properties: { ids: { type: 'array', minItems: 1, items: string } },
      required: ['ids'],
    },
  ],
  [
    'canvas_connect_nodes',
    'Connect pairs of nodes.',
    {
      ...object,
      properties: { connections: { type: 'array', minItems: 1, items: { type: 'object' } } },
      required: ['connections'],
    },
  ],
  [
    'canvas_select_nodes',
    'Set the current canvas selection.',
    {
      ...object,
      properties: { ids: { type: 'array', items: string } },
      required: ['ids'],
    },
  ],
  [
    'canvas_set_viewport',
    'Set the canvas viewport transform.',
    { ...object, properties: { viewport: viewportSchema }, required: ['viewport'] },
  ],
  [
    'canvas_run_generation',
    'Trigger generation for an existing node.',
    {
      ...object,
      properties: { nodeId: string, mode: modeSchema, prompt: string },
      required: ['nodeId'],
    },
  ],
]

function generationFlowSchema(mode: string) {
  return {
    ...object,
    properties: {
      prompt: string,
      title: string,
      x: number,
      y: number,
      referenceNodeIds: { type: 'array', items: string },
      ...generationProperties,
    },
    required: ['prompt'],
    description: `mode=${mode}`,
  }
}

export const CANVAS_AGENT_TOOL_DEFINITIONS: ToolDefinition[] = definitions.map(([name, description, parameters]) => ({
  type: 'function',
  name,
  description,
  parameters,
}))
export const CANVAS_AGENT_TOOL_NAMES = new Set<string>(definitions.map(([name]) => name))

export function parseCanvasToolInput(name: string, value: Record<string, unknown>): Record<string, unknown> {
  if (!CANVAS_AGENT_TOOL_NAMES.has(name)) return value
  const requireString = (key: string) => {
    if (typeof value[key] !== 'string' || !(value[key] as string).trim())
      throw new Error(`Invalid ${name} input: ${key} is required`)
  }
  const requireArray = (key: string, min = 0) => {
    if (!Array.isArray(value[key]) || value[key].length < min)
      throw new Error(`Invalid ${name} input: ${key} is required`)
  }
  if (name === 'canvas_apply_ops') requireArray('ops')
  if (name === 'canvas_apply_ops') {
    for (const op of value.ops as unknown[]) {
      if (!op || typeof op !== 'object' || Array.isArray(op) || typeof (op as { type?: unknown }).type !== 'string')
        throw new Error('Invalid canvas_apply_ops input: each op requires type')
      const type = (op as { type: string }).type
      if (
        ![
          'add_node',
          'update_node',
          'delete_node',
          'delete_connections',
          'connect_nodes',
          'set_viewport',
          'select_nodes',
          'run_generation',
        ].includes(type)
      )
        throw new Error(`Invalid canvas_apply_ops input: unsupported op ${type}`)
      if (type === 'update_node' && typeof (op as { id?: unknown }).id !== 'string')
        throw new Error('Invalid canvas_apply_ops input: update_node id is required')
      if (
        type === 'delete_node' &&
        !Array.isArray((op as { ids?: unknown }).ids) &&
        typeof (op as { id?: unknown }).id !== 'string'
      )
        throw new Error('Invalid canvas_apply_ops input: delete_node id is required')
      if (
        type === 'connect_nodes' &&
        (typeof (op as { fromNodeId?: unknown }).fromNodeId !== 'string' ||
          typeof (op as { toNodeId?: unknown }).toNodeId !== 'string')
      )
        throw new Error('Invalid canvas_apply_ops input: connection endpoints are required')
      if (type === 'run_generation' && typeof (op as { nodeId?: unknown }).nodeId !== 'string')
        throw new Error('Invalid canvas_apply_ops input: run_generation nodeId is required')
      if (type === 'set_viewport') {
        const viewport = (op as { viewport?: Record<string, unknown> }).viewport
        if (!viewport || !['x', 'y', 'k'].every((key) => typeof viewport[key] === 'number'))
          throw new Error('Invalid canvas_apply_ops input: viewport')
      }
      if (type === 'select_nodes' && !Array.isArray((op as { ids?: unknown }).ids))
        throw new Error('Invalid canvas_apply_ops input: select ids')
    }
  }
  if (name === 'canvas_create_node') {
    requireString('nodeType')
    if (!nodeTypes.includes(value.nodeType as (typeof nodeTypes)[number]))
      throw new Error(`Invalid ${name} input: nodeType`)
  }
  if (name === 'canvas_create_text_node') requireString('text')
  if (name === 'canvas_create_text_nodes') requireArray('items', 1)
  if (
    name === 'canvas_create_image_prompt_flow' ||
    name === 'canvas_create_generation_flow' ||
    name.startsWith('canvas_generate_')
  )
    requireString('prompt')
  if (name === 'canvas_update_node' || name === 'canvas_update_node_text' || name === 'canvas_resize_node')
    requireString('id')
  if (name === 'canvas_update_node_text') requireString('text')
  if (name === 'canvas_delete_nodes' || name === 'canvas_move_nodes' || name === 'canvas_connect_nodes')
    requireArray(name === 'canvas_move_nodes' ? 'items' : name === 'canvas_connect_nodes' ? 'connections' : 'ids', 1)
  if (name === 'canvas_select_nodes') requireArray('ids')
  if (name === 'canvas_set_viewport') {
    const viewport = value.viewport as Record<string, unknown> | undefined
    if (!viewport || !['x', 'y', 'k'].every((key) => typeof viewport[key] === 'number'))
      throw new Error(`Invalid ${name} input: viewport`)
  }
  if (name === 'canvas_run_generation') requireString('nodeId')
  return value
}

export function compactCanvasSnapshot(snapshot: CanvasSnapshot | undefined) {
  if (!snapshot) return { hasCanvas: false }
  return {
    ...snapshot,
    nodes: (snapshot.nodes || []).map((node) => {
      const metadata = { ...(node.metadata || {}) }
      if (typeof metadata.content === 'string' && metadata.content.length > 240)
        metadata.content = `${metadata.content.slice(0, 120)}...`
      if (Array.isArray(metadata.images))
        metadata.images = metadata.images.map((image) => ({
          ...(image as Record<string, unknown>),
          content: undefined,
        }))
      return { ...node, metadata }
    }),
  }
}

export function buildCanvasToolRequest(name: string, input: Record<string, unknown>, state?: CanvasSnapshot) {
  if (name === 'canvas_apply_ops') return { name, input }
  if (name === 'canvas_get_state' || name === 'canvas_get_selection' || name === 'canvas_export_snapshot') return null
  const op = (ops: unknown[]) => ({ name: 'canvas_apply_ops', input: { ops } })
  if (name === 'canvas_create_node')
    return op([
      {
        type: 'add_node',
        nodeType: input.nodeType,
        title: input.title,
        position: { x: input.x ?? nextCanvasX(state), y: input.y ?? 0 },
        width: input.width,
        height: input.height,
        metadata: input.metadata,
      },
    ])
  if (name === 'canvas_create_text_node')
    return op([textNodeOp(input, Number(input.x ?? nextCanvasX(state)), Number(input.y ?? 0))])
  if (name === 'canvas_create_text_nodes') {
    const items = input.items as Array<Record<string, unknown>>
    const x = Number(input.x ?? nextCanvasX(state))
    const y = Number(input.y ?? 0)
    const gap = Number(input.gap ?? 40)
    const row = input.direction === 'row'
    return op(
      items.map((item, index) =>
        textNodeOp(
          item,
          Number(item.x ?? (row ? x + index * (340 + gap) : x)),
          Number(item.y ?? (row ? y : y + index * (240 + gap)))
        )
      )
    )
  }
  if (name === 'canvas_create_config_node') {
    const id = `config-${crypto.randomUUID()}`
    const mode = generationMode(input.mode)
    const prompt = String(input.prompt || '')
    return op([
      {
        type: 'add_node',
        id,
        nodeType: 'config',
        title: input.title || generationTitle(mode),
        position: { x: Number(input.x ?? nextCanvasX(state)), y: Number(input.y ?? 0) },
        width: input.width,
        height: input.height,
        metadata: configMetadata(input, mode, prompt),
      },
      ...(input.autoRun ? [{ type: 'run_generation', nodeId: id, mode, prompt }] : []),
    ])
  }
  if (
    name === 'canvas_create_image_prompt_flow' ||
    name === 'canvas_create_generation_flow' ||
    name.startsWith('canvas_generate_')
  ) {
    const mode =
      name === 'canvas_create_image_prompt_flow'
        ? 'image'
        : name.startsWith('canvas_generate_')
          ? name.replace('canvas_generate_', '')
          : generationMode(input.mode)
    const prompt = String(input.prompt || '')
    const x = Number(input.x ?? nextCanvasX(state))
    const y = Number(input.y ?? 0)
    const textId = `text-${crypto.randomUUID()}`
    const configId = `config-${crypto.randomUUID()}`
    const refs = Array.isArray(input.referenceNodeIds)
      ? input.referenceNodeIds.filter((id): id is string => typeof id === 'string')
      : []
    const tokens = [`@[node:${textId}]`, ...refs.map((id) => `@[node:${id}]`)]
    return op([
      { ...textNodeOp({ text: prompt, title: input.title || '提示词' }, x, y), id: textId },
      {
        type: 'add_node',
        id: configId,
        nodeType: 'config',
        title: generationTitle(generationMode(mode)),
        position: { x: x + 420, y },
        metadata: configMetadata(input, generationMode(mode), tokens.join('\n')),
      },
      { type: 'connect_nodes', fromNodeId: textId, toNodeId: configId },
      ...refs.map((fromNodeId) => ({ type: 'connect_nodes', fromNodeId, toNodeId: configId })),
      { type: 'select_nodes', ids: [configId] },
      ...(name.startsWith('canvas_generate_') || input.autoRun
        ? [{ type: 'run_generation', nodeId: configId, mode: generationMode(mode), prompt: tokens.join('\n') }]
        : []),
    ])
  }
  if (name === 'canvas_update_node')
    return op([{ type: 'update_node', id: input.id, patch: input.patch, metadata: input.metadata }])
  if (name === 'canvas_update_node_text')
    return op([
      {
        type: 'update_node',
        id: input.id,
        patch: input.title ? { title: input.title } : undefined,
        metadata: { content: input.text, status: 'success' },
      },
    ])
  if (name === 'canvas_move_nodes')
    return op(
      (input.items as Array<Record<string, unknown>>).map((item) => {
        const current = (state?.nodes || []).find((node) => node.id === item.id)
        return {
          type: 'update_node',
          id: item.id,
          patch: {
            position: {
              x: item.x ?? (current?.position.x || 0) + Number(item.dx || 0),
              y: item.y ?? (current?.position.y || 0) + Number(item.dy || 0),
            },
          },
        }
      })
    )
  if (name === 'canvas_resize_node')
    return op([
      {
        type: 'update_node',
        id: input.id,
        patch: { width: input.width, height: input.height },
        metadata: input.freeResize === undefined ? undefined : { freeResize: input.freeResize },
      },
    ])
  if (name === 'canvas_delete_nodes') return op([{ type: 'delete_node', ids: input.ids }])
  if (name === 'canvas_connect_nodes')
    return op(
      (input.connections as Array<Record<string, unknown>>).map((connection) => ({
        type: 'connect_nodes',
        ...connection,
      }))
    )
  if (name === 'canvas_select_nodes') return op([{ type: 'select_nodes', ids: input.ids }])
  if (name === 'canvas_set_viewport') return op([{ type: 'set_viewport', viewport: input.viewport }])
  if (name === 'canvas_run_generation')
    return op([
      { type: 'run_generation', nodeId: input.nodeId, mode: generationMode(input.mode), prompt: input.prompt },
    ])
  throw new Error(`Tool "${name}" is not available.`)
}

function textNodeOp(input: Record<string, unknown>, x: number, y: number) {
  return {
    type: 'add_node',
    nodeType: 'text',
    title: input.title,
    position: { x, y },
    width: input.width,
    height: input.height,
    metadata: { content: input.text || '', status: 'success', fontSize: 14 },
  }
}
function configMetadata(input: Record<string, unknown>, mode: string, prompt: string) {
  return Object.fromEntries(
    Object.entries({
      generationMode: mode,
      composerContent: prompt,
      prompt,
      status: 'idle',
      model: input.model,
      size: input.size,
      quality: input.quality,
      count: input.count,
      seconds: input.seconds,
      vquality: input.vquality,
      generateAudio: input.generateAudio,
      watermark: input.watermark,
      audioVoice: input.audioVoice,
      audioFormat: input.audioFormat,
      audioSpeed: input.audioSpeed,
      audioInstructions: input.audioInstructions,
    }).filter(([, value]) => value !== undefined && value !== '')
  )
}
function generationMode(value: unknown): 'text' | 'image' | 'video' | 'audio' {
  return value === 'text' || value === 'video' || value === 'audio' ? value : 'image'
}
function generationTitle(mode: string) {
  return mode === 'text' ? '文本生成' : mode === 'video' ? '视频生成' : mode === 'audio' ? '音频生成' : '图片生成'
}
function nextCanvasX(state?: CanvasSnapshot) {
  const nodes = state?.nodes || []
  return nodes.length ? Math.max(...nodes.map((node) => node.position.x + node.width)) + 80 : 0
}
