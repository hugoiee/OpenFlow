import type {
  FetchModelsBody,
  GenImageBody,
  GenVideoBody,
  ProjectDTO,
  RunModelBody,
  SaveSettingsBody,
  SettingsDTO,
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
  patch: Partial<Pick<ProjectDTO, 'name' | 'nodes' | 'edges'>>,
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

// ---- 模型 ----
export async function fetchModelsApi(body: FetchModelsBody): Promise<string[]> {
  const { models } = await request<{ models: string[] }>('/models', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return models
}

export async function runModelApi(body: RunModelBody): Promise<string> {
  const { content } = await request<{ content: string }>('/run', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return content
}

// ---- 图像生成 ----
export async function generateImageApi(body: GenImageBody): Promise<string[]> {
  const { images } = await request<{ images: string[] }>('/aigc', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return images
}

// ---- 视频生成 ----
export async function generateVideoApi(body: GenVideoBody): Promise<string[]> {
  const { videos } = await request<{ videos: string[] }>('/video', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return videos
}

// ---- 图片上传 ----
// 走 multipart，不能复用 request()（它写死了 application/json）；让浏览器自带 boundary。
// 上传接口要求带用户标识 req_from（与图像生成署名一致）。
export async function uploadImagesApi(files: File[], reqFrom: string): Promise<string[]> {
  const form = new FormData()
  files.forEach((f) => form.append('files', f))
  form.append('req_from', reqFrom)
  let res: Response
  try {
    res = await fetch('/api/upload', { method: 'POST', body: form })
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
