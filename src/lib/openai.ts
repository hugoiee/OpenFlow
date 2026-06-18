import type { ProviderEndpoint } from '@/lib/types'

type ChatCompletionResponse = {
  choices?: { message?: { content?: string } }[]
  error?: { message?: string }
}

type ModelsResponse = {
  data?: { id?: string }[]
  error?: { message?: string }
}

/** 去掉 base URL 末尾多余的斜杠。 */
function normalizeBaseURL(baseURL: string): string {
  return baseURL.trim().replace(/\/+$/, '')
}

/** 统一包装网络层错误（含 CORS 被拦截、域名错误等）。 */
function wrapNetworkError(e: unknown): Error {
  return new Error(
    `请求失败（可能是网络错误或中转端未允许浏览器 CORS）：${
      e instanceof Error ? e.message : String(e)
    }`,
    { cause: e },
  )
}

/**
 * 拉取供应商可用模型列表：GET {baseURL}/models。
 * 返回模型 id 列表（排序）；出错时抛出带可读信息的 Error。
 */
export async function fetchModels(endpoint: ProviderEndpoint): Promise<string[]> {
  const base = normalizeBaseURL(endpoint.baseURL)
  if (!base) throw new Error('未配置 base URL')

  let res: Response
  try {
    res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${endpoint.apiKey}` },
    })
  } catch (e) {
    throw wrapNetworkError(e)
  }

  const data = (await res.json().catch(() => null)) as ModelsResponse | null

  if (!res.ok) {
    const detail = data?.error?.message ?? JSON.stringify(data) ?? ''
    throw new Error(`HTTP ${res.status}：${detail}`)
  }

  const ids = (data?.data ?? [])
    .map((m) => m.id)
    .filter((id): id is string => typeof id === 'string')
  if (ids.length === 0) throw new Error('未返回任何模型')
  return ids.sort()
}

/**
 * 调用 OpenAI 兼容的第三方中转 API（非流式）。
 * 返回模型输出文本；出错时抛出带可读信息的 Error。
 */
export async function runOpenAIChat(
  endpoint: ProviderEndpoint,
  model: string,
  prompt: string,
): Promise<string> {
  const base = normalizeBaseURL(endpoint.baseURL)
  if (!base) throw new Error('未配置 base URL')

  let res: Response
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${endpoint.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  } catch (e) {
    throw wrapNetworkError(e)
  }

  const data = (await res.json().catch(() => null)) as ChatCompletionResponse | null

  if (!res.ok) {
    const detail = data?.error?.message ?? JSON.stringify(data) ?? ''
    throw new Error(`HTTP ${res.status}：${detail}`)
  }

  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    throw new Error(`响应格式异常：${JSON.stringify(data)}`)
  }
  return content
}
