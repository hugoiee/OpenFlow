// 前后端共享的纯数据契约（不依赖 React / React Flow）。

/** 支持的模型供应商 id（均 OpenAI 兼容 /chat/completions）。 */
export type ProviderId = 'openai' | 'deepseek' | 'kimi' | 'qwen' | 'glm' | 'custom'

/** 供应商预置：名称 + 默认 BaseURL。 */
export type ProviderPreset = {
  id: ProviderId
  name: string
  /** 预置默认 base URL；custom 为空，由用户填写。 */
  defaultBaseURL: string
}

/** 内置供应商列表（OpenAI 兼容）。 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: 'openai', name: 'OpenAI', defaultBaseURL: 'https://api.openai.com/v1' },
  { id: 'deepseek', name: 'DeepSeek', defaultBaseURL: 'https://api.deepseek.com/v1' },
  { id: 'kimi', name: '月之暗面 Kimi', defaultBaseURL: 'https://api.moonshot.cn/v1' },
  {
    id: 'qwen',
    name: '通义 Qwen',
    defaultBaseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  { id: 'glm', name: '智谱 GLM', defaultBaseURL: 'https://open.bigmodel.cn/api/paas/v4' },
  { id: 'custom', name: '自定义 / 中转', defaultBaseURL: '' },
]

/** 单个供应商的完整配置（含 key，仅后端持久化）。 */
export type ProviderConfig = {
  apiKey: string
  baseURL: string
  selectedModel: string
  models: string[]
}

/** 调用 / 拉模型所需的最小端点信息。 */
export type ProviderEndpoint = Pick<ProviderConfig, 'baseURL' | 'apiKey'>

/** 供应商配置的「公开」视图：不含 key，只回 hasKey 标志（GET /api/settings 用）。 */
export type ProviderConfigPublic = {
  baseURL: string
  selectedModel: string
  models: string[]
  hasKey: boolean
}

/** 项目 DTO：nodes/edges 在后端按不透明 JSON 存取（前端自行强类型化）。 */
export type ProjectDTO = {
  id: string
  name: string
  nodes: unknown[]
  edges: unknown[]
}

/** GET /api/settings 响应。 */
export type SettingsDTO = {
  activeProviderId: ProviderId
  configs: Partial<Record<ProviderId, ProviderConfigPublic>>
}

/** PUT /api/settings 请求体：写入某供应商配置（含 key）+ 设为激活。 */
export type SaveSettingsBody = {
  providerId: ProviderId
  apiKey?: string
  baseURL: string
  selectedModel: string
  models: string[]
}

/** POST /api/models 请求体（用某供应商已存或临时传入的凭据拉模型）。 */
export type FetchModelsBody = {
  providerId: ProviderId
  baseURL: string
  /** 未提供时后端用已存的 key。 */
  apiKey?: string
}

/** POST /api/run 请求体。 */
export type RunModelBody = {
  model: string
  prompt: string
}

/** POST /api/aigc 请求体（图像生成，经后端代理到 AIGC 接口）。 */
export type GenImageBody = {
  /** 调用方署名（req_from），由前端填写；为空时后端回退默认值。 */
  reqFrom: string
  /** AIGC 接口的 model_name（如 gpt-image-2）。 */
  model: string
  /** 生成 / 编辑指令。 */
  prompt: string
  /** 待编辑的输入图片 URL 列表（纯文生图时为空）。 */
  images: string[]
  /** 出图尺寸，如 1024x1024 / auto。 */
  size: string
  /** 出图张数。 */
  n: number
  /** 出图质量，如 auto / low / medium / high。 */
  quality: string
}
