// LLM 接入层：把「两种线格式（OpenAI Responses / Chat Completions）」的差异集中在这一个文件里。
// agent.ts 只管画布 Agent 的业务语义（系统提示词、JSON 计划解析），协议细节一律走这里。
//
// 为什么单独成文件：chat/expand/连接测试/列模型 四处此前把「超时 + 网络错误翻译 + 先 text 再 JSON
// + HTTP 错误文案」逐字复制了四遍，改一处必漏三处；而两种协议的字段名、嵌套层级、参数下限又完全不同，
// 只能靠纯函数 + 单测钉住（见 llm.test.ts）。

import type { AgentApiStyle, AgentMessage, SettingsDTO } from '@openflow/shared'

// 设置优先，env 兜底，均无则报错引导配置（四项一致）
const AGENT_ENDPOINT = process.env.AGENT_ENDPOINT ?? ''
const AGENT_API_KEY = process.env.AGENT_API_KEY ?? ''
const AGENT_MODEL = process.env.AGENT_MODEL ?? ''
const AGENT_API_STYLE = process.env.AGENT_API_STYLE ?? ''

/** 未选择/脏值时的协议：用户实际在用的网关走 Responses，故默认它。 */
const DEFAULT_API_STYLE: AgentApiStyle = 'responses'

/**
 * 连接测试的输出上限。Responses 侧 max_output_tokens **有下限 16**，
 * 照搬 chat 侧的 1 会被网关以 "expected value >= 16" 直接 400——只探连通却报错，最难查。
 */
const PROBE_MAX_OUTPUT_TOKENS = 16

/** 协议归一：非法值/空/旧数据一律回退默认（大小写不敏感）。 */
export function normalizeAgentApiStyle(v: unknown): AgentApiStyle {
  if (typeof v !== 'string') return DEFAULT_API_STYLE
  const s = v.trim().toLowerCase()
  return s === 'responses' || s === 'chat' ? s : DEFAULT_API_STYLE
}

/**
 * 剥掉端点末尾的已知后缀（/responses、/chat/completions、/models）取回基址。
 * 单独抽出来是因为**切协议**必须能换掉用户已填的另一种后缀：
 * https://gw/v1/chat/completions 切到 responses 若不先剥，会拼成 .../chat/completions/responses。
 */
function stripLlmSuffix(path: string): string {
  return path
    .replace(/\/+$/, '')
    .replace(/\/(responses|models)$/i, '')
    .replace(/\/chat\/completions$/i, '')
}

/** 按 style 把端点规范成完整调用地址；先剥已知后缀再补，故对任何写法都幂等。 */
export function resolveLlmUrl(endpoint: string, style: AgentApiStyle): string {
  const suffix = style === 'responses' ? '/responses' : '/chat/completions'
  return appendPath(endpoint, suffix)
}

/** 从端点推导 GET /models 地址（与协议无关：两种后缀都剥回同一基址）。 */
export function resolveModelsUrl(endpoint: string): string {
  return appendPath(endpoint, '/models')
}

/**
 * 在端点基址后追加路径。用 new URL 只改 pathname，保住查询串与锚点
 * （如 Azure 的 ?api-version=、带 token 的网关）；非标准 URL 退回字符串拼接，交给 fetch 报错。
 */
function appendPath(endpoint: string, suffix: string): string {
  try {
    const url = new URL(endpoint)
    url.pathname = `${stripLlmSuffix(url.pathname)}${suffix}`
    return url.toString()
  } catch {
    return `${stripLlmSuffix(endpoint)}${suffix}`
  }
}

// ---- 请求体构造（纯函数：只产出对象，不碰 fetch / URL / settings）----

/** 画布 Agent 对话：带生图系统提示词 + 多轮历史。 */
export function buildPlanRequestBody(
  style: AgentApiStyle,
  input: { model: string; systemPrompt: string; messages: AgentMessage[] },
): unknown {
  if (style === 'responses') {
    return {
      model: input.model,
      // Responses 的系统提示词走一等参数 instructions（而非塞进 input 里的 system 角色）；
      // 若某网关的转译层吞掉它（表现为 actions 恒为空、reply 是散文），这里改成
      // input 首项 {role:'system',content:systemPrompt} 即可，是唯一改动点。
      instructions: input.systemPrompt,
      input: input.messages.map((m) => ({ role: m.role, content: m.content })),
      // 推理型模型可能拒收 temperature（Unsupported parameter）；真遇到就从这里摘
      temperature: 0.6,
    }
  }
  return {
    model: input.model,
    messages: [{ role: 'system', content: input.systemPrompt }, ...input.messages],
    temperature: 0.6,
  }
}

