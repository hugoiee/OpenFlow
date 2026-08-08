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

/** 原始响应留存的截断长度：够看清现场，又不至于把大响应整个塞进 SQLite。 */
const RAW_KEEP = 8000

/** 从任意响应结构里稳健地收集 http(s) URL（去重）；exclude 里的（本次请求发出的输入 URL）剔除。 */
function collectUrls(v: unknown, exclude?: ReadonlySet<string>): string[] {
  const out: string[] = []
  const visit = (x: unknown) => {
    if (typeof x === 'string') {
      if (/^https?:\/\//i.test(x) && !exclude?.has(x)) out.push(x)
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
 * 优先从常见「输出」字段取 URL，取不到再全量深挖（应对未知响应字段名）。
 * 注意：image_list / video_list 同时是请求里的「输入」字段，放最后，避免响应回显输入时把输入当成结果
 * （exclude 已经兜了一层，这里的次序是第二道保险）。
 */
function extractLegacyUrls(data: unknown, exclude?: ReadonlySet<string>): string[] {
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>
    for (const key of [
      'data',
      'video_url',
      'videos',
      'images',
      'image_urls',
      'output',
      'result',
      'urls',
      'files', // 上传接口的输出键（files[].url）
      'video_list',
      'image_list',
    ]) {
      const urls = collectUrls(o[key], exclude)
      if (urls.length) return urls
    }
  }
  return collectUrls(data, exclude)
}

/**
 * 从响应里尽量取出可读错误信息。
 * 本网关把错误放在第三层 `result.error.{code,message}`，只扫顶层会把真实原因（如
 * 「输出音频可能涉及版权限制」）整个吞掉、退化成「未解析到 URL」，故这里连嵌套一并扫。
 */
function extractError(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined
  const o = data as Record<string, unknown>
  const fromResult = errorText((o.result as Record<string, unknown> | undefined)?.error)
  if (fromResult) return fromResult
  const fromData = errorText((o.data as Record<string, unknown> | undefined)?.error)
  if (fromData) return fromData
  for (const key of ['error', 'message', 'msg', 'errmsg']) {
    const text = errorText(o[key])
    if (text) return text
  }
  return undefined
}

/** 把一个「错误位」解析成可读文案：字符串直接用；对象取 message/msg 并带上 code。 */
function errorText(v: unknown): string | undefined {
  if (typeof v === 'string') return v || undefined
  if (!v || typeof v !== 'object') return undefined
  const o = v as Record<string, unknown>
  const message = [o.message, o.msg, o.errmsg].find((m) => typeof m === 'string' && m) as
    | string
    | undefined
  if (!message) return undefined
  return typeof o.code === 'string' && o.code ? `${message}（${o.code}）` : message
}

/**
 * 上游 AIGC 响应的解析结果。已知契约：
 * `{ model_name, version, request_id, result: { content: string[], status: 'success'|'failed', error: {code,message} } }`
 * 契约对不上时回退到 extractLegacyUrls 的深挖（保住旧行为）。
 */
export type AigcParsed = {
  /** 结果 URL 列表（已剔除本次请求发出的输入 URL）。 */
  urls: string[]
  /** 上游终态：'success' | 'failed'；契约不匹配时为 undefined。 */
  status?: string
  /** 上游给出的可读错误（含 code）。 */
  errorMessage?: string
  /** 上游任务标识，用于去历史接口按 id 认领结果。 */
  requestId?: string
}

/** 按已知契约解析上游响应；exclude 为本次请求发出的输入 URL（防回显被当成结果）。 */
export function readAigcResult(data: unknown, exclude?: ReadonlySet<string>): AigcParsed {
  const parsed: AigcParsed = { urls: [] }
  if (!data || typeof data !== 'object') return parsed
  const o = data as Record<string, unknown>

  for (const key of ['request_id', 'requestId', 'task_id', 'taskId', 'id']) {
    const v = o[key]
    if (typeof v === 'string' && v.trim()) {
      parsed.requestId = v.trim()
      break
    }
  }

  const result = o.result
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const r = result as Record<string, unknown>
    if (typeof r.status === 'string' && r.status) parsed.status = r.status
    if (Array.isArray(r.content)) {
      parsed.urls = collectUrls(r.content, exclude)
      parsed.errorMessage = errorText(r.error)
      return parsed
    }
  }

  // 契约不匹配（未知网关/降级响应）：退回全量深挖
  parsed.urls = extractLegacyUrls(data, exclude)
  parsed.errorMessage = extractError(data)
  return parsed
}

/**
 * 「上游 2xx 但没带回结果 URL，且没说自己失败」——这是**可能还在生成**的信号，
 * 不等于生成失败。task-store 收到它会转去 AIGC 历史接口找回结果，而不是当场判死。
 */
export class EmptyResultError extends Error {
  readonly rawText: string
  readonly requestId?: string
  readonly httpStatus: number
  constructor(opts: { message: string; rawText: string; requestId?: string; httpStatus: number }) {
    super(opts.message)
    this.name = 'EmptyResultError'
    this.rawText = opts.rawText
    this.requestId = opts.requestId
    this.httpStatus = opts.httpStatus
  }
}

/** 生成调用的统一返回：结果 URL + 认领键 + 原始响应（供落库存证）。 */
export type GenOutcome = { urls: string[]; requestId?: string; rawText: string }

/** 发给 AIGC 接口的请求体（同时是历史接口 items[].request 的形状）。 */
export type AigcPayload = Record<string, unknown>

/**
 * POST AIGC 接口的公共发送逻辑。
 * 刻意用 text() 而非 json()：非 JSON 响应（HTML 错误页 / 空体 / 被中间设备截断的流）
 * 用 `res.json().catch(() => null)` 会把原文连同状态码一起丢掉，错误退化成字面量 `null`。
 */
async function postAigc(
  endpoint: string,
  payload: unknown,
): Promise<{ ok: boolean; httpStatus: number; data: unknown; rawText: string }> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    dispatcher: AIGC_DISPATCHER,
  } as unknown as RequestInit)
  const rawText = (await res.text().catch(() => '')).slice(0, RAW_KEEP)
  let data: unknown = null
  try {
    data = JSON.parse(rawText)
  } catch {
    data = null
  }
  return { ok: res.ok, httpStatus: res.status, data, rawText }
}

