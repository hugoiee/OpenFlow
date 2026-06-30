import { listProjects } from '@/lib/api'

// 一次性把旧版纯前端 localStorage 项目数据导入后端；导入后打标记，避免重复。
const FLAG = 'openflow-migrated'

type OldProject = { id: string; name: string; nodes?: unknown[]; edges?: unknown[] }

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

export async function migrateLocalStorage(): Promise<void> {
  if (localStorage.getItem(FLAG)) return
  try {
    await migrateProjects()
    localStorage.setItem(FLAG, '1')
  } catch (e) {
    // 失败不打标记，下次启动重试
    console.error('[openflow] localStorage 迁移失败', e)
  }
}
