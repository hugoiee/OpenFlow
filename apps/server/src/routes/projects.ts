import { Hono } from 'hono'
import type { ProjectDTO } from '@openflow/shared'
import { db } from '../db'

export const projects = new Hono()

type ProjectRow = {
  id: string
  name: string
  nodes: string
  edges: string
  pinned: number
  updated_at: number
}

function rowToDTO(row: ProjectRow): ProjectDTO {
  return {
    id: row.id,
    name: row.name,
    nodes: JSON.parse(row.nodes),
    edges: JSON.parse(row.edges),
    pinned: row.pinned === 1,
  }
}

function newId(): string {
  return `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

// 列表（置顶优先，组内仍按最近更新）
projects.get('/', (c) => {
  const rows = db
    .prepare('SELECT * FROM projects ORDER BY pinned DESC, updated_at DESC')
    .all() as ProjectRow[]
  return c.json(rows.map(rowToDTO))
})

// 新建
projects.post('/', async (c) => {
  const body = await c.req.json<Partial<ProjectDTO>>().catch((): Partial<ProjectDTO> => ({}))
  const project: ProjectDTO = {
    id: newId(),
    name: body.name?.trim() || '未命名项目',
    nodes: body.nodes ?? [],
    edges: body.edges ?? [],
    pinned: false,
  }
  db.prepare(
    'INSERT INTO projects (id, name, nodes, edges, pinned, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(
    project.id,
    project.name,
    JSON.stringify(project.nodes),
    JSON.stringify(project.edges),
    0,
    Date.now(),
  )
  return c.json(project, 201)
})

// 更新（name / nodes / edges / pinned，传什么改什么）
projects.put('/:id', async (c) => {
  const id = c.req.param('id')
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
    | ProjectRow
    | undefined
  if (!existing) return c.json({ error: '项目不存在' }, 404)

  const body = await c.req.json<Partial<ProjectDTO>>().catch((): Partial<ProjectDTO> => ({}))
  const name = body.name?.trim() || existing.name
  const nodes = body.nodes ? JSON.stringify(body.nodes) : existing.nodes
  const edges = body.edges ? JSON.stringify(body.edges) : existing.edges
  // 置顶用 undefined 判断（不能用 || 回退，否则「取消置顶」的 false 会被当成没传）
  const pinned = body.pinned === undefined ? existing.pinned : body.pinned ? 1 : 0
  // 只切置顶时不刷新 updated_at：置顶开关不该把项目顶到「最近更新」最前、打乱次级排序
  const updatedAt =
    body.name !== undefined || body.nodes !== undefined || body.edges !== undefined
      ? Date.now()
      : existing.updated_at
  db.prepare(
    'UPDATE projects SET name = ?, nodes = ?, edges = ?, pinned = ?, updated_at = ? WHERE id = ?',
  ).run(name, nodes, edges, pinned, updatedAt, id)

  return c.json(rowToDTO({ ...existing, name, nodes, edges, pinned }))
})

// 删除
projects.delete('/:id', (c) => {
  const id = c.req.param('id')
  db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  return c.json({ ok: true })
})
