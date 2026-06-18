import type { ProviderId } from '@openflow/shared'
import { getSettingsApi, listProjects, saveSettingsApi } from '@/lib/api'

// 一次性把旧版纯前端 localStorage 数据导入后端；导入后打标记，避免重复。
const FLAG = 'openflow-migrated'

type OldProject = { id: string; name: string; nodes?: unknown[]; edges?: unknown[] }
type OldProviderConfig = {
  apiKey?: string
  baseURL?: string
  selectedModel?: string
  models?: string[]
}

function readLS<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

async function migrateProjects(): Promise<void> {
  const old = readLS<{ state?: { projects?: OldProject[] } }>('openflow-store')
  const projects = old?.state?.projects ?? []
  if (projects.length === 0) return
  if ((await listProjects()).length > 0) return // 后端已有数据，不覆盖

  for (const p of projects) {
    await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: p.name, nodes: p.nodes ?? [], edges: p.edges ?? [] }),
    })
  }
}

async function migrateSettings(): Promise<void> {
  const old = readLS<{
    state?: {
      activeProviderId?: ProviderId
      configs?: Partial<Record<ProviderId, OldProviderConfig>>
      // 更旧的扁平结构（迭代 1）
      settings?: { baseURL?: string; apiKey?: string; defaultModel?: string }
    }
  }>('openflow-settings')
  const state = old?.state
  if (!state) return
  if (Object.keys((await getSettingsApi()).configs).length > 0) return // 后端已有配置

  // 迭代 2 结构：configs 按供应商
  const configs = state.configs ?? {}
  let migrated = false
  for (const [id, cfg] of Object.entries(configs)) {
    if (!cfg || (!cfg.apiKey && !cfg.baseURL)) continue
    await saveSettingsApi({
      providerId: id as ProviderId,
      apiKey: cfg.apiKey,
      baseURL: cfg.baseURL ?? '',
      selectedModel: cfg.selectedModel ?? '',
      models: cfg.models ?? [],
    })
    migrated = true
  }

  // 迭代 1 扁平结构：归到 custom
  if (!migrated && (state.settings?.baseURL || state.settings?.apiKey)) {
    await saveSettingsApi({
      providerId: 'custom',
      apiKey: state.settings.apiKey,
      baseURL: state.settings.baseURL ?? '',
      selectedModel: state.settings.defaultModel ?? '',
      models: [],
    })
  }
}

export async function migrateLocalStorage(): Promise<void> {
  if (localStorage.getItem(FLAG)) return
  try {
    await migrateProjects()
    await migrateSettings()
    localStorage.setItem(FLAG, '1')
  } catch (e) {
    // 失败不打标记，下次启动重试
    console.error('[openflow] localStorage 迁移失败', e)
  }
}
