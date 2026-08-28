// 前后端共享的纯数据契约（不依赖 React / React Flow）。

/**
 * 项目形态：
 * 'canvas'     = 节点式画布（nodes/edges 有内容，data 为空对象）；
 * 'evaluation' = 评估项目（Excel 式表格，表格存 data，nodes/edges 恒空）。
 * 建项目时定死、之后不可改（PUT 不接受该字段）——两种形态的数据字段互不相通，中途换型只会留下半张空表。
 */
export type ProjectType = 'canvas' | 'evaluation'

/** 项目 DTO：nodes/edges/data 在后端按不透明 JSON 存取（前端自行强类型化）。 */
export type ProjectDTO = {
  id: string
  name: string
  /** 项目形态；旧数据无此字段时前端按 'canvas' 兜底。 */
  type: ProjectType
  nodes: unknown[]
  edges: unknown[]
  /** 评估项目的表格数据（EvaluationTable，前端定义）；画布项目恒为 {}。 */
  data: unknown
  /** 是否置顶：首页把置顶项目单独成区排在最前。 */
  pinned: boolean
}

/**
 * Agent LLM 的接口协议（线格式）：
 * 'responses' = POST {base}/responses（OpenAI Responses API，请求发 input、响应读 output）；
 * 'chat'      = POST {base}/chat/completions（Chat Completions，请求发 messages、响应读 choices）。
 * 两者的端点后缀由后端按此项自动补，用户只填到 /v1 即可。
 */
export type AgentApiStyle = 'responses' | 'chat'

/** GET /api/settings 响应：全局调用方署名 + AIGC/上传端点。空字符串表示回退后端默认。 */
export type SettingsDTO = {
  /** 全局调用方署名（req_from）；为空时后端回退默认值。 */
  defaultReqFrom: string
  /** AIGC 图像/视频生成端点；为空时后端回退 env AIGC_ENDPOINT / 内置默认。 */
  aigcEndpoint: string
  /** 图片上传端点；为空时回退 env UPLOAD_ENDPOINT / 内置默认。 */
  uploadEndpoint: string
  /** 音频上传端点；为空时回退 env UPLOAD_MEDIA_ENDPOINT / 内置默认。 */
  uploadMediaEndpoint: string
  /**
   * AIGC 历史任务查询端点（如 http://your-host:8511/api/task-history）；为空时回退 env AIGC_HISTORY_ENDPOINT。
   * 两者皆空不报错，只是失去「同步响应没带回 URL 时去历史里找回结果」的能力。
   */
  aigcHistoryEndpoint: string
  /** 画布 Agent 的 LLM 端点（填到基址即可，如 https://api.openai.com/v1；后缀按 agentApiStyle 自动补）；为空时回退 env AGENT_ENDPOINT。 */
  agentEndpoint: string
  /** Agent LLM 的接口协议；空串=未选择，回退 env AGENT_API_STYLE，再回退 'responses'。 */
  agentApiStyle: AgentApiStyle | ''
  /** 画布 Agent 的 LLM API Key（可空：无鉴权网关不需要）；为空时回退 env AGENT_API_KEY。GET /api/settings 不回明文（恒为空串），以 hasAgentApiKey 表示已配置。 */
  agentApiKey: string
  /** 画布 Agent 的 LLM 模型名（如 gpt-4o / doubao-xxx）；为空时回退 env AGENT_MODEL。 */
  agentModel: string
  /**
   * 手动维护的模型名列表：作 Agent 模型名下拉的持久候选项，
   * 与端点 GET /models 动态获取的结果取并集。供不支持 /models 的网关手填多个模型。
   */
  agentModelList: string[]
  /** 火山引擎语音 API Key（播客 TTS 用，控制台>API Key 管理获取）；GET 不回明文（恒为空串），以 hasVolcTtsApiKey 表示已配置。 */
  volcTtsApiKey: string
  /** 服务端是否已存有 Agent API Key（GET 响应专用；明文不回传）。 */
  hasAgentApiKey?: boolean
  /** 服务端是否已存有火山语音 API Key（GET 响应专用；明文不回传）。 */
  hasVolcTtsApiKey?: boolean
}

