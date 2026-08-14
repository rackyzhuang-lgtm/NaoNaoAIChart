import { isGeminiImageModel } from '../../shared/providers/definitions/image-models'
import type {
  Sub2ApiInfiniteCanvasApiFormat,
  Sub2ApiInfiniteCanvasCapability,
  Sub2ApiInfiniteCanvasModel,
  Sub2ApiModel,
} from '../../shared/sub2api/contracts'

const VIDEO_KEYWORDS = ['seedance', 'video', 'sora', 'veo', 'kling', 'wan', 'hailuo']
const AUDIO_KEYWORDS = ['audio', 'tts', 'speech', 'voice', 'music', 'sound']
const IMAGE_KEYWORDS = [
  'seedream',
  'gpt-image',
  'image',
  'dall-e',
  'dalle',
  'imagen',
  'flux',
  'sdxl',
  'stable-diffusion',
  'midjourney',
]

function normalizeCapability(value: unknown): Sub2ApiInfiniteCanvasCapability | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase().replaceAll('-', '_')
  if (['image', 'images', 'image_generation', 'vision_generation'].includes(normalized)) return 'image'
  if (['video', 'videos', 'video_generation'].includes(normalized)) return 'video'
  if (['audio', 'speech', 'tts', 'audio_generation'].includes(normalized)) return 'audio'
  if (['text', 'chat', 'completion', 'completions', 'responses', 'language'].includes(normalized)) return 'text'
  return null
}

function explicitCapability(model: Sub2ApiModel): Sub2ApiInfiniteCanvasCapability | null {
  const record = model as Record<string, unknown>
  for (const field of ['capability', 'modality', 'model_type']) {
    const capability = normalizeCapability(record[field])
    if (capability) return capability
  }
  for (const field of ['capabilities', 'modalities']) {
    const values = record[field]
    if (!Array.isArray(values)) continue
    for (const value of values) {
      const capability = normalizeCapability(value)
      if (capability) return capability
    }
  }
  return null
}

export function inferInfiniteCanvasModelCapability(model: Sub2ApiModel): Sub2ApiInfiniteCanvasCapability {
  const explicit = explicitCapability(model)
  if (explicit) return explicit
  const id = model.id.trim().toLowerCase()
  if (VIDEO_KEYWORDS.some((keyword) => id.includes(keyword))) return 'video'
  if (AUDIO_KEYWORDS.some((keyword) => id.includes(keyword))) return 'audio'
  if (IMAGE_KEYWORDS.some((keyword) => id.includes(keyword))) return 'image'
  return 'text'
}

export function inferInfiniteCanvasModelApiFormat(model: Sub2ApiModel): Sub2ApiInfiniteCanvasApiFormat {
  return isGeminiImageModel(model.id.trim().toLowerCase()) ? 'gemini' : 'openai'
}

export function classifyInfiniteCanvasModels(models: Sub2ApiModel[]): Sub2ApiInfiniteCanvasModel[] {
  const seen = new Set<string>()
  const classified: Sub2ApiInfiniteCanvasModel[] = []
  for (const model of models) {
    const id = model.id.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    const classifiedModel = { ...model, id }
    classified.push({
      ...classifiedModel,
      capability: inferInfiniteCanvasModelCapability(classifiedModel),
      apiFormat: inferInfiniteCanvasModelApiFormat(classifiedModel),
    })
  }
  return classified
}
