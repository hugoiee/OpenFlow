import type {
  AgentChatBody,
  AgentChatResponse,
  AgentModelsBody,
  AgentModelsResponse,
  AgentTestBody,
  AgentTestResponse,
  CreateTaskResponse,
  GenImageBody,
  GenLlmBody,
  GenPodcastBody,
  GenVideoBody,
  ProjectDTO,
  PromptPresetDTO,
  SavePromptPresetBody,
  SaveSettingsBody,
  SettingsDTO,
  TaskDTO,
} from '@openflow/shared'

/** 统一的 /api 请求封装：非 2xx 时抛出含后端错误信息的 Error。 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
  } catch (e) {
    throw new Error(`后端不可用：${e instanceof Error ? e.message : String(e)}`, {
      cause: e,
    })
  }
  const data = (await res.json().catch(() => null)) as unknown
  if (!res.ok) {
    const message =
      (data as { error?: string } | null)?.error ?? `HTTP ${res.status}`
    throw new Error(message)
  }
  return data as T
}

// ---- 项目 ----
export function listProjects(): Promise<ProjectDTO[]> {
  return request<ProjectDTO[]>('/projects')
}

export function createProjectApi(name?: string): Promise<ProjectDTO> {
  return request<ProjectDTO>('/projects', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export function updateProjectApi(
  id: string,
  patch: Partial<Pick<ProjectDTO, 'name' | 'nodes' | 'edges' | 'pinned'>>,
): Promise<ProjectDTO> {
  return request<ProjectDTO>(`/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
}

export function deleteProjectApi(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/projects/${id}`, { method: 'DELETE' })
}

// ---- 设置 ----
export function getSettingsApi(): Promise<SettingsDTO> {
  return request<SettingsDTO>('/settings')
}

export function saveSettingsApi(body: SaveSettingsBody): Promise<{ ok: true }> {
  return request<{ ok: true }>('/settings', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

// ---- 常用 Prompt 预设（全局共享库）----
export function listPromptPresetsApi(): Promise<PromptPresetDTO[]> {
  return request<PromptPresetDTO[]>('/prompt-presets')
}

export function createPromptPresetApi(body: SavePromptPresetBody): Promise<PromptPresetDTO> {
  return request<PromptPresetDTO>('/prompt-presets', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updatePromptPresetApi(
  id: string,
  body: SavePromptPresetBody,
): Promise<PromptPresetDTO> {
  return request<PromptPresetDTO>(`/prompt-presets/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function deletePromptPresetApi(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/prompt-presets/${id}`, { method: 'DELETE' })
}

// ---- 图像 / 视频生成（异步任务）----
// 点「生成」→ 后端建任务、后台跑 AIGC，立刻返回 taskId；前端凭 taskId 轮询（见 taskPolling.ts）。
export async function createImageTaskApi(body: GenImageBody): Promise<string> {
  const { taskId } = await request<CreateTaskResponse>('/aigc', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return taskId
}

export async function createVideoTaskApi(body: GenVideoBody): Promise<string> {
  const { taskId } = await request<CreateTaskResponse>('/video', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return taskId
}

export async function createLlmTaskApi(body: GenLlmBody): Promise<string> {
  const { taskId } = await request<CreateTaskResponse>('/llm', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return taskId
}

export async function createPodcastTaskApi(body: GenPodcastBody): Promise<string> {
  const { taskId } = await request<CreateTaskResponse>('/podcast', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return taskId
}

// ---- 画布 Agent 对话 ----
// 同步接口：后端调 LLM 返回 { reply, actions } 计划；画布动作由前端执行（见 lib/agentExecutor.ts）。
export function agentChatApi(body: AgentChatBody): Promise<AgentChatResponse> {
  return request<AgentChatResponse>('/agent/chat', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// ---- Agent 连接测试（最小用量）----
// 后端用请求体（或已存）配置发一条 max_tokens:1 的探测请求；apiKey 省略=测已保存的密钥。
export function testAgentConnectionApi(body: AgentTestBody): Promise<AgentTestResponse> {
  return request<AgentTestResponse>('/agent/test', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// ---- 动态获取模型列表 ----
// 后端调端点 GET /models 列出可用模型 ID；endpoint/apiKey 省略=用已存设置（apiKey 空=已保存密钥）。
export async function listAgentModelsApi(body: AgentModelsBody = {}): Promise<string[]> {
  const { models } = await request<AgentModelsResponse>('/agent/models', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return models
}

// ---- 任务查询（轮询 / 重连）----
export function getTaskApi(id: string): Promise<TaskDTO> {
  return request<TaskDTO>(`/tasks/${id}`)
}

/** 按节点取最近一次任务；无任务（404）时返回 null（刷新后无 taskId 的重连兜底）。 */
export async function getLatestTaskForNodeApi(
  projectId: string,
  nodeId: string,
): Promise<TaskDTO | null> {
  const q = new URLSearchParams({ projectId, nodeId })
  try {
    return await request<TaskDTO>(`/tasks?${q.toString()}`)
  } catch {
    return null
  }
}

// ---- 下载生成结果 ----
// 生成结果 URL 是跨域内网地址，浏览器 <a download> 对跨域资源无效（只会跳转、无法指定文件名），
// 故走同源 /api/download 代理：后端拉取源文件、按响应 Content-Type 补正确扩展名，
// 并以 Content-Disposition 触发下载。前端只需把用户填的文件名（不含后缀）与 kind 传给它。
export function buildDownloadUrl(
  url: string,
  name: string,
  kind: 'image' | 'video',
): string {
  const q = new URLSearchParams({ url, name, kind })
  return `/api/download?${q.toString()}`
}

/** 触发浏览器下载：点一个指向同源下载代理的隐藏 <a>，文件名与后缀由后端决定。 */
export function triggerDownload(
  url: string,
  name: string,
  kind: 'image' | 'video',
): void {
  const a = document.createElement('a')
  a.href = buildDownloadUrl(url, name, kind)
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

// ---- 文件上传（图片 / 音频 / 视频）----
// 走 multipart，不能复用 request()（它写死了 application/json）；让浏览器自带 boundary。
// req_from（用户标识）由后端从全局设置注入，前端不再传。
// kind 走 query：图片 → 图片端点，音频 / 视频 → 媒体端点（后端据此分流上游端点）。
export async function uploadFilesApi(
  files: File[],
  kind: 'image' | 'audio' | 'video' = 'image',
): Promise<string[]> {
  const form = new FormData()
  files.forEach((f) => form.append('files', f))
  let res: Response
  try {
    res = await fetch(`/api/upload?kind=${kind}`, { method: 'POST', body: form })
  } catch (e) {
    throw new Error(`后端不可用：${e instanceof Error ? e.message : String(e)}`, { cause: e })
  }
  const data = (await res.json().catch(() => null)) as {
    urls?: string[]
    error?: string
  } | null
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
  return data?.urls ?? []
}