/** PUT /api/settings 请求体：省略的字段保持原值（合并写入）。 */
export type SaveSettingsBody = {
  /** 全局调用方署名（req_from）。 */
  defaultReqFrom: string
  /** AIGC 图像/视频生成端点（空串=清空回退默认；省略=保持原值）。 */
  aigcEndpoint?: string
  /** 图片上传端点（空串=清空回退默认；省略=保持原值）。 */
  uploadEndpoint?: string
  /** 音频上传端点（空串=清空回退默认；省略=保持原值）。 */
  uploadMediaEndpoint?: string
  /** AIGC 历史任务查询端点（空串=清空回退 env；省略=保持原值）。 */
  aigcHistoryEndpoint?: string
  /** Agent LLM 端点（空串=清空回退 env；省略=保持原值）。 */
  agentEndpoint?: string
  /** Agent LLM 接口协议（空串=清空回退 env/默认；省略=保持原值）。 */
  agentApiStyle?: AgentApiStyle | ''
  /** Agent LLM API Key（空串=清空回退 env；省略=保持原值）。 */
  agentApiKey?: string
  /** Agent LLM 模型名（空串=清空回退 env；省略=保持原值）。 */
  agentModel?: string
  /** 手动维护的模型候选列表（传数组则整体覆盖，含空数组=清空；省略=保持原值）。 */
  agentModelList?: string[]
  /** 火山语音 API Key（空串=清空回退 env；省略=保持原值）。 */
  volcTtsApiKey?: string
}

/** POST /api/aigc 请求体（图像生成，经后端代理到 AIGC 接口）。req_from 由后端从全局设置注入。 */
export type GenImageBody = {
  /** 归属项目 id（用于建任务、按节点重连）。 */
  projectId: string
  /** 发起生成的节点 id（用于建任务、按节点重连）。 */
  nodeId: string
  /** AIGC 接口的 model_name（如 gpt-image-2 / nano-banana）。 */
  model: string
  /** 生成 / 编辑指令。 */
  prompt: string
  /** 待编辑的输入图片 URL 列表（纯文生图时为空）。 */
  images: string[]
  // ↓ Image 2(gpt-image-2) 专用：
  /** 出图尺寸，如 1920x1080 / auto。 */
  size: string
  /** 出图张数。 */
  n: number
  /** 出图质量，如 auto / low / medium / high。 */
  quality: string
  // ↓ Nano Banana(nano-banana) 专用（后端按 model 取舍，Image 2 不读）：
  /** version：gemini-3-pro-image-preview(banana) / gemini-3.1-flash-image-preview(banana2)。 */
  version?: string
  /** config.aspect_ratio，如 16:9。 */
  aspectRatio?: string
  /** config.image_size，1K / 2K / 4K。 */
  imageSize?: string
}

/**
 * 可灵多镜头模式的一段分镜（config.multi_shot=true 时以 multi_prompt 数组下发）。
 * index 由后端按数组序生成（1 基），前端只维护内容与时长。
 */
export type VideoShot = {
  /** 该段的画面描述。 */
  prompt: string
  /** 该段时长（秒，≥1）；所有段之和须等于任务总时长。 */
  duration: number
}

/**
 * POST /api/video 视频生成请求体（seedance / kling / MiniMax-H3，经后端代理到 AIGC /aigc 接口）。
 * req_from 由后端从全局设置注入。三家 config 形状不同，后端 buildVideoPayload 按 model 分支组装。
 */
