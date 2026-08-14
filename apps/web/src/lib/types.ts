import type { Edge, Node } from '@xyflow/react'
import type { VideoShot } from '@openflow/shared'
import type { VideoTask, VideoVariant } from './nodeCatalog'

/** 节点种类：文本 prompt / 图像生成 / 视频生成 / 播客音频 / 桌面拖入的媒体素材 / 脚本切割 / 脚本分镜。 */
export type FlowNodeType =
  | 'prompt'
  | 'image'
  | 'video'
  | 'podcast'
  | 'asset'
  | 'splitter'
  | 'storyboard'

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
  /** config.duration，秒；-1 表示自动时长（仅 seedance 2.5 支持）。 */
  duration?: number
  // ↓ 模型特有可调项（由 videoModelSpec 的 features 决定是否出现在 Inspector）：
  /** seedance 2.5：config.generate_audio（生成音频）。 */
  generateAudio?: boolean
  /** 可灵：config.sound（生成音效）。 */
  sound?: boolean
  /** 可灵：config.mode（生成质量档），'std' | 'pro'。 */
  qualityMode?: string
  /** 可灵：config.multi_shot（多镜头分镜模式）。开启后不发 prompt，改发 multi_prompt。 */
  multiShot?: boolean
  /** 可灵多镜头的分镜列表（最多 6 段，各段时长之和须等于总时长）。 */
  shots?: VideoShot[]
  /** MiniMax：config['aigc-watermark']。 */
  watermark?: boolean
  /** 是否正在生成。 */
  running?: boolean
  /** 生成结果的视频 URL 列表，未运行时为空。 */
  result?: string[]
  /** 上次运行的错误信息（成功则清空）。 */
  error?: string
  /** 上次失败是否值得去 AIGC 历史里重拉（上游 2xx 没带 URL / 请求被掐断时为 true）。 */
  errorRecoverable?: boolean
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

/** 脚本分镜单行的运行状态（pending/running 为纯前端请求瞬时态，载入时复位为 idle）。 */
export type StoryboardItemStatus = 'idle' | 'pending' | 'running' | 'done' | 'error'

/** 脚本分镜表格的一行：A 说话人(roleIndex) / B 分割后脚本(text) / C 时长(duration) / D LLM 产出(prompt)。 */
export type StoryboardItem = {
  /** B 列：分割后的台词段文本（**不含**角色名前缀；可在表格里编辑）。 */
  text: string
  /** A 列：说话人下标 0=角色A / 1=角色B（落成节点时按它连对应角色的参考图/音色）。 */
  roleIndex: number
  /** C 列：估算视频时长（秒，= 念出字数/语速，夹到 4~15，可在表格里改）；落成时写进该段 Seedance 节点。 */
  duration?: number
  /** D 列：LLM 生成的完整视频 prompt（done 时非空）。 */
  prompt?: string
  status: StoryboardItemStatus
  /** 该段生成失败的错误信息（status=error 时展示，可单段重试）。 */
  error?: string
}

/**
 * 脚本切割节点：粘贴整篇播客脚本原文（可含标题/小节标题行，会被跳过），点「切割」按语速
 * 切成 4~15s 的段，**自动创建（或更新）下游已连线的脚本分镜节点**的表格。终端来源节点，
 * 只有右侧一个输出端点连分镜节点的「分镜表」端点。
 */
export type SplitterNodeData = {
  label: string
  /** 整篇播客脚本原文：每行「角色名: 台词」，标题/小节标题行会被跳过。 */
  script: string
  /** 角色 1 名字（脚本行首匹配用）。 */
  roleAName: string
  /** 角色 2 名字。 */
  roleBName: string
  /**
   * 切分语速（字/秒）：决定「多少字算一段」与各段估算时长。
   * 旧数据缺失 → 按默认 6 字/秒（见 nodeCatalog.normalizeSplitSpeed）。
   */
  charsPerSecond?: number
}

/**
 * 脚本分镜节点：整篇双人播客脚本 + prompt 模板（{{line}} 占位符），逐行调 Agent LLM
 * 生成 Seedance 口播 prompt，再一键落成 N 组「Prompt → 视频」节点对。
 * 左侧两个图像端点各连一张角色人像参考图（落成时按行首说话人自动连给视频节点）。
 */
export type StoryboardNodeData = {
  label: string
  /** 整篇播客脚本：每行「角色名: 台词」。 */
  script: string
  /** prompt 模板，含 {{line}} 占位符（发送时替换为台词行原文）。 */
  template: string
  /** 逐段扩写用的 LLM 模型名；空/缺省=跟随全局设置里的 Agent 模型（端点/密钥/协议始终取全局）。 */
  model?: string
  /** 角色 1 名字（脚本行首匹配用，同播客节点语义）。 */
  roleAName: string
  /** 角色 2 名字。 */
  roleBName: string
  /** 逐行拆分后的生成条目（点「生成」时按当前脚本重建；prompt 随项目持久化）。 */
  items?: StoryboardItem[]
  /** 是否有批量生成在跑（瞬时态，载入复位）。 */
  running?: boolean
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
  /** 上次失败是否值得去 AIGC 历史里重拉（上游 2xx 没带 URL / 请求被掐断时为 true）。 */
  errorRecoverable?: boolean
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
export type ImageNode = Node<ImageNodeData, 'image'>
export type VideoNode = Node<GenerationNodeData, 'video'>
export type PodcastNode = Node<PodcastNodeData, 'podcast'>
export type AssetNode = Node<AssetNodeData, 'asset'>
export type GroupNode = Node<GroupNodeData, 'group'>
export type SplitterNode = Node<SplitterNodeData, 'splitter'>
export type StoryboardNode = Node<StoryboardNodeData, 'storyboard'>
export type FlowNode =
  | PromptNode
  | ImageNode
  | VideoNode
  | PodcastNode
  | AssetNode
  | GroupNode
  | SplitterNode
  | StoryboardNode

/** 一个项目 = 一块画布。 */
export type Project = {
  id: string
  name: string
  nodes: FlowNode[]
  edges: Edge[]
  /** 是否置顶：首页把置顶项目单独成区排在最前。 */
  pinned: boolean
}

