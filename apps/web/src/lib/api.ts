import type {
  FetchModelsBody,
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
