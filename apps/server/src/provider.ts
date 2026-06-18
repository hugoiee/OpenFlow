import type { ProviderEndpoint } from '@openflow/shared'

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
