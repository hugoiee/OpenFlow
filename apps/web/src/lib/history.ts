// 生成历史面板的纯函数（不依赖 React / store）：把后端返回的记录行整理成可展示、可复制的形状。
// 与 lib/stats.ts 的分工同后端两个 store——那边算钱、这边找链接；时间格式化复用 stats 的 formatTime，
// 两个面板的时间列写法保持一致。

import type { GenHistoryRow, TaskKind, TaskStatus } from '@openflow/shared'
import { formatTime } from './stats'
import type { FlowNode } from './types'

/** 任务类型的中文名（列表里的「类型」列）。 */
const KIND_LABEL: Record<TaskKind, string> = {
  image: '图像',
  video: '视频',
  podcast: '播客',
}

export function historyKindLabel(kind: TaskKind): string {
  return KIND_LABEL[kind] ?? kind
}

/** 任务状态的中文名 + 是否算「有产出」。 */
const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: '排队中',
  running: '生成中',
  succeeded: '成功',
  failed: '失败',
}

export function historyStatusLabel(status: TaskStatus): string {
  return STATUS_LABEL[status] ?? status
}

/**
 * 一条记录里**真正可用的结果链接**。
 * 播客任务的 result 是 [音频URL, 计费字数]——第二项是数字字符串不是链接，
 * 直接整个数组当链接渲染会多出一行「128」这种垃圾条目，故按类型只取首项。
 */
export function historyUrls(row: GenHistoryRow): string[] {
  if (row.kind === 'podcast') return row.result.slice(0, 1)
  return row.result
}

/**
 * 记录 → 画布上的来源节点名。节点可能已被删除或改过名，故：
 * 查得到用当前 label（跟着改名走，比存快照准），查不到退回节点 id 本身
 * （**不显示「已删除」**——任务行留着就是为了产出还在，标成删除反而像是链接也没了）。
 */
export function historyNodeLabel(row: GenHistoryRow, nodes: FlowNode[]): string {
  const node = nodes.find((n) => n.id === row.nodeId)
  const label = node && 'label' in node.data ? String(node.data.label ?? '').trim() : ''
  return label || row.nodeId
}

/** 该记录的来源节点是否还在画布上（决定要不要给「定位到节点」之类的入口留位置）。 */
export function historyNodeExists(row: GenHistoryRow, nodes: FlowNode[]): boolean {
  return nodes.some((n) => n.id === row.nodeId)
}

/** 只保留有结果链接的记录（面板默认视图：来这儿就是找链接的，失败行是噪音）。 */
export function withResultsOnly(rows: GenHistoryRow[]): GenHistoryRow[] {
  return rows.filter((r) => historyUrls(r).length > 0)
}

/**
 * 「复制全部链接」的文本：每行一个 URL，一条记录出多张图就出多行。
 * 刻意**只给裸链接不带时间/节点名**——复制出去多半是要粘进下载器或表格的某一列，
 * 带上说明文字反而要人再手工清理一遍。
 */
export function urlsToText(rows: GenHistoryRow[]): string {
  return rows.flatMap((r) => historyUrls(r)).join('\n')
}

/** 列表一行在 UI 上需要的全部字段（组件只管画，取值逻辑全在这儿）。 */
export type HistoryEntry = {
  row: GenHistoryRow
  time: string
  kind: string
  status: string
  nodeLabel: string
  nodeExists: boolean
  urls: string[]
}

/** 后端记录 + 当前画布节点 → 可直接渲染的列表项。 */
export function toEntries(rows: GenHistoryRow[], nodes: FlowNode[]): HistoryEntry[] {
  return rows.map((row) => ({
    row,
    time: formatTime(row.createdAt),
    kind: historyKindLabel(row.kind),
    status: historyStatusLabel(row.status),
    nodeLabel: historyNodeLabel(row, nodes),
    nodeExists: historyNodeExists(row, nodes),
    urls: historyUrls(row),
  }))
}
