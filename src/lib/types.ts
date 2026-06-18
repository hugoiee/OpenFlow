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

/** 模型名输入建议（OpenAI 常见模型，用作 datalist 提示，非固定列表）。 */
export const MODEL_OPTIONS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-3.5-turbo',
] as const

/** 第三方中转 API 配置（OpenAI 兼容）。 */
export type ApiSettings = {
  /** 中转端 base URL，OpenAI 兼容，如 https://api.example.com/v1 */
  baseURL: string
  apiKey: string
  /** 新建 Model 节点时的默认模型名。 */
  defaultModel: string
}
