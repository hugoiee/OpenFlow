import { Hono } from 'hono'
import type { ProjectDTO, ProjectStatsResponse, ProjectType } from '@openflow/shared'
import { db } from '../db'
import { listProjectStats } from '../stats-store'

export const projects = new Hono()

type ProjectRow = {
  id: string
  name: string
  type: string
  nodes: string
  edges: string
  data: string
  pinned: number
  updated_at: number
}

/** 未知/缺失的形态一律当画布项目（旧行的 type 列由 ALTER 补成 'canvas'，这里再兜一层） */
function normalizeType(raw: unknown): ProjectType {
  return raw === 'evaluation' ? 'evaluation' : 'canvas'
}

function rowToDTO(row: ProjectRow): ProjectDTO {
  return {
    id: row.id,
    name: row.name,
    type: normalizeType(row.type),
    nodes: JSON.parse(row.nodes),
    edges: JSON.parse(row.edges),
    data: JSON.parse(row.data || '{}'),
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

// 新建（type 只在此处定；建后不可变）
projects.post('/', async (c) => {
  const body = await c.req.json<Partial<ProjectDTO>>().catch((): Partial<ProjectDTO> => ({}))
  const project: ProjectDTO = {
    id: newId(),
    name: body.name?.trim() || '未命名项目',
    type: normalizeType(body.type),
    nodes: body.nodes ?? [],
    edges: body.edges ?? [],
    data: body.data ?? {},
    pinned: false,
  }
  db.prepare(
    'INSERT INTO projects (id, name, type, nodes, edges, data, pinned, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    project.id,
    project.name,
    project.type,
    JSON.stringify(project.nodes),
    JSON.stringify(project.edges),
    JSON.stringify(project.data),
    0,
    Date.now(),
  )
  return c.json(project, 201)
})

// 生成统计（画布项目的开销明细）：读 tasks 表里属于本项目的图像/视频任务，
// 每次「点生成」一行。**必须放在 PUT/DELETE 的 /:id 之前**不受影响（方法不同不冲突），
// 但要早于任何 get('/:id') 通配路由——目前没有，故位置只需在文件内可读即可。
projects.get('/:id/stats', (c) => {
  const id = c.req.param('id')
  const exists = db.prepare('SELECT id FROM projects WHERE id = ?').get(id)
  if (!exists) return c.json({ error: '项目不存在' }, 404)
  const res: ProjectStatsResponse = { rows: listProjectStats(id) }
  return c.json(res)
})

// 更新（name / nodes / edges / data / pinned，传什么改什么；**type 不可改**故不从 body 读）
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
  // 评估表同置顶一样用 undefined 判断：清空后的表格是 {} / {columns:[],rows:[]}，用 || 回退会把「删光」写不进去
  const data = body.data === undefined ? existing.data : JSON.stringify(body.data)
  // 置顶用 undefined 判断（不能用 || 回退，否则「取消置顶」的 false 会被当成没传）
  const pinned = body.pinned === undefined ? existing.pinned : body.pinned ? 1 : 0
  // 只切置顶时不刷新 updated_at：置顶开关不该把项目顶到「最近更新」最前、打乱次级排序
  const updatedAt =
    body.name !== undefined ||
    body.nodes !== undefined ||
    body.edges !== undefined ||
    body.data !== undefined
      ? Date.now()
      : existing.updated_at
  db.prepare(
    'UPDATE projects SET name = ?, nodes = ?, edges = ?, data = ?, pinned = ?, updated_at = ? WHERE id = ?',
  ).run(name, nodes, edges, data, pinned, updatedAt, id)

  return c.json(rowToDTO({ ...existing, name, nodes, edges, data, pinned }))
})

// 删除
projects.delete('/:id', (c) => {
  const id = c.req.param('id')
  db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  return c.json({ ok: true })
})
