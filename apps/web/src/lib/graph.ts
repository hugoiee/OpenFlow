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

/** 图像输入端点 handle id 前缀：LLM/图像节点的第 i 个图像端点为 `image-${i}`（i 从 0 起，展示编号 i+1）。 */
export const IMAGE_INPUT_HANDLE_PREFIX = 'image-'
export function imageInputHandleId(index: number): string {
  return `${IMAGE_INPUT_HANDLE_PREFIX}${index}`
}

/** 节点图像输入端点数量（含旧数据兜底）：至少 1。 */
export function imageInputCount(imageInputs: number | undefined): number {
  return Math.max(1, imageInputs ?? 1)
}

/** 从 targetHandle 解析图像端点排序键：'image-N'→N（编号顺序）；其余（含旧的空 handle）→ -1（排最前，兼容旧连线）。 */
function imageInputSlot(targetHandle: string | null | undefined): number {
  if (typeof targetHandle === 'string' && targetHandle.startsWith(IMAGE_INPUT_HANDLE_PREFIX)) {
    const n = Number(targetHandle.slice(IMAGE_INPUT_HANDLE_PREFIX.length))
    return Number.isFinite(n) ? n : -1
  }
  return -1
}

/** 收集时的端点过滤：不传=全部；'user'=默认 Prompt 端点（空 handle）；'system'=系统提示词端点。 */
type PromptHandle = 'user' | 'system'

/** 边的 targetHandle 是否命中所选输入端点。 */
function edgeMatchesHandle(
  targetHandle: string | null | undefined,
  handle: PromptHandle | undefined,
): boolean {
  if (!handle) return true // 未指定：所有指向本节点的连线（video/prompt 链）
  if (handle === 'system') return targetHandle === LLM_SYSTEM_HANDLE
  return !targetHandle // 'user'：仅默认 Prompt 端点（空 handle）；排除 system 与 image-* 端点
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
 * 按「图像输入端点编号」排序（image-0、image-1…），旧的空 handle 连线排最前（兼容）；
 * 同一端点内按连线顺序展平；为空的来源不贡献。video 输出不作为图像输入。
 */
export function collectUpstreamImages(project: Project, nodeId: string): string[] {
  const entries: { slot: number; order: number; url: string }[] = []
  project.edges.forEach((e, order) => {
    if (e.target !== nodeId) return
    const src = project.nodes.find((n) => n.id === e.source)
    const slot = imageInputSlot(e.targetHandle)
    if (src?.type === 'image') {
      for (const url of (src.data.result ?? []).filter(Boolean)) {
        entries.push({ slot, order, url })
      }
    } else if (src?.type === 'asset' && src.data.kind === 'image' && src.data.url) {
      entries.push({ slot, order, url: src.data.url })
    }
  })
  // 端点编号在前、同端点按连线顺序：稳定排序保证多图输入次序可控（图1、图2…）
  entries.sort((a, b) => a.slot - b.slot || a.order - b.order)
  return entries.map((e) => e.url)
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
