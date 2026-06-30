import type { Edge, Node } from '@xyflow/react'

/** 节点种类：文本 prompt / 图像生成 / 视频生成。 */
export type FlowNodeType = 'prompt' | 'image' | 'video'

/** 纯文字 prompt 节点的数据。 */
export type PromptNodeData = {
  label: string
  text: string
}

/** 生成节点的基础数据（视频节点用，占位待接入）。model 为具名模型预置。 */
export type GenerationNodeData = {
  label: string
  model: string
}

/** 图像生成节点的数据：具名模型 + 可调选项 + 运行状态与结果。 */
export type ImageNodeData = {
  label: string
  /** 具名模型展示名（如 Image 2）。 */
  model: string
  /** 调用方署名（req_from），由用户填写。 */
  reqFrom: string
  /** 输入图片 URL，每行一个（纯文生图时为空）。 */
  imagesText: string
  /** 出图尺寸，如 1024x1024 / auto。 */
  size: string
  /** 出图张数。 */
  n: number
  /** 出图质量，如 auto / low / medium / high。 */
  quality: string
  // ↓ Nano Banana 专用（Image 2 节点不设；旧数据缺失 → 组件给默认值兜底）：
  /** version：gemini-3-pro-image-preview 等。 */
  version?: string
  /** config.aspect_ratio，如 16:9。 */
  aspectRatio?: string
  /** config.image_size，1K / 2K / 4K。 */
  imageSize?: string
  /** 是否正在生成。 */
  running: boolean
  /** 生成结果的图片 URL 列表，未运行时为空。 */
  result: string[]
  /** 上次运行的错误信息（成功则清空）。 */
  error?: string
}

/** React Flow 节点类型（带上各自的 data）。 */
export type PromptNode = Node<PromptNodeData, 'prompt'>
export type ImageNode = Node<ImageNodeData, 'image'>
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
