import type { GenImageBody, GenVideoBody } from '@openflow/shared'

// AIGC 图像生成接口（当前无鉴权）；地址/req_from 可用环境变量覆盖
const AIGC_ENDPOINT = process.env.AIGC_ENDPOINT ?? 'http://10.75.202.161:8204/aigc'
const AIGC_REQ_FROM = process.env.AIGC_REQ_FROM ?? 'openflow'

// 生成请求的内部输入：在请求体基础上补全局署名 req_from + 可选端点（由路由从设置注入）
type ImageGenInput = GenImageBody & { reqFrom: string; endpoint?: string }
type VideoGenInput = GenVideoBody & { reqFrom: string; endpoint?: string }

/** 把（可能为空的）全局署名解析成最终 req_from：空则回退环境变量，再回退 'openflow'。 */
export function resolveReqFrom(value: string | undefined): string {
  return value?.trim() || AIGC_REQ_FROM
}

/** 端点解析：设置里非空则用它，否则回退传入的 env/内置默认。 */
function resolveEndpoint(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback
}
// 文件上传接口（当前无鉴权）；图片与音频走不同端点，地址可用环境变量覆盖
const UPLOAD_ENDPOINT =
  process.env.UPLOAD_ENDPOINT ?? 'http://10.75.202.161:8511/api/upload'
const UPLOAD_MEDIA_ENDPOINT =
  process.env.UPLOAD_MEDIA_ENDPOINT ?? 'http://10.75.202.161:8511/api/upload-media'

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

  const res = await fetch(resolveEndpoint(input.endpoint, AIGC_ENDPOINT), {
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
  })
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
 * 转发 multipart 文件到上传接口 → URL 列表。图片走 /api/upload，音频走 /api/upload-media。
 * 出错抛带可读信息的 Error。
 */
export async function uploadFiles(
  form: FormData,
  kind: 'image' | 'audio' = 'image',
  endpointOverride?: string,
): Promise<string[]> {
  const fallback = kind === 'audio' ? UPLOAD_MEDIA_ENDPOINT : UPLOAD_ENDPOINT
  const endpoint = resolveEndpoint(endpointOverride, fallback)
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
  const res = await fetch(resolveEndpoint(input.endpoint, AIGC_ENDPOINT), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      req_from: resolveReqFrom(input.reqFrom),
      model_name: input.model,
      version: input.version,
      mode: input.mode,
      prompt: input.prompt,
      image_list: input.images,
      video_list: [],
      audio_list: input.audios ?? [],
      // ratio 省略时不塞进 config，保持旧行为（由接口自行决定宽高比）
      config: {
        resolution: input.resolution,
        duration: input.duration,
        ...(input.ratio?.trim() ? { ratio: input.ratio } : {}),
      },
    }),
  })
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
