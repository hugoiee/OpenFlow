// 画布连线（上游 → 下游）的数据采集工具。
// 下游 image/video 生成节点运行时，从指向自己的连线收集上游产物：
//   - 上游 prompt 节点 → 文本指令
//   - 上游 image 节点 → 生成结果图（作为下游的输入图）

import { type Project } from './types'

/** 收集所有指向 nodeId 的上游 prompt 节点文本，拼成生成指令。 */
export function collectUpstreamPrompt(project: Project, nodeId: string): string {
  const sourceIds = new Set(
    project.edges.filter((e) => e.target === nodeId).map((e) => e.source),
  )
  return project.nodes
    .filter((n) => n.type === 'prompt' && sourceIds.has(n.id))
    .map((n) => (n.type === 'prompt' ? n.data.text : ''))
    .filter(Boolean)
    .join('\n\n')
}

/**
 * 收集所有指向 nodeId 的上游 image 节点的生成结果 URL（作为下游输入图）。
 * 按连线（edges）顺序展平；上游未生成（result 为空）则不贡献。
 * 仅取 image 类型上游——video 输出不作为图像输入。
 */
export function collectUpstreamImages(project: Project, nodeId: string): string[] {
  const out: string[] = []
  for (const e of project.edges) {
    if (e.target !== nodeId) continue
    const src = project.nodes.find((n) => n.id === e.source)
    if (src?.type === 'image') {
      out.push(...(src.data.result ?? []).filter(Boolean))
    }
  }
  return out
}