/** 分镜逐行扩写：模板即完整指令，两种协议都刻意不带系统提示词。 */
export function buildExpandRequestBody(
  style: AgentApiStyle,
  input: { model: string; prompt: string },
): unknown {
  if (style === 'responses') {
    // input 直接给裸字符串（等价于单条 user message），不发 instructions
    return { model: input.model, input: input.prompt, temperature: 0.6 }
  }
  return {
    model: input.model,
    messages: [{ role: 'user', content: input.prompt }],
    temperature: 0.6,
  }
}

/** 最小用量连接测试：只探连通/鉴权/模型可用，不解析响应内容（原因见 readLlmText 的注释）。 */
export function buildProbeRequestBody(style: AgentApiStyle, input: { model: string }): unknown {
  if (style === 'responses') {
    return {
      model: input.model,
      input: 'ping',
      max_output_tokens: PROBE_MAX_OUTPUT_TOKENS,
      temperature: 0,
    }
  }
  return {
    model: input.model,
    messages: [{ role: 'user', content: 'ping' }],
    max_tokens: 1,
    temperature: 0,
  }
}

// ---- 响应解析 ----

/**
 * 取文本的结果：拿到非空文本，或一条可读的中文原因。
 * withRaw=调用方应把原始响应片段附在错误后面（形状完全对不上时，原文才是唯一线索）。
 */
export type LlmTextResult = { text: string } | { error: string; withRaw?: boolean }

/** 从 LLM 错误响应里尽量取可读信息（两种协议的错误体同为 {error:{message}}，共用）。 */
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

/** Responses 的 output[] → 文本：只收 message 项里的 output_text 分片。 */
function collectResponsesText(output: unknown): { text: string; refusal?: string } {
  if (!Array.isArray(output)) return { text: '' }
  const parts: string[] = []
  let refusal: string | undefined
  for (const item of output) {
    if (!item || typeof item !== 'object') continue
    const it = item as Record<string, unknown>
    // 推理模型会把 type:'reasoning' 排在 output 首位且没有文本，只取 output[0] 必然拿到空
    if (it.type !== 'message') continue
    if (!Array.isArray(it.content)) continue
    for (const part of it.content) {
      if (!part || typeof part !== 'object') continue
      const p = part as Record<string, unknown>
      if (p.type === 'output_text' && typeof p.text === 'string') parts.push(p.text)
      else if (p.type === 'refusal' && typeof p.refusal === 'string') refusal = p.refusal
    }
  }
  return { text: parts.join(''), ...(refusal ? { refusal } : {}) }
}

/**
 * 把两种协议的响应统一收敛成「一段文本」或「一条可读错误」。
 * 软失败（HTTP 200 但 status=incomplete / 内容是 refusal）也在这里翻译——Responses 侧这类失败
 * 不体现在 HTTP 码上，漏掉就会退化成「返回内容为空」这种查不动的报错。
 *
 * ⚠️ 连接测试**刻意不调用本函数**：推理模型在 16 token 上限下必然返回 status:'incomplete' 且
 * output 里只有 reasoning 项，一解析就会把完全正常的网关误报成失败。
 */
export function readLlmText(style: AgentApiStyle, data: unknown): LlmTextResult {
  const o = (data ?? null) as Record<string, unknown> | null
  if (style === 'chat') {
    const choice = Array.isArray(o?.choices) ? (o.choices[0] as Record<string, unknown>) : undefined
    const message = choice?.message as Record<string, unknown> | undefined
    const content = message?.content
    if (typeof content === 'string' && content.trim()) return { text: content.trim() }
    if (typeof message?.refusal === 'string' && message.refusal) {
      return { error: `模型拒绝作答：${message.refusal}` }
    }
    if (choice?.finish_reason === 'content_filter') return { error: '内容被上游安全策略拦截' }
    return { error: '返回内容为空或非 chat/completions 格式', withRaw: true }
  }

  // output_text 是 SDK 便捷字段，裸 HTTP 响应常常没有；**必须判非空**再采用——
  // 真实网关会回 output_text:''，用 ?? 短路就会明明 output[] 有内容却报「返回为空」
  const flat = o?.output_text
  if (typeof flat === 'string' && flat.trim()) return { text: flat.trim() }

  const { text, refusal } = collectResponsesText(o?.output)
  if (text.trim()) return { text: text.trim() }
  if (refusal) return { error: `模型拒绝作答：${refusal}` }
  if (o?.status === 'incomplete') {
    const reason = (o.incomplete_details as Record<string, unknown> | undefined)?.reason
    return { error: `生成未完成（${typeof reason === 'string' ? reason : '原因未知'}）` }
  }
  if (o?.status === 'failed' || o?.error) {
    return { error: `上游报告生成失败：${extractLlmError(o) ?? '(未给出原因)'}` }
  }
  // 形状完全对不上（例如协议选错、收到的是 chat 的 {choices:[...]}）：附原文供诊断
  return { error: '返回内容为空或非 responses 格式', withRaw: true }
}

