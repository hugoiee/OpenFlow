// 画布连线（上游 → 下游）的数据采集工具。
// 下游 image/video 生成节点运行时，从指向自己的连线收集上游产物：
//   - 上游 prompt 节点 → 文本指令
//   - 上游 image 节点 / 图像素材节点 → 结果图（作为下游的输入图）
//   - 上游 音频素材节点 → 音频 URL（作为视频节点的 audio_list）

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
 * 收集所有指向 nodeId 的上游图像 URL（作为下游输入图）。
 * 来源：上游 image 生成节点的结果图 + 上游图像素材节点的 URL。
 * 按连线（edges）顺序展平；为空的来源不贡献。video 输出不作为图像输入。
 */
export function collectUpstreamImages(project: Project, nodeId: string): string[] {
  const out: string[] = []
  for (const e of project.edges) {
    if (e.target !== nodeId) continue
    const src = project.nodes.find((n) => n.id === e.source)
    if (src?.type === 'image') {
      out.push(...(src.data.result ?? []).filter(Boolean))
    } else if (src?.type === 'asset' && src.data.kind === 'image' && src.data.url) {
      out.push(src.data.url)
    }
  }
  return out
}

/**
 * 收集所有指向 nodeId 的上游音频素材节点的 URL（作为视频节点的 audio_list）。
 * 按连线（edges）顺序展平；URL 为空的素材不贡献。
 */
export function collectUpstreamAudio(project: Project, nodeId: string): string[] {
  const out: string[] = []
  for (const e of project.edges) {
    if (e.target !== nodeId) continue
    const src = project.nodes.find((n) => n.id === e.source)
    if (src?.type === 'asset' && src.data.kind === 'audio' && src.data.url) {
      out.push(src.data.url)
    }
  }
  return out
}
