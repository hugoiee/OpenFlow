import type {
  AgentChatResponse,
  AgentImageAction,
  AgentMessage,
  AgentModelsBody,
  AgentTestBody,
  SettingsDTO,
} from '@openflow/shared'

// 画布 Agent 的 LLM（OpenAI 兼容 /chat/completions）；设置优先，env 兜底，均无则报错引导配置
const AGENT_ENDPOINT = process.env.AGENT_ENDPOINT ?? ''
const AGENT_API_KEY = process.env.AGENT_API_KEY ?? ''
const AGENT_MODEL = process.env.AGENT_MODEL ?? ''

// 单轮最多执行的生图动作数，防止模型失控刷屏画布
const MAX_ACTIONS = 8

const SYSTEM_PROMPT = `你是 OpenFlow 节点式 AI 画布的内置 Agent。用户用自然语言描述想法和想要的画面，你把它变成画布上的生图动作。

你必须只输出一个 JSON 对象（不要 markdown 代码块、不要任何多余文字），结构如下：
{
  "reply": "给用户的简短中文答复（说明你做了什么，或要追问什么）",
  "actions": [
    { "title": "这组节点的简短标题（不超过12字）", "model": "Nano Banana", "prompt": "完整的生图提示词" }
  ]
}

规则：
- 每个 action 会在画布上生成一组「Prompt 节点 → 图像节点」并立即开始生成。
- prompt 要写成高质量的文生图提示词：把主体、场景、光线、构图、色彩、风格、氛围展开成具体细节，可用中文。
- model 只能是 "Nano Banana" 或 "Image 2"，用户没有特殊要求时用 "Nano Banana"。
- 用户想要多张不同画面或多种风格时，输出多个 action（每个画面一个）。
- 用户没有描述要生成的画面（闲聊、问功能、信息不足需要追问）时，actions 为空数组 []，在 reply 里回答或追问。
- reply 保持简短（1~3 句），不要把 prompt 全文复述在 reply 里。`

/**
 * 把配置的端点规范成完整 /chat/completions 地址（已带该后缀则原样使用）。
 * 按 URL pathname 判断/追加，保住查询串与锚点（如 Azure 的 ?api-version=、带 token 的网关）。
 */
export function resolveChatCompletionsUrl(endpoint: string): string {
  try {
    const url = new URL(endpoint)
    const path = url.pathname.replace(/\/+$/, '')
    if (!/\/chat\/completions$/i.test(path)) url.pathname = `${path}/chat/completions`
    return url.toString()
  } catch {
    // 非标准 URL：退回纯字符串拼接，交给 fetch 报错
    const base = endpoint.replace(/\/+$/, '')
    return /\/chat\/completions$/i.test(base) ? base : `${base}/chat/completions`
  }
}

/**
 * 从配置的端点推导 GET /models 地址（用于动态获取可用模型列表）。
 * 若端点配成 .../chat/completions，剥掉该层取基址；保住查询串（如 Azure 的 ?api-version=）。
 */
export function resolveModelsUrl(endpoint: string): string {
  try {
    const url = new URL(endpoint)
    let path = url.pathname.replace(/\/+$/, '').replace(/\/chat\/completions$/i, '')
    if (!/\/models$/i.test(path)) path = `${path}/models`
    url.pathname = path
    return url.toString()
  } catch {
    // 非标准 URL：退回纯字符串拼接，交给 fetch 报错
    const base = endpoint.replace(/\/+$/, '').replace(/\/chat\/completions$/i, '')
    return /\/models$/i.test(base) ? base : `${base}/models`
  }
}

/**
 * 从 /models 响应稳健解析出模型 ID 列表。
 * 兼容三种形态：OpenAI 的 { data: [{ id }] } / 顶层数组 / 字符串数组；去重后按字母排序。
 */
