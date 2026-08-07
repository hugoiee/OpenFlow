import { Agent } from 'undici'
import type { GenImageBody, GenVideoBody } from '@openflow/shared'

// AIGC 图像/视频生成接口（当前无鉴权）。**不内置任何默认地址**：
// 打包分发给不同网络的人时不该带上任一方的内网地址，一律由「设置面板」填写
// （或用环境变量覆盖）。为空时 resolveEndpoint 会抛出可读错误。
const AIGC_ENDPOINT = process.env.AIGC_ENDPOINT ?? ''

// Node 内置 fetch（undici）默认 headersTimeout/bodyTimeout 均为 300s：
// seedance 视频生成（尤其 1080p、时长拉满）耗时常超 5 分钟，会被这个默认值提前掐断报 fetch failed。
// 换一个超时拉到 30 分钟的自定义 dispatcher，专供 AIGC 生成调用（图像基本用不到，但共用无副作用）。
const AIGC_DISPATCHER = new Agent({ headersTimeout: 1_800_000, bodyTimeout: 1_800_000 })

// 生成请求的内部输入：在请求体（去掉 projectId/nodeId 这类元数据）基础上补
// 全局署名 req_from + 可选端点（由 task-store 从设置注入）
type ImageGenInput = Omit<GenImageBody, 'projectId' | 'nodeId'> & {
  reqFrom: string
  endpoint?: string
}
type VideoGenInput = Omit<GenVideoBody, 'projectId' | 'nodeId'> & {
  reqFrom: string
  endpoint?: string
}

/**
 * 把全局署名解析成最终 req_from：必须非空，否则抛错——不再有兜底默认值。
 * req_from 为空时不允许发送任何上游请求（由此保证生成/上传都带真实署名）。
 */
export function resolveReqFrom(value: string | undefined): string {
  const trimmed = value?.trim()
  if (!trimmed) throw new Error('缺少调用方署名 req_from，请先在设置中填写')
  return trimmed
}

/**
 * 端点解析：设置里非空则用它，否则回退 env。两者都为空即抛错——
 * 同 resolveReqFrom 的做法，宁可给出可读提示，也不要拿空地址去发请求。
 */
function resolveEndpoint(value: string | undefined, fallback: string, label: string): string {
  const resolved = value?.trim() || fallback.trim()
  if (!resolved) throw new Error(`缺少${label}地址，请先在设置中填写`)
  return resolved
}
// 文件上传接口（当前无鉴权）；图片与音频/视频走不同端点。同样不内置默认地址。
const UPLOAD_ENDPOINT = process.env.UPLOAD_ENDPOINT ?? ''
const UPLOAD_MEDIA_ENDPOINT = process.env.UPLOAD_MEDIA_ENDPOINT ?? ''

/** 从任意响应结构里稳健地收集 http(s) URL（去重）。 */
function collectUrls(v: unknown): string[] {
  const out: string[] = []
  const visit = (x: unknown) => {
    if (typeof x === 'string') {
      if (/^https?:\/\//i.test(x)) out.push(x)
    } else if (Array.isArray(x)) {
      x.forEach(visit)
    } else if (x && typeof x === 'object') {
      Object.values(x as Record<string, unknown>).forEach(visit)
    }
  }
  visit(v)
  return [...new Set(out)]
}

/**
 * 优先从常见「输出」字段取图片 URL，取不到再全量深挖（应对未知响应字段名）。
 * 注意：image_list 同时是请求里的「输入图」字段，放最后，避免响应回显输入时把输入图当成结果。
 */
function extractImageUrls(data: unknown): string[] {
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>
    for (const key of [
      'data',
      'images',
      'image_urls',
      'output',
      'result',
      'urls',
      'files', // 上传接口的输出键（files[].url）
      'image_list',
    ]) {
      const urls = collectUrls(o[key])
      if (urls.length) return urls
    }
  }
  return collectUrls(data)
}

/** 从响应里尽量取出可读错误信息。 */
function extractError(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined
  const o = data as Record<string, unknown>
  for (const key of ['error', 'message', 'msg', 'errmsg']) {
    const v = o[key]
    if (typeof v === 'string' && v) return v
    if (v && typeof v === 'object') {
      const m = (v as Record<string, unknown>).message
      if (typeof m === 'string' && m) return m
    }
  }
  return undefined
}