/** 把上游响应收敛成结果 URL；没有 URL 时按「明确失败 / 可能还在生成」分别抛错。 */
function toOutcome(
  sent: { ok: boolean; httpStatus: number; data: unknown; rawText: string },
  exclude: ReadonlySet<string>,
  label: '图片' | '视频',
): GenOutcome {
  const parsed = readAigcResult(sent.data, exclude)
  if (!sent.ok) {
    throw new Error(
      `HTTP ${sent.httpStatus}：${parsed.errorMessage ?? (sent.rawText.slice(0, 300) || '(空响应)')}`,
    )
  }
  if (parsed.urls.length > 0) {
    return { urls: parsed.urls, requestId: parsed.requestId, rawText: sent.rawText }
  }
  // 上游明确说失败：直接把真实原因报出去，不必再去历史里找
  if (parsed.status === 'failed' || parsed.errorMessage) {
    throw new Error(parsed.errorMessage ?? `上游返回失败：${sent.rawText.slice(0, 300)}`)
  }
  throw new EmptyResultError({
    message: `未从响应解析到${label} URL：${sent.rawText.slice(0, 300) || '(空响应)'}`,
    rawText: sent.rawText,
    requestId: parsed.requestId,
    httpStatus: sent.httpStatus,
  })
}

/**
 * 构造图像生成的请求体。**独立于发送**导出：任务失败后要靠同一份请求体去 AIGC 历史接口
 * 按指纹认领结果，两处若各写一遍必然漂移。
 */
export function buildImagePayload(input: ImageGenInput): AigcPayload {
  // 公共字段两套模型一致；version 与 config 按 model_name 分支构造，互不污染
  const isNano = input.model === 'nano-banana'
  const version = isNano
    ? input.version?.trim() || 'gemini-3-pro-image-preview'
    : input.model
  const config = isNano
    ? { aspect_ratio: input.aspectRatio, image_size: input.imageSize }
    : { size: input.size, n: input.n, quality: input.quality }

  return {
    req_from: resolveReqFrom(input.reqFrom),
    model_name: input.model,
    version,
    prompt: input.prompt,
    image_list: input.images ?? [],
    config,
  }
}

/** POST AIGC 接口生成图像 → 图片 URL + 认领键 + 原始响应。出错抛带可读信息的 Error。 */
export async function runImageGen(input: ImageGenInput): Promise<GenOutcome> {
  const payload = buildImagePayload(input)
  const sent = await postAigc(
    resolveEndpoint(input.endpoint, AIGC_ENDPOINT, 'AIGC 生成接口'),
    payload,
  )
  return toOutcome(sent, new Set(input.images ?? []), '图片')
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
  const urls = extractLegacyUrls(data)
  if (urls.length === 0) {
    throw new Error(
      extractError(data) ?? `未从响应解析到上传 URL：${JSON.stringify(data).slice(0, 300)}`,
    )
  }
  return urls
}

