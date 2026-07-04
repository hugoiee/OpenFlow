// 画布连线（上游 → 下游）的数据采集工具。
// 下游 image/video 生成节点运行时，从指向自己的连线收集上游产物：
//   - 上游 prompt 节点 → 文本指令
//   - 上游 image 节点 / 图像素材节点 → 结果图（作为下游的输入图）
//   - 上游 音频素材节点 → 音频 URL（作为视频节点的 audio_list）

import { type Project } from './types'

/**
 * Any LLM 节点的「System Prompt 输入端点」的 handle id。
 * LLM 节点有两个左侧输入：默认端点（无 id，收用户 Prompt）+ 此端点（收系统提示词）。
 * 历史连线的 targetHandle 为空 → 归入用户 Prompt（向后兼容）。
 */
export const LLM_SYSTEM_HANDLE = 'system'

/** 收集时的端点过滤：不传=全部；'user'=默认端点（非 system，含历史空 handle）；'system'=系统提示词端点。 */
type PromptHandle = 'user' | 'system'

/** 边的 targetHandle 是否命中所选输入端点。 */
function edgeMatchesHandle(
  targetHandle: string | null | undefined,
  handle: PromptHandle | undefined,
): boolean {
  if (!handle) return true // 未指定：所有指向本节点的连线（image/video/prompt 链）
  if (handle === 'system') return targetHandle === LLM_SYSTEM_HANDLE
  return targetHandle !== LLM_SYSTEM_HANDLE // 'user'：默认端点（含历史空 handle）
}

/**
 * 收集所有指向 nodeId 的上游文本，拼成生成指令。
 * 来源：上游 prompt 节点的文本 + 上游 Any LLM 节点的输出文本（其右侧输出端点接下游作 prompt）。
 * prompt 节点有左侧输入：会**递归**并入它自己的上游文本（上游在前、本节点文本在后），
 * 从而支持「Prompt → Prompt → 图像」这类链式拼接；LLM 节点的输出（result）为终点，不再回溯其上游
 * （其结果已是加工产物，避免与喂给它的 prompt 重复计算）。visited 做环路防护（同一节点只计一次）。
 *
 * opts.handle：LLM 节点区分两个输入端点时传入（'user' 收用户 Prompt / 'system' 收系统提示词）；
 * 图像/视频/prompt 链不传，收全部上游。递归进上游 prompt 节点时不再过滤端点（prompt 只有单一输入）。
 */
export function collectUpstreamPrompt(
  project: Project,
  nodeId: string,
  opts: { handle?: PromptHandle; visited?: Set<string> } = {},
): string {
  const visited = opts.visited ?? new Set<string>()
  if (visited.has(nodeId)) return ''
  visited.add(nodeId)
  const sourceIds = new Set(
    project.edges
      .filter((e) => e.target === nodeId && edgeMatchesHandle(e.targetHandle, opts.handle))
      .map((e) => e.source),
  )
  return project.nodes
    .filter((n) => (n.type === 'prompt' || n.type === 'llm') && sourceIds.has(n.id))
    .map((n) => {
      if (n.type === 'llm') return n.data.result ?? ''
      if (n.type === 'prompt') {
        // 本 prompt 节点的上游文本（递归、不再区分端点）在前，自身文本在后
        const upstream = collectUpstreamPrompt(project, n.id, { visited })
        return [upstream, n.data.text].filter(Boolean).join('\n\n')
      }
      return ''
    })
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
