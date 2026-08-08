import type {
  GenImageBody,
  GenPodcastBody,
  GenVideoBody,
  TaskDTO,
  TaskKind,
  TaskStatus,
} from '@openflow/shared'
import { db } from './db'
import {
  buildImagePayload,
  buildVideoPayload,
  EmptyResultError,
  runImageGen,
  runVideoGen,
  type AigcPayload,
  type GenOutcome,
} from './provider'
import {
  fingerprintFromPayload,
  pollHistoryForResult,
  POLL_DEADLINE_MS,
  resolveHistoryEndpoint,
} from './aigc-history'
import { readSettings } from './settings-store'
import { runPodcastGen } from './volc-tts'

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
  upstream_id: string
  raw_response: string
  created_at: number
  updated_at: number
}

// params 存请求体（含 projectId/nodeId 等，运行时只取生成相关字段），不含 req_from/端点。
type ImageParams = GenImageBody
type VideoParams = GenVideoBody
type PodcastParams = GenPodcastBody

function rowToDTO(row: TaskRow): TaskDTO {
  return {
    id: row.id,
    projectId: row.project_id,
    nodeId: row.node_id,
    kind: row.kind as TaskKind,
    status: row.status as TaskStatus,
    result: JSON.parse(row.result) as string[],
    error: row.error || undefined,
    upstreamId: row.upstream_id || undefined,
    rawResponse: row.raw_response || undefined,
    // upstream_id / raw_response 只在「拿到了上游响应或撞上网络错」时写入（见 sendOrRecover），
    // 上游明确失败（内容安全拦截等）走的是普通 Error、两列都空 —— 故这个派生判断成立。
    recoverable: Boolean(row.upstream_id || row.raw_response),
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
  params: ImageParams | VideoParams | PodcastParams
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

/** 生成类任务的执行计划：请求体（指纹用）与真正发送的动作分开拿，前者不依赖调用成功。 */
type GenPlan = { payload: AigcPayload; send: () => Promise<GenOutcome> }

/** 按任务参数装配图像/视频的执行计划（req_from / 端点在此从设置解析，不进 params）。 */
function planFor(kind: 'image' | 'video', params: string): GenPlan {
  const s = readSettings()
  if (kind === 'image') {
    const p = JSON.parse(params) as ImageParams
    const input = {
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
    }
    return { payload: buildImagePayload(input), send: () => runImageGen(input) }
  }
  const p = JSON.parse(params) as VideoParams
  const input = {
    reqFrom: s.defaultReqFrom,
    endpoint: s.aigcEndpoint,
    model: p.model,
    version: typeof p.version === 'string' ? p.version : '',
    mode: typeof p.mode === 'string' ? p.mode : '',
    prompt: p.prompt,
    images: Array.isArray(p.images) ? p.images : [],
    audios: Array.isArray(p.audios) ? p.audios : [],
    videos: Array.isArray(p.videos) ? p.videos : [],
    resolution: p.resolution || '720p',
    ratio: typeof p.ratio === 'string' ? p.ratio : undefined,
    duration: typeof p.duration === 'number' ? p.duration : 6,
    // 模型特有可调项：一律「传了才带上」，没传的让 buildVideoPayload 各自兜底
    generateAudio: typeof p.generateAudio === 'boolean' ? p.generateAudio : undefined,
    sound: typeof p.sound === 'boolean' ? p.sound : undefined,
    qualityMode: typeof p.qualityMode === 'string' ? p.qualityMode : undefined,
    multiShot: typeof p.multiShot === 'boolean' ? p.multiShot : undefined,
    shots: Array.isArray(p.shots) ? p.shots : undefined,
    watermark: typeof p.watermark === 'boolean' ? p.watermark : undefined,
  }
  return { payload: buildVideoPayload(input), send: () => runVideoGen(input) }
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
    if (task.kind === 'image' || task.kind === 'video') {
      const plan = planFor(task.kind, row.params)
      urls = await sendOrRecover(task, plan)
    } else {
      // podcast：逐行调火山 TTS 拼接成整期播客 WAV 落盘，result = [同源音频 URL]。
      // result = [音频 URL, 计费字数合计]（前端展示 usage）
      const p = JSON.parse(row.params) as PodcastParams
      const { url, textWords } = await runPodcastGen({
        script: p.script,
        roles: Array.isArray(p.roles) ? p.roles : [],
        options: {
          speechRate: typeof p.speechRate === 'number' ? p.speechRate : undefined,
          sampleRate: typeof p.sampleRate === 'number' ? p.sampleRate : undefined,
          loudnessRate: typeof p.loudnessRate === 'number' ? p.loudnessRate : undefined,
          pitch: typeof p.pitch === 'number' ? p.pitch : undefined,
          filterParenthesis: p.filterParenthesis === true,
          disableMarkdownFilter: p.disableMarkdownFilter === true,
          disableEmojiFilter: p.disableEmojiFilter === true,
          explicitLanguage: typeof p.explicitLanguage === 'string' ? p.explicitLanguage : undefined,
          contextText: typeof p.contextText === 'string' ? p.contextText : undefined,
          aigcWatermark: p.aigcWatermark === true,
          aigcMetadata: p.aigcMetadata && typeof p.aigcMetadata === 'object' ? p.aigcMetadata : undefined,
        },
        lineGapMs: typeof p.lineGapMs === 'number' ? p.lineGapMs : undefined,
        settings: s,
      })
      urls = [url, String(textWords)]
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

/** 写入上游标识与原始响应（失败现场；成败都存，供节点内查看/复制与历史认领）。 */
function saveUpstream(id: string, patch: { upstreamId?: string; rawResponse?: string }): void {
  if (patch.upstreamId !== undefined) {
    db.prepare('UPDATE tasks SET upstream_id = ? WHERE id = ?').run(patch.upstreamId, id)
  }
  if (patch.rawResponse !== undefined) {
    db.prepare('UPDATE tasks SET raw_response = ? WHERE id = ?').run(patch.rawResponse, id)
  }
}

/** 其余任务已认领的历史记录标识：同 prompt 连跑两次时，别让两个任务抢同一条记录。 */
function claimedIdsExcept(id: string): ReadonlySet<string> {
  const rows = db
    .prepare(`SELECT upstream_id FROM tasks WHERE upstream_id != '' AND id != ?`)
    .all(id) as { upstream_id: string }[]
  return new Set(rows.map((r) => r.upstream_id))
}

/**
 * 「没拿到 URL」不等于「生成失败」：上游 2xx 却没带回 URL、或长连接被中间设备掐断时，
 * 视频往往仍在生成，稍后会落进网关历史。这里转去历史接口按 request_id / 请求指纹认领结果。
 * 上游明确说失败（result.status=failed）则不在此列，由 provider 直接抛真实原因。
 */
async function sendOrRecover(task: TaskDTO, plan: GenPlan): Promise<string[]> {
  try {
    const outcome = await plan.send()
    saveUpstream(task.id, { upstreamId: outcome.requestId, rawResponse: outcome.rawText })
    return outcome.urls
  } catch (e) {
    if (e instanceof EmptyResultError) {
      saveUpstream(task.id, { upstreamId: e.requestId, rawResponse: e.rawText })
    } else if (isNetworkError(e)) {
      // 没有响应体可留，但把失败原因记成现场——同时让 DTO 的 recoverable 判断成立
      saveUpstream(task.id, { rawResponse: `请求未拿到响应：${e instanceof Error ? e.message : String(e)}` })
    } else {
      throw e
    }

    const s = readSettings()
    if (!resolveHistoryEndpoint(s.aigcHistoryEndpoint)) {
      const reason = e instanceof Error ? e.message : String(e)
      throw new Error(`${reason}\n（未配置 AIGC 历史查询接口，无法自动找回结果——可在设置中填写）`)
    }
    return recoverFromHistory(task, plan, {
      requestId: e instanceof EmptyResultError ? e.requestId : undefined,
    })
  }
}

/** 去历史接口轮询认领本次任务的结果。deadlineMs 省略则用默认 30 分钟。 */
async function recoverFromHistory(
  task: TaskDTO,
  plan: GenPlan,
  opts: { requestId?: string; deadlineMs?: number } = {},
): Promise<string[]> {
  const s = readSettings()
  const { urls, claimKey } = await pollHistoryForResult({
    endpoint: s.aigcHistoryEndpoint,
    reqFrom: s.defaultReqFrom,
    requestId: opts.requestId || undefined,
    fingerprint: fingerprintFromPayload(plan.payload),
    submittedAt: task.createdAt,
    getClaimed: () => claimedIdsExcept(task.id),
    onClaim: (key) => saveUpstream(task.id, { upstreamId: key }),
    deadlineMs: opts.deadlineMs,
  })
  if (claimKey) saveUpstream(task.id, { upstreamId: claimKey })
  return urls
}

/**
 * 网络层错误（fetch reject / 超时 / 连接被重置）判定。
 * undici 的 fetch 失败抛的是 TypeError('fetch failed')，真实原因在 cause 里。
 */
function isNetworkError(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  const cause = (e as { cause?: unknown }).cause
  const text = `${e.name} ${e.message} ${cause instanceof Error ? `${cause.name} ${cause.message}` : ''}`
  return /fetch failed|network|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|socket hang up|terminated|timeout|aborted/i.test(
    text,
  )
}

/** 单次复查（不等待）：拉一次历史看结果在不在，不在就报超时。供重启恢复与手动重拉。 */
function remainingDeadline(createdAt: number): number {
  return Math.max(0, createdAt + POLL_DEADLINE_MS - Date.now())
}

/**
 * 进程启动时对账：残留在 pending/running 的任务其内存态 work 已随进程丢失。
 *
 * 但「进程没了」≠「生成没了」——seedance 合法地要跑几十分钟，桌面端重启 / dev 热重载
 * 都会撞上；结果其实还在网关侧。故配了历史接口就重新挂上复查续跑（这正是内部另一个平台
 * 「重启刷新能在历史里找回」的对等能力），没配才维持标 failed。模块加载时调用一次。
 */
export function reconcileInterruptedTasks(): void {
  const rows = db
    .prepare(`SELECT * FROM tasks WHERE status IN ('pending', 'running')`)
    .all() as TaskRow[]
  if (rows.length === 0) return

  const historyReady = Boolean(resolveHistoryEndpoint(readSettings().aigcHistoryEndpoint))
  for (const row of rows) {
    const task = rowToDTO(row)
    if (!historyReady || (task.kind !== 'image' && task.kind !== 'video')) {
      updateStatus(task.id, { status: 'failed', error: '任务因服务重启中断' })
      continue
    }
    let plan: GenPlan
    try {
      plan = planFor(task.kind, row.params)
    } catch (e) {
      updateStatus(task.id, {
        status: 'failed',
        error: `任务因服务重启中断（无法复原请求参数：${e instanceof Error ? e.message : String(e)}）`,
      })
      continue
    }
    recoverFromHistory(task, plan, {
      requestId: row.upstream_id || undefined,
      deadlineMs: remainingDeadline(task.createdAt),
    })
      .then((urls) => updateStatus(task.id, { status: 'succeeded', result: urls }))
      .catch((e: unknown) =>
        updateStatus(task.id, {
          status: 'failed',
          error: `服务重启后未能找回结果：${e instanceof Error ? e.message : String(e)}`,
        }),
      )
  }
}

/**
 * 手动重拉：对已 failed 的生成任务再查一次历史（单次，不等待）。
 * 命中就把任务改回 succeeded —— 结果早就在网关侧，只是当时没拿到。
 */
export async function refetchTask(id: string): Promise<TaskDTO | undefined> {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined
  if (!row) return undefined
  const task = rowToDTO(row)
  if (task.kind !== 'image' && task.kind !== 'video') {
    throw new Error('该任务不支持从历史记录重拉结果')
  }
  if (!resolveHistoryEndpoint(readSettings().aigcHistoryEndpoint)) {
    throw new Error('未配置 AIGC 历史查询接口，请先在设置中填写')
  }
  if (task.status === 'succeeded') return task

  const plan = planFor(task.kind, row.params)
  const urls = await recoverFromHistory(task, plan, {
    requestId: row.upstream_id || undefined,
    deadlineMs: 0, // 单次查询：拿不到就如实报，不在请求里干等
  })
  updateStatus(task.id, { status: 'succeeded', result: urls })
  return getTask(task.id)
}

reconcileInterruptedTasks()

