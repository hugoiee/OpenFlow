// 前后端共享的纯数据契约（不依赖 React / React Flow）。

/** 项目 DTO：nodes/edges 在后端按不透明 JSON 存取（前端自行强类型化）。 */
export type ProjectDTO = {
  id: string
  name: string
  nodes: unknown[]
  edges: unknown[]
}

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
  /** 画布 Agent 的 LLM 端点（OpenAI 兼容 /chat/completions）；为空时回退 env AGENT_ENDPOINT。 */
  agentEndpoint: string
  /** 画布 Agent 的 LLM API Key（可空：无鉴权网关不需要）；为空时回退 env AGENT_API_KEY。GET /api/settings 不回明文（恒为空串），以 hasAgentApiKey 表示已配置。 */
  agentApiKey: string
  /** 画布 Agent 的 LLM 模型名（如 gpt-4o / doubao-xxx）；为空时回退 env AGENT_MODEL。 */
  agentModel: string
  /**
   * 手动维护的模型名列表：作 Agent 模型名 / Any LLM 节点下拉的持久候选项，
   * 与端点 GET /models 动态获取的结果取并集。供不支持 /models 的网关手填多个模型。
   */
  agentModelList: string[]
  /** 服务端是否已存有 Agent API Key（GET 响应专用；明文不回传）。 */
  hasAgentApiKey?: boolean
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
  /** Agent LLM 端点（空串=清空回退 env；省略=保持原值）。 */
  agentEndpoint?: string
  /** Agent LLM API Key（空串=清空回退 env；省略=保持原值）。 */
  agentApiKey?: string
  /** Agent LLM 模型名（空串=清空回退 env；省略=保持原值）。 */
  agentModel?: string
  /** 手动维护的模型候选列表（传数组则整体覆盖，含空数组=清空；省略=保持原值）。 */
  agentModelList?: string[]
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

/** POST /api/video 视频生成请求体（seedance，经后端代理到 AIGC /aigc 接口）。req_from 由后端从全局设置注入。 */
export type GenVideoBody = {
  /** 归属项目 id（用于建任务、按节点重连）。 */
  projectId: string
  /** 发起生成的节点 id（用于建任务、按节点重连）。 */
  nodeId: string
  /** model_name，如 seedance。 */
  model: string
  /** version：seedance-1.5-pro / seedance-2.0 等。 */
  version: string
  /** mode：first_last_frame / reference_image。 */
  mode: string
  /** 生成指令。 */
  prompt: string
  /** 输入图 URL 列表（0=t2v / 1=首帧 / 2=首尾帧）。 */
  images: string[]
  /** 输入音频 URL 列表（来自上游音频素材节点，作 audio_list；无则空）。 */
  audios?: string[]
  /** 输入参考视频 URL 列表（参考图变体专用，来自上游视频生成节点/视频素材，作 video_list；无则空）。 */
  videos?: string[]
  /** config.resolution，如 720p。 */
  resolution: string
  /** config.ratio（宽高比），如 16:9 / adaptive；省略则由后端回退默认。 */
  ratio?: string
  /** config.duration，秒。 */
  duration: number
}

/** POST /api/llm 请求体（Any LLM 文本生成，经后端复用画布 Agent 的 endpoint/key 调 /chat/completions）。 */
export type GenLlmBody = {
  /** 归属项目 id（用于建任务、按节点重连）。 */
  projectId: string
  /** 发起生成的节点 id（用于建任务、按节点重连）。 */
  nodeId: string
  /** 模型名（作 chat/completions 的 model；取自节点下拉）。 */
  model: string
  /** 生成指令（= 连到「Prompt 输入」端点的上游文本按连线拼接）。 */
  prompt: string
  /** 系统提示词（= 连到「System Prompt 输入」端点的上游文本；为空则不下发 system 消息）。 */
  systemPrompt?: string
  /** 多模态输入图 URL（= 连到各「图像输入」端点的上游图；有则作 image_url 内容发给视觉模型）。 */
  images?: string[]
  /** 多模态输入音频 URL（= 连到各「音频输入」端点的上游音频素材；有则作 audio_url 内容发给模型）。 */
  audios?: string[]
  /** 多模态输入视频 URL（= 连到各「视频输入」端点的上游视频素材；有则作 video_url 内容发给模型）。 */
  videos?: string[]
  /** 采样温度 0–2。 */
  temperature: number
  /** 是否开启思考：为 true 时请求体带 reasoning_effort 等原生推理参数。 */
  thinking: boolean
}

/** 异步生成任务的种类 / 状态。 */
export type TaskKind = 'image' | 'video' | 'llm'
export type TaskStatus = 'pending' | 'running' | 'succeeded' | 'failed'

/** 任务 DTO：前端轮询用；不含请求体 params（内部持久化，不外泄）。 */
export type TaskDTO = {
  id: string
  projectId: string
  nodeId: string
  kind: TaskKind
  status: TaskStatus
  /** 成功前为空。image/video 为结果 URL 列表；llm 为 [回答文本] 或 [回答文本, 思考文本]。 */
  result: string[]
  /** 失败时的可读错误信息。 */
  error?: string
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
}

/** POST /api/agent/test 成功响应：连通即 ok，附实际生效模型名与往返耗时。失败走非 2xx + { error }。 */
export type AgentTestResponse = {
  ok: true
  /** 实际用于测试的模型名。 */
  model: string
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