export type GenVideoBody = {
  /** 归属项目 id（用于建任务、按节点重连）。 */
  projectId: string
  /** 发起生成的节点 id（用于建任务、按节点重连）。 */
  nodeId: string
  /** model_name：seedance / kling / MiniMax-H3。 */
  model: string
  /** version：seedance-2.0 / doubao-seedance-2-5-260628 / kling-v3-omni-global / MiniMax-H3 等。 */
  version: string
  /** mode：first_last_frame / reference_image（seedance·kling）/ reference_frame（MiniMax）。 */
  mode: string
  /** 生成指令。多镜头模式下不下发（改用 shots）。 */
  prompt: string
  /** 输入图 URL 列表（0=t2v / 1=首帧 / 2=首尾帧）。 */
  images: string[]
  /** 输入音频 URL 列表（来自上游音频素材节点，作 audio_list；无则空）。 */
  audios?: string[]
  /** 输入参考视频 URL 列表（参考图变体专用，来自上游视频生成节点/视频素材，作 video_list；无则空）。 */
  videos?: string[]
  /** config.resolution，如 720p / 768P；空串=该模型不发这个字段（可灵用 qualityMode 代替）。 */
  resolution: string
  /** config.ratio / config.aspect_ratio（宽高比），如 16:9 / adaptive；省略则由后端回退默认。 */
  ratio?: string
  /** config.duration，秒；-1 表示自动（仅 seedance 2.5 支持）。可灵下发时转字符串。 */
  duration: number
  // ↓ 模型特有可调项（后端按 model 取舍，不适用的模型忽略）：
  /** seedance 2.5：config.generate_audio（生成音频）。 */
  generateAudio?: boolean
  /** 可灵：config.sound，true→'on' / false→'off'。 */
  sound?: boolean
  /** 可灵：config.mode（生成质量档），'std' | 'pro'。 */
  qualityMode?: string
  /** 可灵：config.multi_shot（多镜头分镜模式）。开启时不发 prompt，改发 multi_prompt。 */
  multiShot?: boolean
  /** 可灵多镜头的分镜列表（multiShot 为 true 时有效，最多 6 段）。 */
  shots?: VideoShot[]
  /** MiniMax：config['aigc-watermark']。 */
  watermark?: boolean
}

/** 播客的一个说话角色：脚本里的角色名 + 火山音色库的音色 ID（voice_type/speaker）。 */
export type PodcastRole = {
  /** 脚本行首的角色名（如 主持人 / 嘉宾），用于按「角色名: 台词」匹配行。 */
  name: string
  /** 火山音色 ID（如 zh_female_vv_uranus_bigtts），从控制台音色库复制。 */
  voiceId: string
}

/**
 * POST /api/podcast 请求体（双人对话播客音频，经后端逐行调火山单向流式 TTS 合成后拼接）。
 * 鉴权用设置里的火山 API Key（volcTtsApiKey），与内网 AIGC 网关无关、不需要 req_from。
 */
export type GenPodcastBody = {
  /** 归属项目 id（用于建任务、按节点重连）。 */
  projectId: string
  /** 发起生成的节点 id（用于建任务、按节点重连）。 */
  nodeId: string
  /**
   * 对话脚本：每行「角色名: 台词」（中英文冒号均可），未带角色前缀的行并入上一行台词。
   * 台词内可用方括号表演指令（如 [轻笑] [叹气]），原样透传给豆包 TTS 2.0。
   */
  script: string
  /** 两个说话角色（固定 2 个：脚本按 name 匹配，各自用 voiceId 合成）。 */
  roles: PodcastRole[]
  /** 语速，火山 speech_rate，[-50,100]（100=2 倍速，-50=0.5 倍速）；省略为 0。 */
  speechRate?: number
  /** 采样率 Hz（audio_params.sample_rate）；省略为 24000。 */
  sampleRate?: number
  /** 音量，火山 loudness_rate，[-50,100]（100=2 倍音量，-50=0.5 倍）；省略为 0。 */
  loudnessRate?: number
  /** 音调，火山 post_process.pitch，[-12,12]；省略为 0（不下发）。 */
  pitch?: number
  /** 句间停顿毫秒（本地拼接时插入的静音，非火山参数）；省略为 300。 */
  lineGapMs?: number
  /** 过滤括号内的内容（additions.max_length_to_filter_parenthesis=100）；省略/false 不过滤。 */
  filterParenthesis?: boolean
  /** 解析并去除 Markdown 语法（additions.disable_markdown_filter=true）；省略/false 保留原始字符。 */
  disableMarkdownFilter?: boolean
  /** 解析过滤 Emoji（additions.disable_emoji_filter=true）。 */
  disableEmojiFilter?: boolean
  /** 显式指定朗读语种（additions.explicit_language，如 zh-cn / en / ja）；省略/空=自动。 */
  explicitLanguage?: string
  /** 语音指令（context_texts，如「用轻松愉快的语气」；不参与计费）；省略/空=不下发。 */
  contextText?: string
  /** AIGC 生成标识（additions.aigc_watermark）：在合成音频结尾添加节奏标识。注意逐句合成时每句结尾都会有。 */
  aigcWatermark?: boolean
  /** meta 隐式水印（additions.aigc_metadata）：enable=true 时每句改按 wav 请求（pcm 不支持）再解出 PCM 拼接。 */
  aigcMetadata?: {
    enable: boolean
    /** 合成服务提供者的名称或编码（content_producer）。 */
    contentProducer?: string
    /** 内容制作编号（produce_id）。 */
    produceId?: string
    /** 内容传播服务提供者的名称或编码（content_propagator）。 */
    contentPropagator?: string
    /** 内容传播编号（propagate_id）。 */
    propagateId?: string
  }
}

