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
  /** config.resolution，如 720p。 */
  resolution: string
  /** config.ratio（宽高比），如 16:9 / adaptive；省略则由后端回退默认。 */
  ratio?: string
  /** config.duration，秒。 */
  duration: number
}

/** 异步生成任务的种类 / 状态。 */
export type TaskKind = 'image' | 'video'
export type TaskStatus = 'pending' | 'running' | 'succeeded' | 'failed'

/** 任务 DTO：前端轮询用；不含请求体 params（内部持久化，不外泄）。 */
export type TaskDTO = {
  id: string
  projectId: string
  nodeId: string
  kind: TaskKind
  status: TaskStatus
  /** 成功前为空。 */
  result: string[]
  /** 失败时的可读错误信息。 */
  error?: string
  createdAt: number
  updatedAt: number
}

/** POST /api/aigc | /api/video 建任务成功响应。 */
export type CreateTaskResponse = { taskId: string }

/** 常用 Prompt 预设 DTO：全局共享库，供 Prompt 节点下拉选用。 */
export type PromptPresetDTO = {
  id: string
  /** 简短标题（下拉 / 列表里展示）。 */
  title: string
  /** prompt 正文。 */
  content: string
  createdAt: number
  updatedAt: number
}

/** POST /api/prompt-presets（新建）| PUT /api/prompt-presets/:id（更新）请求体。 */
export type SavePromptPresetBody = {
  title: string
  content: string
}
