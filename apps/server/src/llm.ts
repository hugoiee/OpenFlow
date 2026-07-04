import type { SettingsDTO } from '@openflow/shared'
import { extractLlmError, resolveChatCompletionsUrl } from './agent'

// Any LLM 节点的文本补全：复用画布 Agent 的 endpoint/key（OpenAI 兼容 /chat/completions），
// 但模型由节点自带、无系统提示词（纯文本补全，不强制 JSON），并按需下发原生推理参数。
const AGENT_ENDPOINT = process.env.AGENT_ENDPOINT ?? ''
const AGENT_API_KEY = process.env.AGENT_API_KEY ?? ''

/** 从 chat/completions 响应里取思考文本（不同网关字段名不一，全都兜一遍）。 */
function extractReasoning(message: Record<string, unknown> | undefined): string {
  if (!message) return ''
  for (const key of ['reasoning_content', 'reasoning', 'thinking']) {
    const v = message[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

/**
 * 调 OpenAI 兼容接口跑一次文本补全 → { text, reasoning }。
 * 端点/Key：设置里的画布 Agent 配置优先，否则回退 env AGENT_ENDPOINT/AGENT_API_KEY；均无则抛可读错误。
 * thinking=true 时下发 reasoning_effort（OpenAI 系）让模型开启思考；思考文本若返回则一并回传。
 */
export async function runLlmCompletion(params: {
  model: string
  prompt: string
  temperature: number
  thinking: boolean
  settings: SettingsDTO
}): Promise<{ text: string; reasoning: string }> {
  const { model, prompt, temperature, thinking, settings } = params
  const endpoint = settings.agentEndpoint.trim() || AGENT_ENDPOINT
  if (!endpoint) {
    throw new Error('未配置 LLM 接口地址（复用画布 Agent 设置），请在设置中填写 Agent 接口地址')
  }
  if (!model.trim()) throw new Error('未选择模型')
  const apiKey = settings.agentApiKey.trim() || AGENT_API_KEY

  const url = resolveChatCompletionsUrl(endpoint)
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        // 开启思考：下发 OpenAI 系原生推理参数（网关不支持时会报错，可关掉 Thinking 规避）
        ...(thinking ? { reasoning_effort: 'medium' } : {}),
      }),
      // 思考模式可能较慢；后台任务里跑，给足超时但不无限挂
      signal: AbortSignal.timeout(180_000),
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      throw new Error(`LLM 请求超时（180 秒无响应）：${url}，请检查接口地址`)
    }
    const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : undefined
    throw new Error(
      `LLM 请求失败（${url}）：${cause ?? (e instanceof Error ? e.message : String(e))}`,
    )
  }
  const raw = await res.text().catch(() => '')
  let data: unknown = null
  try {
    data = JSON.parse(raw)
  } catch {
    // 非 JSON 响应，data 留 null
  }
  if (!res.ok) {
    throw new Error(
      `LLM HTTP ${res.status}：${extractLlmError(data) ?? (raw.trim().slice(0, 300) || '(空响应)')}`,
    )
  }
  const message = (data as { choices?: { message?: Record<string, unknown> }[] } | null)
    ?.choices?.[0]?.message
  const content = message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error(
      `LLM 返回内容为空或非 chat/completions 格式：${raw.trim().slice(0, 200) || '(空响应)'}`,
    )
  }
  return { text: content.trim(), reasoning: extractReasoning(message) }
}
