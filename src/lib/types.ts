import type { Edge, Node } from '@xyflow/react'

/** 节点种类。 */
export type FlowNodeType = 'prompt' | 'model'

/** 纯文字 prompt 节点的数据。 */
export type PromptNodeData = {
  label: string
  text: string
}

/** 模型调用节点的数据。 */
export type ModelNodeData = {
  label: string
  model: string
  /** 上一次运行返回的（mock）结果，未运行时为空。 */
  result: string
  /** 是否正在运行。 */
  running: boolean
}

/** React Flow 节点类型（带上各自的 data）。 */
export type PromptNode = Node<PromptNodeData, 'prompt'>
export type ModelNode = Node<ModelNodeData, 'model'>
export type FlowNode = PromptNode | ModelNode

/** 一个项目 = 一块画布。 */
export type Project = {
  id: string
  name: string
  nodes: FlowNode[]
  edges: Edge[]
}

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

/** 单个供应商的配置。 */
export type ProviderConfig = {
  apiKey: string
  baseURL: string
  /** 选定用于运行的模型名。 */
  selectedModel: string
  /** 上次从 /models 拉取到的可用模型列表。 */
  models: string[]
}

/** 调用与拉取模型时需要的最小端点信息。 */
export type ProviderEndpoint = Pick<ProviderConfig, 'baseURL' | 'apiKey'>