function parseModelList(data: unknown): string[] {
  const arr: unknown[] = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).data)
      ? ((data as Record<string, unknown>).data as unknown[])
      : []
  const ids = new Set<string>()
  for (const item of arr) {
    if (typeof item === 'string') {
      if (item.trim()) ids.add(item.trim())
    } else if (item && typeof item === 'object') {
      const id = (item as Record<string, unknown>).id
      if (typeof id === 'string' && id.trim()) ids.add(id.trim())
    }
  }
  return [...ids].sort((a, b) => a.localeCompare(b))
}

/**
 * 调 OpenAI 兼容端点的 GET /models 列出可用模型 ID。
 * 端点/Key：入参非空优先，否则回退已存设置，再回退 env；端点缺失或响应为空/格式不符时抛可读错误。
 * （前端据此把「手填模型名」换成动态下拉；抛错时前端回退手填。）
 */
export async function listAgentModels(
  override: AgentModelsBody,
  settings: SettingsDTO,
): Promise<string[]> {
  const endpoint = override.endpoint?.trim() || settings.agentEndpoint.trim() || AGENT_ENDPOINT
  if (!endpoint) throw new Error('未配置 Agent 接口地址，请在设置中填写')
  const apiKey = override.apiKey?.trim() || settings.agentApiKey.trim() || AGENT_API_KEY

  const url = resolveModelsUrl(endpoint)
  let res: Response
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      // 列模型应很快返回，30 秒足以判定
      signal: AbortSignal.timeout(30_000),
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      throw new Error(`获取模型列表超时（30 秒无响应）：${url}，请检查 Agent 接口地址`)
    }
    const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : undefined
    throw new Error(
      `获取模型列表失败（${url}）：${cause ?? (e instanceof Error ? e.message : String(e))}`,
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
      `获取模型列表失败 HTTP ${res.status}：${extractLlmError(data) ?? (raw.trim().slice(0, 300) || '(空响应)')}`,
    )
  }
  const models = parseModelList(data)
  if (models.length === 0) {
    throw new Error(`该端点未返回可用模型（GET /models 响应为空或格式不符）：${url}`)
  }
  return models
}

/** 从 LLM 错误响应里尽量取可读信息。 */
export function extractLlmError(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined
  const o = data as Record<string, unknown>
  for (const v of [o.error, o.message, o.msg]) {
    if (typeof v === 'string' && v) return v
    if (v && typeof v === 'object') {
      const m = (v as Record<string, unknown>).message
      if (typeof m === 'string' && m) return m
    }
  }
  return undefined
}

/**
 * 从首个 { 起做括号平衡扫描（识别字符串与转义），取出第一个完整 JSON 对象。
 * 天然容忍 ```json 围栏与 JSON 后面追加的说明文字，且不会误伤字符串里的大括号/反引号。
 */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

/** 校验并规整模型给的 actions：丢掉无 prompt 的项，model 归一到两个合法值。 */
function normalizeActions(v: unknown): AgentImageAction[] {
  if (!Array.isArray(v)) return []
  const out: AgentImageAction[] = []
  for (const item of v) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const prompt = typeof o.prompt === 'string' ? o.prompt.trim() : ''
    if (!prompt) continue
    const model = o.model === 'Image 2' ? 'Image 2' : 'Nano Banana'
    const title =
      typeof o.title === 'string' && o.title.trim() ? o.title.trim().slice(0, 24) : undefined
    out.push({ prompt, model, ...(title ? { title } : {}) })
  }
  return out.slice(0, MAX_ACTIONS)
}

/** 解析 LLM 输出为计划；不是合法 JSON 时整段当普通答复（不做画布动作）。 */
function parsePlan(content: string): AgentChatResponse {
  const jsonText = extractJsonObject(content)
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as { reply?: unknown; actions?: unknown }
      const reply =
        typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim() : ''
      const actions = normalizeActions(parsed.actions)
      if (reply || actions.length > 0) {
        return { reply: reply || '好的，已开始在画布上生成。', actions }
      }
    } catch {
      // 落到下方兜底
    }
  }
  return { reply: content.trim(), actions: [] }
}

