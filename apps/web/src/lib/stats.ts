import type { GenStatRow } from '@openflow/shared'
import { matrixToTsv } from './tsv'

// 画布生成统计的纯函数：后端只给「每次点生成一行」的扁平明细（stats-store.ts），
// 分组聚合在这里做——汇总视图就是明细的 group by，同源才不会对不上账，
// 两个视图的「复制表格」也共用这一份数据。只算数量与秒数，**不算钱**（单价在外部维护）。

/** 一个统计分组：同模型 + 同版本 + 同规格 + 同单次时长的所有生成合并成一行。 */
export type StatGroup = {
  /** 分组键（React key 用，由各维度拼成）。 */
  key: string
  kind: 'image' | 'video'
  model: string
  version: string
  /** 出图/出片规格（图像 imageSize/size，视频 resolution 或可灵质量档）。 */
  resolution: string
  ratio: string
  quality: string
  /** 视频单次时长（秒）；-1=自动时长；图像恒 0。作分组维度之一，算总秒数要用。 */
  duration: number
  /** 总提交次数（含失败/进行中）——看操作量。 */
  total: number
  /** 成功次数——算钱用这一列。 */
  succeeded: number
  /** 成功任务的出图张数合计（图像）；视频恒 0。 */
  images: number
  /** 成功任务的视频秒数合计；**自动时长(-1)不计入**（实际秒数只有上游知道）。 */
  seconds: number
  /** 成功任务里自动时长的次数（秒数未知，单独标出来免得总秒数被误读成全量）。 */
  autoDuration: number
}

/** 全表总览（面板顶部的几个大数）。 */
export type StatTotals = {
  total: number
  succeeded: number
  failed: number
  /** 成功的出图张数合计。 */
  images: number
  /** 成功的视频秒数合计（不含自动时长）。 */
  seconds: number
  /** 成功的自动时长视频次数。 */
  autoDuration: number
  /** 最早 / 最晚一次生成的时间戳（0=无数据），供面板标注统计区间。 */
  firstAt: number
  lastAt: number
}

function groupKey(r: GenStatRow): string {
  return [r.kind, r.model, r.version, r.resolution, r.ratio, r.quality, r.duration].join(' | ')
}

/** 明细 → 分组汇总。排序：图像在前视频在后，组内按总次数降序（次数相同按模型名稳定排序）。 */
export function summarizeStats(rows: GenStatRow[]): StatGroup[] {
  const map = new Map<string, StatGroup>()
  for (const r of rows) {
    const key = groupKey(r)
    let g = map.get(key)
    if (!g) {
      g = {
        key,
        kind: r.kind,
        model: r.model,
        version: r.version,
        resolution: r.resolution,
        ratio: r.ratio,
        quality: r.quality,
        duration: r.duration,
        total: 0,
        succeeded: 0,
        images: 0,
        seconds: 0,
        autoDuration: 0,
      }
      map.set(key, g)
    }
    g.total += 1
    if (r.status !== 'succeeded') continue
    g.succeeded += 1
    if (r.kind === 'image') g.images += r.images
    else if (r.duration === -1) g.autoDuration += 1
    else g.seconds += r.duration
  }
  return [...map.values()].sort(
    (a, b) =>
      (a.kind === b.kind ? 0 : a.kind === 'image' ? -1 : 1) ||
      b.total - a.total ||
      a.model.localeCompare(b.model),
  )
}

/** 明细 → 总览大数。 */
export function totalStats(rows: GenStatRow[]): StatTotals {
  const t: StatTotals = {
    total: rows.length,
    succeeded: 0,
    failed: 0,
    images: 0,
    seconds: 0,
    autoDuration: 0,
    firstAt: 0,
    lastAt: 0,
  }
  for (const r of rows) {
    if (!t.firstAt || r.createdAt < t.firstAt) t.firstAt = r.createdAt
    if (r.createdAt > t.lastAt) t.lastAt = r.createdAt
    if (r.status === 'failed') t.failed += 1
    if (r.status !== 'succeeded') continue
    t.succeeded += 1
    if (r.kind === 'image') t.images += r.images
    else if (r.duration === -1) t.autoDuration += 1
    else t.seconds += r.duration
  }
  return t
}

const KIND_LABEL: Record<GenStatRow['kind'], string> = { image: '图像', video: '视频' }

const STATUS_LABEL: Record<string, string> = {
  succeeded: '成功',
  failed: '失败',
  running: '生成中',
  pending: '排队中',
}

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status
}

export function kindLabel(kind: GenStatRow['kind']): string {
  return KIND_LABEL[kind]
}

/** 单次时长的显示：-1 显示「自动」，图像行留空。 */
export function durationLabel(row: { kind: 'image' | 'video'; duration: number }): string {
  if (row.kind === 'image') return ''
  return row.duration === -1 ? '自动' : String(row.duration)
}

/** 时间戳 → 本地 `YYYY-MM-DD HH:mm:ss`（Excel 认得，且不带时区歧义）。 */
export function formatTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export const SUMMARY_HEADER = [
  '类型',
  '模型',
  '版本',
  '规格',
  '宽高比',
  '质量',
  '单次时长(秒)',
  '总次数',
  '成功次数',
  '出图张数',
  '视频秒数',
  '自动时长次数',
]

export const DETAIL_HEADER = [
  '时间',
  '类型',
  '模型',
  '版本',
  '规格',
  '宽高比',
  '质量',
  '张数',
  '时长(秒)',
  '状态',
  '节点 ID',
  '任务 ID',
]

export function summaryToMatrix(groups: StatGroup[]): string[][] {
  return groups.map((g) => [
    kindLabel(g.kind),
    g.model,
    g.version,
    g.resolution,
    g.ratio,
    g.quality,
    durationLabel(g),
    String(g.total),
    String(g.succeeded),
    g.kind === 'image' ? String(g.images) : '',
    g.kind === 'video' ? String(g.seconds) : '',
    g.kind === 'video' && g.autoDuration ? String(g.autoDuration) : '',
  ])
}

export function detailToMatrix(rows: GenStatRow[]): string[][] {
  return rows.map((r) => [
    formatTime(r.createdAt),
    kindLabel(r.kind),
    r.model,
    r.version,
    r.resolution,
    r.ratio,
    r.quality,
    r.kind === 'image' ? String(r.images) : '',
    durationLabel(r),
    statusLabel(r.status),
    r.nodeId,
    r.taskId,
  ])
}

/** 汇总表 → TSV（含表头），供「复制表格」直接粘进 Excel / 飞书表格。 */
export function summaryToTsv(groups: StatGroup[]): string {
  return matrixToTsv([SUMMARY_HEADER, ...summaryToMatrix(groups)])
}

/** 明细表 → TSV（含表头）。 */
export function detailToTsv(rows: GenStatRow[]): string {
  return matrixToTsv([DETAIL_HEADER, ...detailToMatrix(rows)])
}
