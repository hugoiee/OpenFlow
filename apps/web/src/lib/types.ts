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

// 供应商相关的纯数据类型集中在 @openflow/shared，前后端共用。
export type {
  ProviderId,
  ProviderPreset,
  ProviderConfig,
  ProviderEndpoint,
} from '@openflow/shared'
export { PROVIDER_PRESETS } from '@openflow/shared'