/** 异步生成任务的种类 / 状态。 */
export type TaskKind = 'image' | 'video' | 'podcast'
export type TaskStatus = 'pending' | 'running' | 'succeeded' | 'failed'

/** 任务 DTO：前端轮询用；不含请求体 params（内部持久化，不外泄）。 */
export type TaskDTO = {
  id: string
  projectId: string
  nodeId: string
  kind: TaskKind
  status: TaskStatus
  /** 成功前为空。image/video 为结果 URL 列表；podcast 为 [音频 URL, 计费字数(usage.text_words 合计)]。 */
  result: string[]
  /** 失败时的可读错误信息。 */
  error?: string
  /**
   * 上游任务标识（AIGC 响应的 request_id，或历史记录的 id）。
   * 有它就能去 AIGC 历史接口按 id 精确认领结果，也是「同一条历史记录不被两个任务抢」的锁。
   */
  upstreamId?: string
  /** 上游最近一次原始响应（截断）。生成失败时的第一手现场，节点上可展开查看/复制。 */
  rawResponse?: string
  /**
   * 失败是否「可能只是没拿到结果」（status='failed' 时才有意义）：
   * 上游 2xx 却没带回 URL、或请求被中间掐断——内容其实可能已生成，值得去历史里重拉。
   * 上游明确说失败（如内容安全拦截）则为 false，重拉也没用。
   */
  recoverable?: boolean
  createdAt: number
  updatedAt: number
}

/** POST /api/aigc | /api/video 建任务成功响应。 */
export type CreateTaskResponse = { taskId: string }

/** Prompt 预设分组：'common' 常用 Prompt（作用户消息）/ 'system' System Prompt（作系统提示词）。 */
export type PromptPresetCategory = 'common' | 'system'

/** Prompt 预设 DTO：全局共享库，供 Prompt 节点下拉选用。按 category 分「常用 / System」两组。 */
export type PromptPresetDTO = {
  id: string
  /** 简短标题（下拉 / 列表里展示）。 */
  title: string
  /** prompt 正文。 */
  content: string
  /** 分组：常用 Prompt / System Prompt。 */
  category: PromptPresetCategory
  createdAt: number
  updatedAt: number
}

/** POST /api/prompt-presets（新建）| PUT /api/prompt-presets/:id（更新）请求体。 */
export type SavePromptPresetBody = {
  title: string
  content: string
  /** 分组；省略时后端按 'common' 处理（向后兼容）。 */
  category?: PromptPresetCategory
}

// ---- 画布 Agent（对话式操作画布：写 Prompt / 建节点 / 生图）----

/** Agent 会话消息（OpenAI 兼容 role）。前端持有整段历史，后端无会话态。 */
export type AgentMessage = {
  role: 'user' | 'assistant'
  content: string
}

/** POST /api/agent/chat 请求体：projectId 仅作上下文标识，会话历史整段随请求带上。 */
export type AgentChatBody = {
  projectId: string
  messages: AgentMessage[]
}

/**
 * Agent 规划的一次生图动作：前端据此在画布创建 Prompt 节点（写入 prompt）、
 * 创建图像节点（按 model）、连线并触发生成。
 */
export type AgentImageAction = {
  /** 已润色的完整生图提示词（写进 Prompt 节点）。 */
  prompt: string
  /** 图像模型展示名：'Image 2' | 'Nano Banana'（前端映射到 AIGC model_name）。 */
  model: string
  /** 这组节点的简短标题（画布上好辨认；可空）。 */
  title?: string
}

/** POST /api/agent/chat 响应：给用户的答复 + 画布动作计划（闲聊/追问时 actions 为空）。 */
export type AgentChatResponse = {
  reply: string
  actions: AgentImageAction[]
}

/**
 * POST /api/agent/test 请求体：最小用量连接测试。
 * 各字段留空/省略则后端回退已存设置再回退 env（apiKey 空 = 沿用写入-only 语义，测已存密钥）。
 */
