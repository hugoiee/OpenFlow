import type { Edge, Node } from '@xyflow/react'
import type { VideoTask, VideoVariant } from './nodeCatalog'

/** 节点种类：文本 prompt / Any LLM / 图像生成 / 视频生成 / 播客音频 / 桌面拖入的媒体素材。 */
export type FlowNodeType = 'prompt' | 'llm' | 'image' | 'video' | 'podcast' | 'asset'

/** @ 引用的资源种类（与实发列表 image_list/audio_list/video_list 对应）。 */
export type MentionKind = 'image' | 'audio' | 'video'

/**
 * Prompt 文本中一个 `@[显示名]` token 的身份映射：显示名是插入时的快照（源节点后续改名不影响解析），
 * 身份 = 源节点 id + 资源种类 + 生成节点结果序号（素材节点无 resultIndex）。
 * 构建请求时按身份在下游节点的上游资源里找到 URL，替换为 <<<kind_N>>> 占位符；找不到则 token 原样保留。
 */
export type PromptMentionRef = {
  name: string
  nodeId: string
  kind: MentionKind
  resultIndex?: number
}

/** 纯文字 prompt 节点的数据。 */
export type PromptNodeData = {
  label: string
  text: string
  /** 文本中 @ 引用的身份映射表（旧数据无此字段，兜底空）。 */
  mentions?: PromptMentionRef[]
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
  /** 左侧图像输入端点数量（编号 1..N；默认 1，「添加图像输入」按钮递增）。多模态时把连入的图片发给模型。 */
  imageInputs?: number
  /** 音频输入端点数量（编号 1..N；默认 0，「添加音频输入」按钮递增）。连入音频素材作音频理解输入。 */
  audioInputs?: number
  /** 视频输入端点数量（编号 1..N；默认 0，「添加视频输入」按钮递增）。连入视频素材作视频理解输入。 */
  videoInputs?: number
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
  /** 素材种类：图像 / 音频 / 视频。 */
  kind: 'image' | 'audio' | 'video'
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
  /** 视频节点变体：frames（首尾帧）/ reference（参考图）。缺省按旧 videoTask 推断。 */
  videoVariant?: VideoVariant
  /** 图像输入端点数量（reference 变体用；frames 固定 2 个 First/Last，不读此值）。 */
  imageInputs?: number
  /** 音频输入端点数量（编号 1..N；默认 1，「添加音频输入」按钮递增）。 */
  audioInputs?: number
  /** 视频输入端点数量（参考图变体专用，编号 1..N；默认 0，「添加视频输入」按钮递增）。作参考视频喂给 video_list。 */
  videoInputs?: number
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

/**
 * 播客音频节点（火山 TTS）：内置双人对话脚本 + 两个角色（角色名 ↔ 火山音色 ID），
 * 运行时后端按「角色名: 台词」逐行合成并拼接成整期 WAV。终端节点（无连接点）。
 */
export type PodcastNodeData = {
  label: string
  /** 对话脚本：每行「角色名: 台词」，可用 [轻笑] 等方括号表演指令（豆包 TTS 2.0 支持）。 */
  script: string
  /** 角色 1 名字（脚本行首匹配用）。 */
  roleAName: string
  /** 角色 1 的火山音色 ID（控制台音色库复制）。 */
  roleAVoice: string
  /** 角色 2 名字。 */
  roleBName: string
  /** 角色 2 的火山音色 ID。 */
  roleBVoice: string
  /** 语速 speech_rate，[-50,100]（100=2 倍速，-50=0.5 倍速）。 */
  speechRate?: number
  /** 采样率 Hz（audio_params.sample_rate）；缺省 24000。 */
  sampleRate?: number
  /** 音量 loudness_rate，[-50,100]；缺省 0。 */
  loudnessRate?: number
  /** 音调 post_process.pitch，[-12,12]；缺省 0（不下发）。 */
  pitch?: number
  /** 句间停顿毫秒（本地拼接插入的静音）；缺省 300。 */
  lineGapMs?: number
  /** 过滤括号内的内容（additions.max_length_to_filter_parenthesis=100）。 */
  filterParenthesis?: boolean
  /** 解析并去除 Markdown 语法（additions.disable_markdown_filter）。 */
  disableMarkdownFilter?: boolean
  /** 解析过滤 Emoji（additions.disable_emoji_filter）。 */
  disableEmojiFilter?: boolean
  /** 显式朗读语种（additions.explicit_language）；空=自动。 */
  explicitLanguage?: string
  /** 语音指令（context_texts，作用于每句；不参与计费）。UI 已隐藏，字段保留兼容。 */
  contextText?: string
  /** AIGC 生成标识（additions.aigc_watermark，音频结尾节奏标识；逐句合成时每句结尾都有）。 */
  aigcWatermark?: boolean
  /** 是否启用 meta 隐式水印（additions.aigc_metadata.enable；开启时每句按 wav 请求）。 */
  aigcMetaEnable?: boolean
  /** meta 水印：合成服务提供者名称/编码（content_producer）。 */
  aigcMetaContentProducer?: string
  /** meta 水印：内容制作编号（produce_id）。 */
  aigcMetaProduceId?: string
  /** meta 水印：内容传播服务提供者名称/编码（content_propagator）。 */
  aigcMetaContentPropagator?: string
  /** meta 水印：内容传播编号（propagate_id）。 */
  aigcMetaPropagateId?: string
  /** 是否正在生成。 */
  running?: boolean
  /** 生成结果：同源音频 URL 列表（/api/files/xxx.wav），未运行时为空。 */
  result?: string[]
  /** 上次生成的计费字数合计（任务 result[1]，各句 usage.text_words 之和；含标点）。 */
  textWords?: number
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
  /** 输入图片 URL，每行一个（纯文生图时为空）。手填 URL 会并到连线收集的输入图之后。 */
  imagesText: string
  /** 左侧图像输入端点数量（编号 1..N；默认 1，「添加图像输入」按钮递增）。 */
  imageInputs?: number
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

/**
 * 分组容器节点：包住若干子节点（子节点 parentId 指向它），拖动容器时子节点跟随。
 * 由「选中多个节点 → 右键分组」创建，不走侧栏/createNode（同 asset 例外）。
 */
export type GroupNodeData = {
  label: string
}

/** React Flow 节点类型（带上各自的 data）。 */
export type PromptNode = Node<PromptNodeData, 'prompt'>
export type LlmNode = Node<LlmNodeData, 'llm'>
export type ImageNode = Node<ImageNodeData, 'image'>
export type VideoNode = Node<GenerationNodeData, 'video'>
export type PodcastNode = Node<PodcastNodeData, 'podcast'>
export type AssetNode = Node<AssetNodeData, 'asset'>
export type GroupNode = Node<GroupNodeData, 'group'>
export type FlowNode =
  | PromptNode
  | LlmNode
  | ImageNode
  | VideoNode
  | PodcastNode
  | AssetNode
  | GroupNode

/** 一个项目 = 一块画布。 */
export type Project = {
  id: string
  name: string
  nodes: FlowNode[]
  edges: Edge[]
  /** 是否置顶：首页把置顶项目单独成区排在最前。 */
  pinned: boolean
}

