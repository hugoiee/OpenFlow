import type { Edge, Node } from '@xyflow/react'

/** 节点种类：文本 prompt / 图像生成 / 视频生成。 */
export type FlowNodeType = 'prompt' | 'image' | 'video'

/** 纯文字 prompt 节点的数据。 */
export type PromptNodeData = {
  label: string
  text: string
}

/** 图像 / 视频生成节点的数据（共用结构）。model 为具名模型预置。 */
export type GenerationNodeData = {
  label: string
  model: string
}

/** React Flow 节点类型（带上各自的 data）。 */
export type PromptNode = Node<PromptNodeData, 'prompt'>
export type ImageNode = Node<GenerationNodeData, 'image'>
export type VideoNode = Node<GenerationNodeData, 'video'>
export type FlowNode = PromptNode | ImageNode | VideoNode

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