export type AgentTestBody = {
  /** 待测 Agent 接口地址；空则回退已存设置 / env。 */
  endpoint?: string
  /** 待测 API Key；空则回退已存密钥 / env。 */
  apiKey?: string
  /** 待测模型名；空则回退已存设置 / env。 */
  model?: string
  /**
   * 待测接口协议；省略则回退已存设置 / env。
   * 设置面板支持「存盘前用草稿值试」，协议不跟着传的话，切了下拉却测的是旧协议。
   */
  apiStyle?: AgentApiStyle
}

/** POST /api/agent/test 成功响应：连通即 ok，附实际生效模型名/协议与往返耗时。失败走非 2xx + { error }。 */
export type AgentTestResponse = {
  ok: true
  /** 实际用于测试的模型名。 */
  model: string
  /** 实际用于测试的接口协议（协议选错但恰好 200 时，这是最直观的排查线索）。 */
  apiStyle: AgentApiStyle
  /** 请求往返耗时（毫秒）。 */
  latencyMs: number
}

/**
 * POST /api/agent/models 请求体：列出 OpenAI 兼容端点 GET /models 的可用模型。
 * 各字段省略/空则后端回退已存设置再回退 env（apiKey 空 = 沿用写入-only 语义，用已存密钥）。
 */
export type AgentModelsBody = {
  /** 待查询的 Agent 接口地址；空则回退已存设置 / env。 */
  endpoint?: string
  /** 待用的 API Key；空则回退已存密钥 / env。 */
  apiKey?: string
}

/** POST /api/agent/models 成功响应：端点 /models 列出的模型 ID（已去重、按字母排序）。失败走非 2xx + { error }。 */
export type AgentModelsResponse = {
  models: string[]
}

/**
 * POST /api/agent/expand 请求体：脚本分镜逐行扩写。
 * 后端把模板中的 {{line}} 全部替换为台词行后，作为唯一 user message 单次调 Agent LLM
 * （复用 agentEndpoint/agentApiKey/agentModel 配置；不带画布 Agent 的生图系统提示词）。
 */
export type AgentExpandBody = {
  /** prompt 模板，含 {{line}} 占位符（可出现多次，全部替换）。 */
  template: string
  /** 台词行原文（含「角色名: 」前缀）。 */
  line: string
  /**
   * 本次扩写用的模型名；省略/空则回退设置里的 agentModel。
   * 分镜节点各自可选模型——同一画布上不同分镜想用不同模型（便宜的跑草稿、强的跑定稿）时不必改全局设置。
   * 端点/密钥/协议仍统一走全局设置。
   */
  model?: string
}

/** POST /api/agent/expand 成功响应：LLM 输出的视频 prompt 纯文本。失败走非 2xx + { error }。 */
export type AgentExpandResponse = {
  prompt: string
}

/**
 * POST /api/agent/evaluate 请求体：评估项目的 LLM 评估列逐行调用。
 * 与 /agent/expand 的分工：expand 的模板占位符由后端替换（{{line}} 是分镜专属语义），
 * 评估列的 {{列名}} 引用哪些列只有前端知道，故**占位符全部在前端替换完**，这里发的就是最终 prompt。
 */
export type AgentEvaluateBody = {
  /** 已完成占位符替换的完整提示词，作为唯一 user message 发给 LLM。 */
  prompt: string
  /** 本列覆盖的模型名；省略/空则回退设置里的 agentModel。端点/密钥/协议仍统一走全局设置。 */
  model?: string
}

/** POST /api/agent/evaluate 成功响应：LLM 输出的评估结果纯文本。失败走非 2xx + { error }。 */
export type AgentEvaluateResponse = {
  text: string
}

/**
 * GET /api/update-check 响应：客户端「检查更新」用。
 * 后端只负责查 GitHub Releases 的最新版本（绕 CORS + 进程内缓存防撞匿名 API 限流），
 * **不做版本比较**——当前版本只有前端的 APP_VERSION 一处权威来源，
 * 让后端也持有一份会变成第三处版本双写。是否有更新由前端判断。
 * 网络失败 / 尚未发布过版本时也返回 2xx（latest 为空 + error），前端静默处理，不打扰用户。
 */
