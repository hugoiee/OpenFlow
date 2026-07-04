import type { Edge, Node } from '@xyflow/react'
import type { VideoTask } from './nodeCatalog'

/** 节点种类：文本 prompt / Any LLM / 图像生成 / 视频生成 / 桌面拖入的媒体素材。 */
export type FlowNodeType = 'prompt' | 'llm' | 'image' | 'video' | 'asset'

/** 纯文字 prompt 节点的数据。 */
export type PromptNodeData = {
  label: string
  text: string
}

/**
 * Any LLM 节点：把上游 Prompt/LLM 文本喂给一个 OpenAI 兼容模型，输出文本（供下游作 prompt）。
 * 调用复用画布 Agent 的 endpoint/key；模型/温度/思考在右侧 Inspector 里调。
 */
export type LlmNodeData = {
  label: string
  /** 模型名（预置下拉，作 chat/completions 的 model）。 */
  model: string
  /** 采样温度 0–2。 */
  temperature: number
  /** 是否开启思考（发送 reasoning_effort 等原生推理参数）。 */
  thinking: boolean
  /** 是否正在生成。 */
  running?: boolean
  /** 生成的回答文本（未运行时为空）。 */
  result?: string
  /** 模型思考过程（若返回；折叠展示）。 */
  reasoning?: string
  /** 上次运行的错误信息（成功则清空）。 */
  error?: string
  /** 进行中的异步任务 id：随节点存库，刷新后凭它重连轮询（关页面不丢结果）。 */
  taskId?: string
}

/**
 * 素材节点：承载从桌面拖入的一张图片 / 一段音频（已上传得到 URL）。
 * 纯「源」节点（只出不进）：图像素材连下游图像/视频节点作输入图，音频素材连视频节点作音轨。
 */
export type AssetNodeData = {
  label: string
  /** 素材种类：图像 / 音频。 */
  kind: 'image' | 'audio'
  /** 上传后的媒体 URL（上传完成前为空）。 */
  url: string
  /** 原始文件名（展示用）。 */
  fileName?: string
  /** 是否正在上传。 */
  uploading?: boolean
  /** 上传失败信息。 */
  error?: string
}

/** 视频生成节点（seedance）的数据：具名模型 + 可调选项 + 运行状态与结果。 */
export type GenerationNodeData = {
  label: string
  /** 具名模型展示名（如 Seedance）。 */
  model: string
  /** 输入图片 URL，每行一个（按 videoTask 决定其语义：首帧 / 首尾帧 / 参考图）。 */
  imagesText?: string
  /** 输入音频 URL，每行一个（作 audio_list；运行时与上游音频素材节点的 URL 合并）。 */
  audiosText?: string
  /** version：seedance-1.5-pro 等。 */
  version?: string
  /** 生成任务（前端 4 选 1）：文生 / 首帧 / 首尾帧 / 参考图；提交时映射回 mode + 有序图。 */
  videoTask?: VideoTask
  /** mode：first_last_frame / reference_image（旧字段，保留兼容；现由 videoTask 派生）。 */
  mode?: string
  /** config.resolution，如 720p。 */
  resolution?: string
  /** config.ratio（宽高比），如 16:9 / adaptive。 */
  ratio?: string
  /** config.duration，秒。 */
  duration?: number
  /** 是否正在生成。 */
  running?: boolean
  /** 生成结果的视频 URL 列表，未运行时为空。 */
  result?: string[]
  /** 上次运行的错误信息（成功则清空）。 */
  error?: string
  /** 进行中的异步任务 id：随节点存库，刷新后凭它重连轮询（关页面不丢结果）。 */
  taskId?: string
}

/** 图像生成节点的数据：具名模型 + 可调选项 + 运行状态与结果。 */
export type ImageNodeData = {
  label: string
  /** 具名模型展示名（如 Image 2）。 */
  model: string
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
  /** 进行中的异步任务 id：随节点存库，刷新后凭它重连轮询（关页面不丢结果）。 */
  taskId?: string
}

/** React Flow 节点类型（带上各自的 data）。 */
export type PromptNode = Node<PromptNodeData, 'prompt'>
export type LlmNode = Node<LlmNodeData, 'llm'>
export type ImageNode = Node<ImageNodeData, 'image'>
export type VideoNode = Node<GenerationNodeData, 'video'>
export type AssetNode = Node<AssetNodeData, 'asset'>
export type FlowNode = PromptNode | LlmNode | ImageNode | VideoNode | AssetNode

/** 一个项目 = 一块画布。 */
export type Project = {
  id: string
  name: string
  nodes: FlowNode[]
  edges: Edge[]
}