/**
 * 调 OpenAI 兼容接口跑一轮 Agent 对话 → 答复 + 画布动作计划。
 * 端点/Key/模型：设置非空优先，否则回退 env；端点或模型都取不到时抛可读错误。
 */
export async function runAgentChat(
  messages: AgentMessage[],
  settings: SettingsDTO,
): Promise<AgentChatResponse> {
  const endpoint = settings.agentEndpoint.trim() || AGENT_ENDPOINT
  if (!endpoint) throw new Error('未配置 Agent 接口地址，请在设置中填写')
  const model = settings.agentModel.trim() || AGENT_MODEL
  if (!model) throw new Error('未配置 Agent 模型名，请在设置中填写')
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
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        temperature: 0.6,
      }),
      // LLM 长回复可能较慢，但不能无限挂着占住请求
      signal: AbortSignal.timeout(120_000),
    })
  } catch (e) {
    // 网络层失败：把地址与底层原因翻译成可读中文，方便定位是配置写错还是网关挂了
    if (e instanceof Error && e.name === 'TimeoutError') {
      throw new Error(`Agent LLM 请求超时（120 秒无响应）：${url}，请检查 Agent 接口地址`)
    }
    const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : undefined
    throw new Error(
      `Agent LLM 请求失败（${url}）：${cause ?? (e instanceof Error ? e.message : String(e))}`,
    )
  }
  // 先按文本读，再尝试 JSON：非 JSON 响应（HTML 门户页等）也能给出有内容的报错
  const raw = await res.text().catch(() => '')
  let data: unknown = null
  try {
    data = JSON.parse(raw)
  } catch {
    // 非 JSON 响应，data 留 null
  }
  if (!res.ok) {
    throw new Error(
      `Agent LLM HTTP ${res.status}：${extractLlmError(data) ?? (raw.trim().slice(0, 300) || '(空响应)')}`,
    )
  }
  const content = (
    data as { choices?: { message?: { content?: unknown } }[] } | null
  )?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error(
      `Agent LLM 返回内容为空或非 chat/completions 格式：${raw.trim().slice(0, 200) || '(空响应)'}`,
    )
  }
  return parsePlan(content)
}

/**
 * 最小用量连接测试：用配置的 endpoint/key/model 发一条极小的 chat/completions 请求
 * （max_tokens:1），验证接口可达、鉴权有效、模型被接受，只耗 ~1 个输出 token。
 * 端点/模型：入参非空优先，否则回退已存设置，再回退 env；缺失时抛可读错误（供 400）。
 * apiKey 入参为空则回退已存密钥/env（沿用写入-only 语义：不传即测已保存的 Key）。
 */
export async function runAgentConnectionTest(
  override: AgentTestBody,
  settings: SettingsDTO,
): Promise<{ model: string; latencyMs: number }> {
  const endpoint = override.endpoint?.trim() || settings.agentEndpoint.trim() || AGENT_ENDPOINT
  if (!endpoint) throw new Error('未配置 Agent 接口地址，请在设置中填写')
  const model = override.model?.trim() || settings.agentModel.trim() || AGENT_MODEL
  if (!model) throw new Error('未配置 Agent 模型名，请在设置中填写')
  const apiKey = override.apiKey?.trim() || settings.agentApiKey.trim() || AGENT_API_KEY

  const url = resolveChatCompletionsUrl(endpoint)
  const startedAt = Date.now()
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      // 最小用量：只探连通，限制输出 1 token、temperature 0
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        temperature: 0,
      }),
      // 连接测试不该久等，30 秒足以判定可达性
      signal: AbortSignal.timeout(30_000),
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      throw new Error(`连接测试超时（30 秒无响应）：${url}，请检查 Agent 接口地址`)
    }
    const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : undefined
    throw new Error(
      `连接测试失败（${url}）：${cause ?? (e instanceof Error ? e.message : String(e))}`,
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
      `连接测试失败 HTTP ${res.status}：${extractLlmError(data) ?? (raw.trim().slice(0, 300) || '(空响应)')}`,
    )
  }
  return { model, latencyMs: Date.now() - startedAt }
}