/**
 * 从 /models 响应稳健解析出模型 ID 列表。
 * 兼容三种形态：OpenAI 的 { data: [{ id }] } / 顶层数组 / 字符串数组；去重后按字母排序。
 */
export function parseModelList(data: unknown): string[] {
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

// ---- 配置解析 ----

export type AgentRuntimeConfig = {
  endpoint: string
  apiKey: string
  model: string
  apiStyle: AgentApiStyle
}

/** 连接测试/列模型允许用「尚未保存的草稿值」试，故各字段可被入参覆盖。 */
export type AgentConfigOverride = {
  endpoint?: string
  apiKey?: string
  model?: string
  apiStyle?: AgentApiStyle
}

/**
 * 端点/Key/模型/协议的三级回退：override → settings → env（协议再兜底到默认值）。
 * ⚠️ 抛出的缺失错误必须含「请在设置中填写」——routes/agent.ts 靠这个子串把 502 分流成 400。
 * requireModel=false 供列模型用（列模型不需要模型名）。
 */
export function resolveAgentConfig(
  settings: SettingsDTO,
  override?: AgentConfigOverride,
  opts?: { requireModel?: boolean },
): AgentRuntimeConfig {
  const endpoint = override?.endpoint?.trim() || settings.agentEndpoint.trim() || AGENT_ENDPOINT
  if (!endpoint) throw new Error('未配置 Agent 接口地址，请在设置中填写')
  const model = override?.model?.trim() || settings.agentModel.trim() || AGENT_MODEL
  if (!model && opts?.requireModel !== false) {
    throw new Error('未配置 Agent 模型名，请在设置中填写')
  }
  const apiKey = override?.apiKey?.trim() || settings.agentApiKey.trim() || AGENT_API_KEY
  const apiStyle = normalizeAgentApiStyle(
    override?.apiStyle || settings.agentApiStyle || AGENT_API_STYLE,
  )
  return { endpoint, apiKey, model, apiStyle }
}

// ---- 网络层（本模块唯一的副作用出口）----

export type LlmRequestOptions = {
  url: string
  apiKey: string
  /** 有 body = POST JSON；省略 = GET（列模型用）。 */
  body?: unknown
  timeoutMs: number
  /** 错误文案里的动作名，如「Agent LLM 请求」「连接测试」「获取模型列表」。 */
  label: string
}

/**
 * 统一的 LLM HTTP 调用：Bearer 鉴权（Key 为空则不带头）、超时、先读 text 再试 JSON
 * （非 JSON 响应如 HTML 门户页也能给出有内容的报错）、非 2xx 与网络失败翻译成可读中文。
 * 返回 raw 供调用方在「形状对不上」时附原文片段。
 */
export async function requestLlmJson(
  o: LlmRequestOptions,
): Promise<{ data: unknown; raw: string }> {
  const seconds = Math.round(o.timeoutMs / 1000)
  let res: Response
  try {
    res = await fetch(o.url, {
      method: o.body === undefined ? 'GET' : 'POST',
      headers: {
        ...(o.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(o.apiKey ? { Authorization: `Bearer ${o.apiKey}` } : {}),
      },
      ...(o.body === undefined ? {} : { body: JSON.stringify(o.body) }),
      signal: AbortSignal.timeout(o.timeoutMs),
    })
  } catch (e) {
    // 网络层失败：把地址与底层原因翻译成可读中文，方便定位是配置写错还是网关挂了
    if (e instanceof Error && e.name === 'TimeoutError') {
      throw new Error(`${o.label}超时（${seconds} 秒无响应）：${o.url}，请检查 Agent 接口地址`)
    }
    const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : undefined
    throw new Error(
      `${o.label}失败（${o.url}）：${cause ?? (e instanceof Error ? e.message : String(e))}`,
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
      `${o.label}失败 HTTP ${res.status}：${extractLlmError(data) ?? (raw.trim().slice(0, 300) || '(空响应)')}`,
    )
  }
  return { data, raw }
}

/** 把 readLlmText 的错误结果拼成最终异常文案（形状对不上时附原始响应片段）。 */
export function llmTextError(label: string, r: { error: string; withRaw?: boolean }, raw: string) {
  const tail = r.withRaw ? `：${raw.trim().slice(0, 200) || '(空响应)'}` : ''
  return new Error(`${label}${r.error}${tail}`)
}