/**
 * 构造视频生成的请求体（同 buildImagePayload，独立于发送导出供历史指纹复用）。
 * 三家网关的 config 形状互不相同，按 model_name 分三支组装：
 *   seedance      → { resolution, duration, ratio?, generate_audio? }
 *   kling         → { duration:字符串, sound:'on'|'off', mode:'std'|'pro', aspect_ratio, multi_shot, shot_type? }
 *                   多镜头时不发 prompt，改发顶层 multi_prompt
 *   MiniMax-H3    → { resolution, ratio, duration, 'aigc-watermark' }
 */
export function buildVideoPayload(input: VideoGenInput): AigcPayload {
  const base = {
    req_from: resolveReqFrom(input.reqFrom),
    model_name: input.model,
    version: input.version,
    mode: input.mode,
  }
  if (input.model === 'kling') return buildKlingPayload(input, base)
  if (input.model === 'MiniMax-H3') return buildMinimaxPayload(input, base)
  return {
    ...base,
    prompt: input.prompt,
    image_list: input.images ?? [],
    video_list: input.videos ?? [],
    audio_list: input.audios ?? [],
    // ratio 省略时不塞进 config，保持旧行为（由接口自行决定宽高比）
    config: {
      resolution: input.resolution,
      duration: input.duration,
      ...(input.ratio?.trim() ? { ratio: input.ratio } : {}),
      // 只有支持的 version（2.5）才由前端传上来；未传即不下发，让网关用自己的默认
      ...(typeof input.generateAudio === 'boolean' ? { generate_audio: input.generateAudio } : {}),
    },
  }
}

/**
 * 可灵：只吃图（不发 video_list / audio_list），duration 是字符串。
 * 多镜头模式（multi_shot=true）下 **prompt 整个字段都不发**，画面描述改由 multi_prompt 逐段给出；
 * 分镜为空则自动退回单镜头，免得发出一个既没 prompt 又没 multi_prompt 的空请求。
 */
function buildKlingPayload(input: VideoGenInput, base: Record<string, unknown>): AigcPayload {
  const shots = (input.shots ?? []).filter((s) => s.prompt.trim())
  const multiShot = Boolean(input.multiShot) && shots.length > 0
  return {
    ...base,
    ...(multiShot ? {} : { prompt: input.prompt }),
    image_list: input.images ?? [],
    config: {
      duration: String(input.duration),
      sound: input.sound === false ? 'off' : 'on',
      mode: input.qualityMode?.trim() || 'pro',
      aspect_ratio: input.ratio?.trim() || '16:9',
      multi_shot: multiShot,
      ...(multiShot ? { shot_type: 'customize' } : {}),
    },
    ...(multiShot
      ? {
          multi_prompt: shots.map((s, i) => ({
            index: i + 1,
            prompt: s.prompt,
            duration: String(s.duration),
          })),
        }
      : {}),
  }
}

/**
 * MiniMax-H3：参考帧模式支持图/音/视，首尾帧模式只支持图。
 * 该发哪些由前端按变体裁好（videoAcceptsRefs），这里只做「空列表不下发」。
 */
function buildMinimaxPayload(input: VideoGenInput, base: Record<string, unknown>): AigcPayload {
  const videos = input.videos ?? []
  const audios = input.audios ?? []
  return {
    ...base,
    prompt: input.prompt,
    image_list: input.images ?? [],
    ...(videos.length ? { video_list: videos } : {}),
    ...(audios.length ? { audio_list: audios } : {}),
    config: {
      resolution: input.resolution,
      ratio: input.ratio?.trim() || 'adaptive',
      duration: input.duration,
      'aigc-watermark': Boolean(input.watermark),
    },
  }
}

/** POST AIGC 接口生成视频（seedance）→ 视频 URL + 认领键 + 原始响应。出错抛带可读信息的 Error。 */
export async function runVideoGen(input: VideoGenInput): Promise<GenOutcome> {
  const payload = buildVideoPayload(input)
  const sent = await postAigc(
    resolveEndpoint(input.endpoint, AIGC_ENDPOINT, 'AIGC 生成接口'),
    payload,
  )
  // 输入图/视频/音频一并作 exclude：上游一旦回显输入，别把输入图当成生成结果
  const exclude = new Set([
    ...(input.images ?? []),
    ...(input.videos ?? []),
    ...(input.audios ?? []),
  ])
  return toOutcome(sent, exclude, '视频')
}