/** POST AIGC 接口生成图像 → 图片 URL 列表。出错抛带可读信息的 Error。 */
export async function runImageGen(input: ImageGenInput): Promise<string[]> {
  // 公共字段两套模型一致；version 与 config 按 model_name 分支构造，互不污染
  const isNano = input.model === 'nano-banana'
  const version = isNano
    ? input.version?.trim() || 'gemini-3-pro-image-preview'
    : input.model
  const config = isNano
    ? { aspect_ratio: input.aspectRatio, image_size: input.imageSize }
    : { size: input.size, n: input.n, quality: input.quality }

  const res = await fetch(resolveEndpoint(input.endpoint, AIGC_ENDPOINT, 'AIGC 生成接口'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      req_from: resolveReqFrom(input.reqFrom),
      model_name: input.model,
      version,
      prompt: input.prompt,
      image_list: input.images,
      config,
    }),
    dispatcher: AIGC_DISPATCHER,
  } as unknown as RequestInit)
  const data = (await res.json().catch(() => null)) as unknown
  if (!res.ok) {
    // 优先回可读错误；否则只回截断的原始体，避免把上游大响应整体透传给前端
    throw new Error(`HTTP ${res.status}：${extractError(data) ?? JSON.stringify(data).slice(0, 300)}`)
  }
  const urls = extractImageUrls(data)
  if (urls.length === 0) {
    throw new Error(
      extractError(data) ?? `未从响应解析到图片 URL：${JSON.stringify(data).slice(0, 300)}`,
    )
  }
  return urls
}

/**
 * 转发 multipart 文件到上传接口 → URL 列表。图片走 /api/upload，音频 / 视频走 /api/upload-media。
 * 出错抛带可读信息的 Error。
 */
export async function uploadFiles(
  form: FormData,
  kind: 'image' | 'audio' | 'video' = 'image',
  endpointOverride?: string,
): Promise<string[]> {
  // 图片 → 图片端点；音频 / 视频都是媒体，走媒体端点
  const fallback = kind === 'image' ? UPLOAD_ENDPOINT : UPLOAD_MEDIA_ENDPOINT
  const endpoint = resolveEndpoint(endpointOverride, fallback, kind === 'image' ? '图片上传接口' : '音视频上传接口')
  // 不手动设 Content-Type，让 fetch 自带 multipart boundary
  const res = await fetch(endpoint, { method: 'POST', body: form })
  const data = (await res.json().catch(() => null)) as unknown
  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status}：${extractError(data) ?? JSON.stringify(data).slice(0, 300)}`,
    )
  }
  // 优先取已知结构 files[].url，取不到再全量深挖兜底
  const urls = extractImageUrls(data)
  if (urls.length === 0) {
    throw new Error(
      extractError(data) ?? `未从响应解析到上传 URL：${JSON.stringify(data).slice(0, 300)}`,
    )
  }
  return urls
}

/** POST AIGC 接口生成视频（seedance）→ 视频 URL 列表。出错抛带可读信息的 Error。 */
export async function runVideoGen(input: VideoGenInput): Promise<string[]> {
  const res = await fetch(resolveEndpoint(input.endpoint, AIGC_ENDPOINT, 'AIGC 生成接口'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      req_from: resolveReqFrom(input.reqFrom),
      model_name: input.model,
      version: input.version,
      mode: input.mode,
      prompt: input.prompt,
      image_list: input.images,
      video_list: input.videos ?? [],
      audio_list: input.audios ?? [],
      // ratio 省略时不塞进 config，保持旧行为（由接口自行决定宽高比）
      config: {
        resolution: input.resolution,
        duration: input.duration,
        ...(input.ratio?.trim() ? { ratio: input.ratio } : {}),
      },
    }),
    dispatcher: AIGC_DISPATCHER,
  } as unknown as RequestInit)
  const data = (await res.json().catch(() => null)) as unknown
  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status}：${extractError(data) ?? JSON.stringify(data).slice(0, 300)}`,
    )
  }
  // collectUrls 抓任意 http(s) URL，对视频 mp4 同样适用
  const urls = extractImageUrls(data)
  if (urls.length === 0) {
    throw new Error(
      extractError(data) ?? `未从响应解析到视频 URL：${JSON.stringify(data).slice(0, 300)}`,
    )
  }
  return urls
}
