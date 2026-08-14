import type {
  AgentApiStyle,
  AgentChatResponse,
  AgentExpandBody,
  AgentExpandResponse,
  AgentImageAction,
  AgentMessage,
  AgentModelsBody,
  AgentTestBody,
  SettingsDTO,
} from '@openflow/shared'
import {
  buildExpandRequestBody,
  buildPlanRequestBody,
  buildProbeRequestBody,
  llmTextError,
  parseModelList,
  readLlmText,
  requestLlmJson,
  resolveAgentConfig,
  resolveLlmUrl,
  resolveModelsUrl,
} from './llm'

// 本文件只管画布 Agent 的业务语义（系统提示词 + JSON 计划解析）；
// 端点推导 / 两种线格式的请求体与响应解析 / 超时与错误翻译全在 llm.ts。

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
 * 列出端点 GET /models 的可用模型 ID（与线格式无关，两种协议共用同一个地址）。
 * 端点/Key：入参非空优先，否则回退已存设置，再回退 env；端点缺失或响应为空/格式不符时抛可读错误。
 * （前端据此把「手填模型名」换成动态下拉；抛错时前端回退手填。）
 */
export async function listAgentModels(
  override: AgentModelsBody,
  settings: SettingsDTO,
): Promise<string[]> {
  // 列模型不需要模型名，故 requireModel:false
  const cfg = resolveAgentConfig(settings, override, { requireModel: false })
  const url = resolveModelsUrl(cfg.endpoint)
  // 列模型应很快返回，30 秒足以判定
  const { data } = await requestLlmJson({
    url,
    apiKey: cfg.apiKey,
    timeoutMs: 30_000,
    label: '获取模型列表',
  })
  const models = parseModelList(data)
  if (models.length === 0) {
    throw new Error(`该端点未返回可用模型（GET /models 响应为空或格式不符）：${url}`)
  }
  return models
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
 * 跑一轮 Agent 对话 → 答复 + 画布动作计划。
 * 端点/Key/模型/协议：设置非空优先，否则回退 env；端点或模型都取不到时抛可读错误。
 */
export async function runAgentChat(
  messages: AgentMessage[],
  settings: SettingsDTO,
): Promise<AgentChatResponse> {
  const cfg = resolveAgentConfig(settings)
  const { data, raw } = await requestLlmJson({
    url: resolveLlmUrl(cfg.endpoint, cfg.apiStyle),
    apiKey: cfg.apiKey,
    body: buildPlanRequestBody(cfg.apiStyle, {
      model: cfg.model,
      systemPrompt: SYSTEM_PROMPT,
      messages,
    }),
    // LLM 长回复可能较慢，但不能无限挂着占住请求
    timeoutMs: 120_000,
    label: 'Agent LLM 请求',
  })
  const text = readLlmText(cfg.apiStyle, data)
  if ('error' in text) throw llmTextError('Agent LLM ', text, raw)
  return parsePlan(text.text)
}

/**
 * 脚本分镜逐行扩写：把模板中的 {{line}} 全部替换为台词行后作为唯一一条用户输入单次调 LLM。
 * 刻意不带画布 Agent 的生图 SYSTEM_PROMPT——模板本身就是完整指令，输出是纯文本 prompt 而非 JSON 计划。
 */
export async function runAgentExpand(
  body: AgentExpandBody,
  settings: SettingsDTO,
): Promise<AgentExpandResponse> {
  // 模型可被请求体覆盖（分镜节点各自选模型）；端点/密钥/协议仍统一取全局设置
  const cfg = resolveAgentConfig(settings, { model: body.model })
  const { data, raw } = await requestLlmJson({
    url: resolveLlmUrl(cfg.endpoint, cfg.apiStyle),
    apiKey: cfg.apiKey,
    body: buildExpandRequestBody(cfg.apiStyle, {
      model: cfg.model,
      prompt: body.template.replaceAll('{{line}}', body.line),
    }),
    timeoutMs: 120_000,
    label: 'Agent LLM 请求',
  })
  const text = readLlmText(cfg.apiStyle, data)
  if ('error' in text) throw llmTextError('Agent LLM ', text, raw)
  return { prompt: text.text }
}

/**
 * 最小用量连接测试：用配置的 endpoint/key/model/协议发一条极小的请求，
 * 验证接口可达、鉴权有效、模型被接受（chat 侧 max_tokens:1 / responses 侧 max_output_tokens:16）。
 * 入参非空优先，否则回退已存设置，再回退 env（apiKey 沿用写入-only 语义：不传即测已保存的 Key）。
 *
 * ⚠️ 刻意**只看 HTTP 状态、不解析响应内容**：推理型模型在这么小的输出上限下必然返回
 * status:'incomplete' 且 output 里只有 reasoning 项，一解析就会把完全正常的网关误报成失败。
 */
export async function runAgentConnectionTest(
  override: AgentTestBody,
  settings: SettingsDTO,
): Promise<{ model: string; apiStyle: AgentApiStyle; latencyMs: number }> {
  const cfg = resolveAgentConfig(settings, override)
  const startedAt = Date.now()
  await requestLlmJson({
    url: resolveLlmUrl(cfg.endpoint, cfg.apiStyle),
    apiKey: cfg.apiKey,
    body: buildProbeRequestBody(cfg.apiStyle, { model: cfg.model }),
    // 连接测试不该久等，30 秒足以判定可达性
    timeoutMs: 30_000,
    label: '连接测试',
  })
  return { model: cfg.model, apiStyle: cfg.apiStyle, latencyMs: Date.now() - startedAt }
}
