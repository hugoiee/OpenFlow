import type { GenImageBody, ProviderEndpoint } from '@openflow/shared'

// AIGC 图像生成接口（当前无鉴权）；地址/req_from 可用环境变量覆盖
const AIGC_ENDPOINT = process.env.AIGC_ENDPOINT ?? 'http://10.75.202.161:8204/aigc'
const AIGC_REQ_FROM = process.env.AIGC_REQ_FROM ?? 'openflow'

type ChatCompletionResponse = {
  choices?: { message?: { content?: string } }[]
  error?: { message?: string }
}
type ModelsResponse = {
  data?: { id?: string }[]
  error?: { message?: string }
}

function normalizeBaseURL(baseURL: string): string {
  return baseURL.trim().replace(/\/+$/, '')
}

/** GET {baseURL}/models → 模型 id 列表（排序）。出错抛带可读信息的 Error。 */
export async function fetchModels(endpoint: ProviderEndpoint): Promise<string[]> {
  const base = normalizeBaseURL(endpoint.baseURL)
  if (!base) throw new Error('未配置 base URL')

  const res = await fetch(`${base}/models`, {
    headers: { Authorization: `Bearer ${endpoint.apiKey}` },
  })
  const data = (await res.json().catch(() => null)) as ModelsResponse | null
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}：${data?.error?.message ?? JSON.stringify(data)}`)
  }
  const ids = (data?.data ?? [])
    .map((m) => m.id)
    .filter((id): id is string => typeof id === 'string')
  if (ids.length === 0) throw new Error('未返回任何模型')
  return ids.sort()
}

/** POST {baseURL}/chat/completions（非流式）→ 文本。出错抛带可读信息的 Error。 */
export async function runChat(
  endpoint: ProviderEndpoint,
  model: string,
  prompt: string,
): Promise<string> {
  const base = normalizeBaseURL(endpoint.baseURL)
  if (!base) throw new Error('未配置 base URL')

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${endpoint.apiKey}`,
    },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
  })
  const data = (await res.json().catch(() => null)) as ChatCompletionResponse | null
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}：${data?.error?.message ?? JSON.stringify(data)}`)
  }
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error(`响应格式异常：${JSON.stringify(data)}`)
  return content
}

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
    for (const key of ['data', 'images', 'image_urls', 'output', 'result', 'urls', 'image_list']) {
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
export async function runImageGen(input: GenImageBody): Promise<string[]> {
  const res = await fetch(AIGC_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      req_from: input.reqFrom?.trim() || AIGC_REQ_FROM,
      model_name: input.model,
      version: input.model,
      prompt: input.prompt,
      image_list: input.images,
      config: { size: input.size, n: input.n, quality: input.quality },
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
