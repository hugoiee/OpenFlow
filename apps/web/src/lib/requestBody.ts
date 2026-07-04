// 生成请求体的单一来源：LLM / 图像 / 视频节点「点击生成时发送的请求 JSON」都由这里构造。
// 节点组件的 handleRun 与右侧 Inspector 的「请求 JSON 预览」共用，保证预览与实发一致、不漂移。

import type { GenImageBody, GenLlmBody, GenVideoBody } from '@openflow/shared'
import { collectUpstreamAudio, collectUpstreamImages, collectUpstreamPrompt } from './graph'
import {
  IMAGE_SIZE_DEFAULT,
  IMAGE_SIZE_OPTIONS,
  LLM_MODEL_DEFAULT,
  LLM_TEMPERATURE_DEFAULT,
  NANO_ASPECT_DEFAULT,
  NANO_IMAGE_SIZE_DEFAULT,
  NANO_VERSION_DEFAULT,
  SEEDANCE_DURATION_DEFAULT,
  SEEDANCE_RATIO_DEFAULT,
  SEEDANCE_RESOLUTION_DEFAULT,
  SEEDANCE_VERSION_DEFAULT,
  VIDEO_VARIANT_DEFAULT,
  imageApiModel,
  videoApiModel,
} from './nodeCatalog'
import type { ImageNode, LlmNode, Project, VideoNode } from './types'

/** 每行一个 URL 的文本框 → 去空的 URL 列表。 */
function linesToUrls(text: string | undefined): string[] {
  return (text ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Any LLM 节点：POST /api/llm 的请求体（多模态图取自各图像输入端点）。 */
export function buildLlmRequest(project: Project, node: LlmNode): GenLlmBody {
  const id = node.id
  const d = node.data
  const systemPrompt = collectUpstreamPrompt(project, id, { handle: 'system' }).trim()
  const images = collectUpstreamImages(project, id)
  return {
    projectId: project.id,
    nodeId: id,
    model: d.model || LLM_MODEL_DEFAULT,
    prompt: collectUpstreamPrompt(project, id, { handle: 'user' }),
    systemPrompt: systemPrompt || undefined,
    images: images.length ? images : undefined,
    temperature: d.temperature ?? LLM_TEMPERATURE_DEFAULT,
    thinking: d.thinking ?? false,
  }
}

/** 图像生成节点：POST /api/aigc 的请求体（按模型 Image 2 / Nano Banana 取舍参数）。 */
export function buildImageRequest(project: Project, node: ImageNode): GenImageBody {
  const id = node.id
  const d = node.data
  // 输入图 = 上游 image/素材（按图像端点编号）在前，手动填/传的在后
  const images = [...collectUpstreamImages(project, id), ...linesToUrls(d.imagesText)]
  const base = {
    projectId: project.id,
    nodeId: id,
    model: imageApiModel(d.model),
    prompt: collectUpstreamPrompt(project, id, { handle: 'user' }),
    images,
  }
  if (imageApiModel(d.model) === 'nano-banana') {
    return {
      ...base,
      version: d.version ?? NANO_VERSION_DEFAULT,
      aspectRatio: d.aspectRatio ?? NANO_ASPECT_DEFAULT,
      imageSize: d.imageSize ?? NANO_IMAGE_SIZE_DEFAULT,
      size: '',
      n: 1,
      quality: '',
    }
  }
  const storedSize = d.size ?? IMAGE_SIZE_DEFAULT
  const size = (IMAGE_SIZE_OPTIONS as readonly string[]).includes(storedSize)
    ? storedSize
    : IMAGE_SIZE_DEFAULT
  return { ...base, size, n: d.n ?? 1, quality: d.quality ?? 'auto' }
}

/** 视频生成节点（seedance）：POST /api/video 的请求体。 */
export function buildVideoRequest(project: Project, node: VideoNode): GenVideoBody {
  const id = node.id
  const d = node.data
  const variant = d.videoVariant ?? (d.videoTask === 'reference' ? 'reference' : VIDEO_VARIANT_DEFAULT)
  const combined = [...collectUpstreamImages(project, id), ...linesToUrls(d.imagesText)]
  const audios = [...collectUpstreamAudio(project, id), ...linesToUrls(d.audiosText)]
  // 变体 → 后端 mode + 有序输入图；两变体都在无图（只连 Prompt）时退化为文生视频。
  //   参考图有图 → reference_image + 全部图；首尾帧 → first_last_frame + 前 2 张（First/Last）。
  let mode: string
  let images: string[]
  if (variant === 'reference' && combined.length > 0) {
    mode = 'reference_image'
    images = combined
  } else {
    mode = 'first_last_frame'
    images = variant === 'frames' ? combined.slice(0, 2) : []
  }
  const ratio = d.ratio ?? SEEDANCE_RATIO_DEFAULT
  return {
    projectId: project.id,
    nodeId: id,
    model: videoApiModel(d.model),
    version: d.version ?? SEEDANCE_VERSION_DEFAULT,
    mode,
    prompt: collectUpstreamPrompt(project, id, { handle: 'user' }),
    images,
    audios,
    resolution: d.resolution ?? SEEDANCE_RESOLUTION_DEFAULT,
    // adaptive（自适应）=不约束宽高比、等价旧行为，故不传；仅选了固定比例时下发
    ratio: ratio === SEEDANCE_RATIO_DEFAULT ? undefined : ratio,
    duration: d.duration ?? SEEDANCE_DURATION_DEFAULT,
  }
}
