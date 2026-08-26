import type { GenImageBody, GenStatRow, GenVideoBody, TaskStatus } from '@openflow/shared'
import { db } from './db'

// 画布生成统计的**读侧**：不新建表、不埋点——tasks 表本就是每次「点生成」的权威记录，
// params 列存的就是当初发出的请求体（含 model/version/尺寸/时长），够还原全部统计维度。
// 这里只做「取行 + 解析 params → 扁平明细行」，分组聚合留给前端（汇总即明细的 group by，
// 同源才不会对不上账）。播客 TTS 与 Agent LLM 调用不入统计（费用另算）。

type StatRow = {
  id: string
  node_id: string
  kind: string
  status: string
  params: string
  created_at: number
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** 图像任务 → 明细行。Image 2 走 size/quality/n，Nano Banana 走 version/imageSize/aspectRatio。 */
function imageRow(row: StatRow, p: Partial<GenImageBody>): GenStatRow {
  return {
    taskId: row.id,
    nodeId: row.node_id,
    kind: 'image',
    status: row.status as TaskStatus,
    model: str(p.model) || '(未知模型)',
    version: str(p.version),
    // 两家的「出图规格」字段名不同，统一收进 resolution 一列。
    // **imageSize 优先**：Nano Banana 的真实规格在 imageSize(1K/2K/4K)，而 size 是 Image 2 的字段、
    // 在 Nano 的请求体里恒为遗留的 'auto'——先取 size 会把每条 Nano 记录都统计成 auto。
    resolution: str(p.imageSize) || str(p.size),
    ratio: str(p.aspectRatio),
    quality: str(p.quality),
    // n 只有 Image 2 有；缺失/非法一律按 1 张算（宁可少算也不虚高）
    images: Number.isFinite(p.n) && (p.n as number) > 0 ? Math.round(p.n as number) : 1,
    duration: 0,
    createdAt: row.created_at,
  }
}

/** 视频任务 → 明细行。可灵不发 resolution，改用质量档 std/pro，故落到同一列并标注。 */
function videoRow(row: StatRow, p: Partial<GenVideoBody>): GenStatRow {
  const quality = str(p.qualityMode)
  return {
    taskId: row.id,
    nodeId: row.node_id,
    kind: 'video',
    status: row.status as TaskStatus,
    model: str(p.model) || '(未知模型)',
    version: str(p.version),
    // 可灵没有分辨率概念（用 std/pro 档），直接把档位填进这一列，免得统计表里整列空白看不出差异
    resolution: str(p.resolution) || (quality ? `${quality}(质量档)` : ''),
    ratio: str(p.ratio),
    quality: '',
    images: 1,
    // -1 = 自动时长（seedance 2.5）：实际秒数只有上游知道，原样保留由前端单独归组、不计入总秒数
    duration: Number.isFinite(p.duration) ? Math.round(p.duration as number) : 0,
    createdAt: row.created_at,
  }
}

/** 取某项目的全部图像/视频生成明细（新→旧）。params 解析失败的行跳过而非整体报错。 */
export function listProjectStats(projectId: string): GenStatRow[] {
  const rows = db
    .prepare(
      `SELECT id, node_id, kind, status, params, created_at FROM tasks
       WHERE project_id = ? AND kind IN ('image', 'video')
       ORDER BY created_at DESC`,
    )
    .all(projectId) as StatRow[]

  const out: GenStatRow[] = []
  for (const row of rows) {
    let params: Record<string, unknown>
    try {
      params = JSON.parse(row.params) as Record<string, unknown>
    } catch {
      continue // 早期/损坏的行没有可用参数，统计不了就不进表（比塞一行空白强）
    }
    out.push(
      row.kind === 'video'
        ? videoRow(row, params as Partial<GenVideoBody>)
        : imageRow(row, params as Partial<GenImageBody>),
    )
  }
  return out
}