export type UpdateCheckResponse = {
  /** 最新发布版本（已去掉 v 前缀）；查不到为空串。 */
  latest: string
  /** Release 页面地址（供「去下载」跳转）；查不到时退回仓库的 releases 列表页。 */
  url: string
  /** 检查失败的原因（前端仅作诊断，不弹窗）。 */
  error?: string
}

/**
 * 生成统计的一条明细行：一次「点生成」= 一行（tasks 表里 kind 为 image/video 的任务）。
 * 由后端读 tasks.params（即当初发出的请求体）扁平化而来，**不新建表也不埋点**——
 * 任务行本就是每次生成的权威记录，节点删了行还在（钱已经花了，该算）。
 * 分组聚合刻意留给前端：汇总视图只是明细的 group by，同源才不会对不上账。
 * 只覆盖图像 / 视频模型；播客 TTS 与 Agent LLM 调用不计入（费用另算）。
 */
export type GenStatRow = {
  /** 任务 id（明细行的唯一键）。 */
  taskId: string
  /** 发起生成的节点 id（供回溯是画布上哪个节点）。 */
  nodeId: string
  /** 'image' | 'video'（TaskKind 的子集，podcast 不入统计）。 */
  kind: 'image' | 'video'
  /** 任务终态/中间态，用于区分「总提交次数」与「成功次数」。 */
  status: TaskStatus
  /** AIGC model_name，如 gpt-image-2 / nano-banana / seedance / kling / MiniMax-H3。 */
  model: string
  /** 模型版本（Nano Banana 的 version / 视频各家 version）；该模型无此概念则空串。 */
  version: string
  /** 出图/出片规格：图像 = size 或 imageSize；视频 = resolution，可灵改用质量档 std/pro。空串=未下发。 */
  resolution: string
  /** 宽高比（视频 ratio / Nano Banana aspectRatio）；无则空串。 */
  ratio: string
  /** 图像质量档（Image 2 的 quality）；视频恒空串。 */
  quality: string
  /** 本次出图张数（Image 2 的 n；无此字段的模型按 1 算）；视频恒 1。 */
  images: number
  /** 视频单次时长（秒）；**-1 = 自动时长**（实际秒数上游才知道，不计入总秒数）；图像恒 0。 */
  duration: number
  /** 提交时刻（tasks.created_at 毫秒时间戳）。 */
  createdAt: number
}

/** GET /api/projects/:id/stats 响应：该画布项目的全部生成明细（新→旧）。 */
export type ProjectStatsResponse = {
  rows: GenStatRow[]
}

/**
 * 生成历史的一条记录：一次「点生成」= 一行（tasks 表里的任务，**含播客**）。
 * 与 GenStatRow 同源不同用——统计那份是为算钱，扁平化的是规格维度且刻意不带结果；
 * 这份是为**找回产出**：核心字段是 result（结果 URL）与 prompt 摘要，好让人在
 * 「手滑重新生成把节点上的结果冲掉了」之后，仍能从历史里把那条链接捞回来。
 * 两者各读各的、互不影响：合成一个类型只会让「算钱」与「找链接」互相将就。
 */
export type GenHistoryRow = {
  /** 任务 id（记录的唯一键）。 */
  taskId: string
  /** 发起生成的节点 id（节点可能已删除或改名，前端查得到就显示名字、查不到显示 id）。 */
  nodeId: string
  /** 任务类型：图像 / 视频 / 播客音频。 */
  kind: TaskKind
  /** 任务终态/中间态（失败的行没有 result，但保留下来能看出「那次失败了」）。 */
  status: TaskStatus
  /** AIGC model_name（播客恒为空串——火山 TTS 不走 model_name 那套）。 */
  model: string
  /**
   * 当次请求的文字内容摘要（图像/视频取 prompt，播客取脚本开头），已截断。
   * 一屏几十条链接，光看 URL 分不清谁是谁，得靠这句认人。
   */
  prompt: string
  /** 结果 URL 列表（succeeded 才非空；播客为 [音频URL, 计费字数] 中的音频 URL）。 */
  result: string[]
  /** 提交时刻（tasks.created_at 毫秒时间戳）。 */
  createdAt: number
}

/** GET /api/projects/:id/history 响应：该画布项目的全部生成记录（新→旧）。 */
export type ProjectHistoryResponse = {
  rows: GenHistoryRow[]
}
