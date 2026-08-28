import type { GenHistoryRow, TaskKind, TaskStatus } from '@openflow/shared'
import { db } from './db'

// 画布生成历史的**读侧**：同 stats-store，不新建表也不埋点——tasks 表本就是每次「点生成」
// 的权威记录，params 是当初发出的请求体、result 是拿回来的结果 URL，两样都在库里且从不删。
// 与 stats-store 的分工：那份为**算钱**（扁平化规格维度、刻意丢掉 result、不含播客），
// 这份为**找回产出**（核心就是 result 与认得出人的 prompt 摘要，且三类任务全收）。
// 各读各的、互不影响——合成一份只会让「算钱」与「找链接」互相将就。

type HistoryRow = {
  id: string
  node_id: string
  kind: string
  status: string
  params: string
  result: string
  created_at: number
}

/** prompt 摘要长度：够认出是哪一条即可，整段发出去只会把列表撑爆。 */
const PROMPT_MAX = 200

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * 从请求体里取「能认出这条是什么」的一句话。
 * 图像/视频取 prompt；可灵多镜头模式顶层 prompt 本就为空，改拼各分镜的 prompt；
 * 播客没有 prompt，取脚本开头（脚本是多行对话，换行压成空格才不会把列表撑高）。
 */
function digestOf(kind: string, p: Record<string, unknown>): string {
  let text = str(p.prompt)
  if (!text && Array.isArray(p.shots)) {
    text = (p.shots as { prompt?: unknown }[])
      .map((s) => str(s?.prompt))
      .filter(Boolean)
      .join(' / ')
  }
  if (!text && kind === 'podcast') text = str(p.script)
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > PROMPT_MAX ? `${flat.slice(0, PROMPT_MAX)}…` : flat
}

/** result 列（JSON 数组）→ 字符串数组；损坏/非数组一律当空，不让一行脏数据毁掉整个列表。 */
function parseResult(raw: string): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === 'string') : []
  } catch {
    return []
  }
}

/**
 * 取某项目的全部生成记录（新→旧，含图像/视频/播客）。
 * **params 解析失败的行不跳过**——这点和 stats 相反：统计缺了参数那一行就没意义，
 * 而历史的核心是 result，参数解析不出来只是没了摘要，链接照样要还给用户。
 */
export function listProjectHistory(projectId: string): GenHistoryRow[] {
  const rows = db
    .prepare(
      `SELECT id, node_id, kind, status, params, result, created_at FROM tasks
       WHERE project_id = ?
       ORDER BY created_at DESC`,
    )
    .all(projectId) as HistoryRow[]

  return rows.map((row) => {
    let params: Record<string, unknown> = {}
    try {
      params = JSON.parse(row.params) as Record<string, unknown>
    } catch {
      // 摘要与模型名会是空的，但 result 仍原样返回
    }
    return {
      taskId: row.id,
      nodeId: row.node_id,
      kind: row.kind as TaskKind,
      status: row.status as TaskStatus,
      model: str(params.model),
      prompt: digestOf(row.kind, params),
      result: parseResult(row.result),
      createdAt: row.created_at,
    }
  })
}
