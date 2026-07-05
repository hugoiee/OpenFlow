import type {
  GenImageBody,
  GenLlmBody,
  GenVideoBody,
  TaskDTO,
  TaskKind,
  TaskStatus,
} from '@openflow/shared'
import { db } from './db'
import { runLlmCompletion } from './llm'
import { runImageGen, runVideoGen } from './provider'
import { readSettings } from './settings-store'

// 异步生成任务的持久化 + 进程内 runner。
// 单进程（Node/Electron 内嵌）：POST 建行 → startTask fire 一个不 await 的 Promise 后台跑，
// 完成/失败时回写行。前端凭 taskId 轮询；刷新页面后凭存在节点上的 taskId 重连。

type TaskRow = {
  id: string
  project_id: string
  node_id: string
  kind: string
  status: string
  params: string
  result: string
  error: string
  created_at: number
  updated_at: number
}

// params 存请求体（含 projectId/nodeId 等，运行时只取生成相关字段），不含 req_from/端点。
type ImageParams = GenImageBody
type VideoParams = GenVideoBody
type LlmParams = GenLlmBody

function rowToDTO(row: TaskRow): TaskDTO {
  return {
    id: row.id,
    projectId: row.project_id,
    nodeId: row.node_id,
    kind: row.kind as TaskKind,
    status: row.status as TaskStatus,
    result: JSON.parse(row.result) as string[],
    error: row.error || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function newId(): string {
  return `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** 建任务行（status=pending），返回 DTO。params 为对应生成接口的请求体。 */
export function createTask(input: {
  projectId: string
  nodeId: string
  kind: TaskKind
  params: ImageParams | VideoParams | LlmParams
}): TaskDTO {
  const id = newId()
  const now = Date.now()
  db.prepare(
    `INSERT INTO tasks (id, project_id, node_id, kind, status, params, result, error, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', ?, '[]', '', ?, ?)`,
  ).run(id, input.projectId, input.nodeId, input.kind, JSON.stringify(input.params), now, now)
  return {
    id,
    projectId: input.projectId,
    nodeId: input.nodeId,
    kind: input.kind,
    status: 'pending',
    result: [],
    createdAt: now,
    updatedAt: now,
  }
}

export function getTask(id: string): TaskDTO | undefined {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined
  return row ? rowToDTO(row) : undefined
}

/** 取某节点最近一次任务（刷新后无 taskId 时按节点重连兜底）。 */
export function getLatestTaskForNode(
  projectId: string,
  nodeId: string,
): TaskDTO | undefined {
  const row = db
    .prepare(
      'SELECT * FROM tasks WHERE project_id = ? AND node_id = ? ORDER BY created_at DESC LIMIT 1',
    )
    .get(projectId, nodeId) as TaskRow | undefined
  return row ? rowToDTO(row) : undefined
}

function updateStatus(
  id: string,
  patch: { status: TaskStatus; result?: string[]; error?: string },
): void {
  db.prepare(
    'UPDATE tasks SET status = ?, result = ?, error = ?, updated_at = ? WHERE id = ?',
  ).run(
    patch.status,
    JSON.stringify(patch.result ?? []),
    patch.error ?? '',
    Date.now(),
    id,
  )
}

/**
 * 后台执行任务：同步置 running → 不 await 地 fire run()（.catch 防未处理拒绝崩进程）。
 * req_from / 端点在此运行时从设置解析（不进 params，避免持久化署名）。
 */
export function startTask(task: TaskDTO): void {
  updateStatus(task.id, { status: 'running' })
  const row = db.prepare('SELECT params FROM tasks WHERE id = ?').get(task.id) as
    | { params: string }
    | undefined
  if (!row) return
  const run = async (): Promise<void> => {
    const s = readSettings()
    let urls: string[]
    if (task.kind === 'image') {
      const p = JSON.parse(row.params) as ImageParams
      urls = await runImageGen({
        reqFrom: s.defaultReqFrom,
        endpoint: s.aigcEndpoint,
        model: p.model,
        prompt: p.prompt,
        images: Array.isArray(p.images) ? p.images : [],
        size: p.size || 'auto',
        n: typeof p.n === 'number' ? p.n : 1,
        quality: p.quality || 'auto',
        version: typeof p.version === 'string' ? p.version : '',
        aspectRatio: typeof p.aspectRatio === 'string' ? p.aspectRatio : '',
        imageSize: typeof p.imageSize === 'string' ? p.imageSize : '',
      })
    } else if (task.kind === 'video') {
      const p = JSON.parse(row.params) as VideoParams
      urls = await runVideoGen({
        reqFrom: s.defaultReqFrom,
        endpoint: s.aigcEndpoint,
        model: p.model,
        version: typeof p.version === 'string' ? p.version : '',
        mode: typeof p.mode === 'string' ? p.mode : '',
        prompt: p.prompt,
        images: Array.isArray(p.images) ? p.images : [],
        audios: Array.isArray(p.audios) ? p.audios : [],
        resolution: p.resolution || '720p',
        ratio: typeof p.ratio === 'string' ? p.ratio : undefined,
        duration: typeof p.duration === 'number' ? p.duration : 6,
      })
    } else {
      // llm：文本补全。result 打包成 [回答] 或 [回答, 思考]（思考文本供折叠展示）。
      const p = JSON.parse(row.params) as LlmParams
      const { text, reasoning } = await runLlmCompletion({
        model: p.model,
        prompt: p.prompt,
        systemPrompt: typeof p.systemPrompt === 'string' ? p.systemPrompt : undefined,
        images: Array.isArray(p.images) ? p.images : [],
        audios: Array.isArray(p.audios) ? p.audios : [],
        videos: Array.isArray(p.videos) ? p.videos : [],
        temperature: typeof p.temperature === 'number' ? p.temperature : 0.7,
        thinking: p.thinking === true,
        settings: s,
      })
      urls = reasoning ? [text, reasoning] : [text]
    }
    updateStatus(task.id, { status: 'succeeded', result: urls })
  }
  run().catch((e: unknown) => {
    updateStatus(task.id, {
      status: 'failed',
      error: e instanceof Error ? e.message : String(e),
    })
  })
}

/**
 * 进程启动时对账：残留在 pending/running 的任务其内存态 work 已随进程丢失，
 * 一律标 failed，避免前端轮询永远转圈。模块加载时调用一次。
 */
export function reconcileInterruptedTasks(): void {
  db.prepare(
    `UPDATE tasks SET status = 'failed', error = ?, updated_at = ?
     WHERE status IN ('pending', 'running')`,
  ).run('任务因服务重启中断', Date.now())
}

reconcileInterruptedTasks()

