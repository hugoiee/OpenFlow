// 画布连线（上游 → 下游）的数据采集工具。
// 下游 image/video 生成节点运行时，从指向自己的连线收集上游产物：
//   - 上游 prompt 节点 → 文本指令
//   - 上游 image 节点 / 图像素材节点 → 结果图（作为下游的输入图）
//   - 上游 音频素材节点 → 音频 URL（作为视频节点的 audio_list）

import type { Edge } from '@xyflow/react'
import { sanitizeMentionName, uniqueMentionName } from './mentions'
import { VIDEO_VARIANT_DEFAULT } from './nodeCatalog'
import { type FlowNode, type MentionKind, type Project, type PromptMentionRef } from './types'

/** 图像输入端点 handle id 前缀：第 i 个图像端点为 `image-${i}`（i 从 0 起，展示编号 i+1）。 */
export const IMAGE_INPUT_HANDLE_PREFIX = 'image-'
export function imageInputHandleId(index: number): string {
  return `${IMAGE_INPUT_HANDLE_PREFIX}${index}`
}

/** 音频输入端点 handle id 前缀：第 i 个音频端点为 `audio-${i}`（旧数据用，现连线一律归并到 res）。 */
export const AUDIO_INPUT_HANDLE_PREFIX = 'audio-'
export function audioInputHandleId(index: number): string {
  return `${AUDIO_INPUT_HANDLE_PREFIX}${index}`
}

/** 视频输入端点 handle id 前缀：第 i 个视频端点为 `video-${i}`（旧数据用，现连线一律归并到 res）。 */
export const VIDEO_INPUT_HANDLE_PREFIX = 'video-'
export function videoInputHandleId(index: number): string {
  return `${VIDEO_INPUT_HANDLE_PREFIX}${index}`
}

/**
 * 图像/视频生成节点的**统一资源输入端点** handle id：图/音/视素材与上游生成结果都连这一个口，
 * 具体用哪个资源由上游 Prompt 里的 @ 引用指定（无 @ 时全发）。旧编号端点（image-N/audio-N/video-N）
 * 连线在载入时经 normalizeResourceEdges 归并到此端点；视频首尾帧变体仍用
 * image-0/image-1 作 First/Last 专用端点。
 */
export const RES_INPUT_HANDLE = 'res'

/**
 * 脚本分镜节点的角色参考图端点 handle id 前缀：角色 i 的端点为 `role-image-${i}`（0=角色A / 1=角色B）。
 * 刻意不用 image-N 旧编号前缀——虽然 normalizeResourceEdges 只归并 image/video 目标节点的边，
 * 专用前缀让「分镜节点的角色图」与生成节点端点体系彻底隔离，不共享任何采集/归并语义。
 */
export const STORYBOARD_ROLE_IMAGE_HANDLE_PREFIX = 'role-image-'
export function storyboardRoleImageHandleId(roleIndex: number): string {
  return `${STORYBOARD_ROLE_IMAGE_HANDLE_PREFIX}${roleIndex}`
}

/** 脚本分镜节点的角色音色参考端点 handle id 前缀：角色 i 的端点为 `role-audio-${i}`（语义同 role-image-）。 */
export const STORYBOARD_ROLE_AUDIO_HANDLE_PREFIX = 'role-audio-'
export function storyboardRoleAudioHandleId(roleIndex: number): string {
  return `${STORYBOARD_ROLE_AUDIO_HANDLE_PREFIX}${roleIndex}`
}

/** 脚本分镜节点的「分镜表」输入端点：脚本切割节点的输出连到这里（连线本身是组织性的，数据由切割动作直接写入）。 */
export const STORYBOARD_SEGMENTS_HANDLE = 'segments'

/** 节点图像输入端点数量（含旧数据兜底）：至少 1。 */
export function imageInputCount(imageInputs: number | undefined): number {
  return Math.max(1, imageInputs ?? 1)
}

/** 节点音频输入端点数量（含旧数据兜底）：至少 1。 */
export function audioInputCount(audioInputs: number | undefined): number {
  return Math.max(1, audioInputs ?? 1)
}

/** 节点视频输入端点数量（含旧数据兜底）：默认 0（无旧数据可推断，纯新增能力）。 */
export function videoInputCount(videoInputs: number | undefined): number {
  return Math.max(0, videoInputs ?? 0)
}

/** 从 targetHandle 解析编号端点排序键：`${prefix}N`→N；其余（含旧的空 handle）→ -1（排最前，兼容旧连线）。 */
function handleSlot(targetHandle: string | null | undefined, prefix: string): number {
  if (typeof targetHandle === 'string' && targetHandle.startsWith(prefix)) {
    const n = Number(targetHandle.slice(prefix.length))
    return Number.isFinite(n) ? n : -1
  }
  return -1
}

/** 收集时的端点过滤：不传=全部（prompt 链）；'user'=只认默认 Prompt 端点（空 handle），排除 res 等资源端点。 */
type PromptHandle = 'user'

/** 边的 targetHandle 是否命中所选输入端点。 */
function edgeMatchesHandle(
  targetHandle: string | null | undefined,
  handle: PromptHandle | undefined,
): boolean {
  if (!handle) return true // 未指定：所有指向本节点的连线（video/prompt 链）
  return !targetHandle // 'user'：仅默认 Prompt 端点（空 handle）；排除 res 等资源端点
}

/**
 * 收集所有指向 nodeId 的上游文本，拼成生成指令。
 * 来源：上游 prompt 节点的文本。prompt 节点有左侧输入：会**递归**并入它自己的上游文本
 * （上游在前、本节点文本在后），从而支持「Prompt → Prompt → 图像」这类链式拼接。
 * visited 做环路防护（同一节点只计一次）。
 *
 * opts.handle：图像/视频节点传 'user'，只认默认 Prompt 端点、排除资源端点 res；
 * prompt 链递归时不传，收全部上游（prompt 只有单一输入）。
 */
export function collectUpstreamPrompt(
  project: Project,
  nodeId: string,
  opts: { handle?: PromptHandle; visited?: Set<string>; mentionsOut?: PromptMentionRef[] } = {},
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
    .filter((n) => n.type === 'prompt' && sourceIds.has(n.id))
    .map((n) => {
      if (n.type === 'prompt') {
        // 沿途收集各 prompt 节点的 @ 引用映射（供下游 build 时替换占位符）
        opts.mentionsOut?.push(...(n.data.mentions ?? []))
        // 本 prompt 节点的上游文本（递归、不再区分端点）在前，自身文本在后
        const upstream = collectUpstreamPrompt(project, n.id, { visited, mentionsOut: opts.mentionsOut })
        return [upstream, n.data.text].filter(Boolean).join('\n\n')
      }
      return ''
    })
    .filter(Boolean)
    .join('\n\n')
}

/**
 * 带来源身份的上游资源引用：url 之外保留源节点 id/label/文件名与生成结果序号，
 * 供 Prompt 节点的 @ 引用（候选展示 + 构建期占位符替换）使用。
 * resultIndex 是生成节点 result[] 的原始下标（含空串占位，保证「第 N 张」语义稳定）。
 */
export type UpstreamRef = {
  url: string
  nodeId: string
  kind: MentionKind
  resultIndex?: number
  label: string
  fileName?: string
  /** 连线的原始 targetHandle（视频首尾帧变体据此区分 First/Last 专用端点与统一资源端点）。 */
  handle?: string | null
}

/**
 * 收集所有指向 nodeId 的上游图像引用（作为下游输入图）。
 * 来源：上游 image / angle（多角度）生成节点的结果图 + 上游图像素材节点的 URL。
 * 按「图像输入端点编号」排序（image-0、image-1…），旧的空 handle 连线排最前（兼容）；
 * 同一端点内按连线顺序展平；为空的来源不贡献。video 输出不作为图像输入。
 */
export function collectUpstreamImageRefs(project: Project, nodeId: string): UpstreamRef[] {
  const entries: { slot: number; order: number; ref: UpstreamRef }[] = []
  project.edges.forEach((e, order) => {
    if (e.target !== nodeId) return
    const src = project.nodes.find((n) => n.id === e.source)
    const slot = handleSlot(e.targetHandle, IMAGE_INPUT_HANDLE_PREFIX)
    if (src?.type === 'image' || src?.type === 'angle') {
      ;(src.data.result ?? []).forEach((url, i) => {
        if (!url) return // 跳过空串但保留原始下标，"结果N" 序号不漂移
        entries.push({
          slot,
          order,
          ref: { url, nodeId: src.id, kind: 'image', resultIndex: i, label: src.data.label, handle: e.targetHandle },
        })
      })
    } else if (src?.type === 'asset' && src.data.kind === 'image' && src.data.url) {
      entries.push({
        slot,
        order,
        ref: {
          url: src.data.url,
          nodeId: src.id,
          kind: 'image',
          label: src.data.label,
          fileName: src.data.fileName,
          handle: e.targetHandle,
        },
      })
    }
  })
  // 端点编号在前、同端点按连线顺序：稳定排序保证多图输入次序可控（图1、图2…）
  entries.sort((a, b) => a.slot - b.slot || a.order - b.order)
  return entries.map((e) => e.ref)
}

/**
 * 收集所有指向 nodeId 的上游音频素材引用（作为视频节点的 audio_list）。
 * 按「音频输入端点编号」排序（audio-0、audio-1…），旧的空 handle 连线排最前（兼容）；
 * 同端点内按连线顺序展平；URL 为空的素材不贡献。
 */
export function collectUpstreamAudioRefs(project: Project, nodeId: string): UpstreamRef[] {
  const entries: { slot: number; order: number; ref: UpstreamRef }[] = []
  project.edges.forEach((e, order) => {
    if (e.target !== nodeId) return
    const src = project.nodes.find((n) => n.id === e.source)
    if (src?.type === 'asset' && src.data.kind === 'audio' && src.data.url) {
      entries.push({
        slot: handleSlot(e.targetHandle, AUDIO_INPUT_HANDLE_PREFIX),
        order,
        ref: {
          url: src.data.url,
          nodeId: src.id,
          kind: 'audio',
          label: src.data.label,
          fileName: src.data.fileName,
          handle: e.targetHandle,
        },
      })
    }
  })
  entries.sort((a, b) => a.slot - b.slot || a.order - b.order)
  return entries.map((e) => e.ref)
}

/**
 * 收集所有指向 nodeId 的上游视频引用（作为 Seedance 参考视频）。
 * 来源：上游 video 生成节点(Seedance)的结果视频 + 上游视频素材节点的 URL。
 * 按「视频输入端点编号」排序（video-0、video-1…），同端点内按连线顺序展平；URL 为空的来源不贡献。
 */
export function collectUpstreamVideoRefs(project: Project, nodeId: string): UpstreamRef[] {
  const entries: { slot: number; order: number; ref: UpstreamRef }[] = []
  project.edges.forEach((e, order) => {
    if (e.target !== nodeId) return
    const src = project.nodes.find((n) => n.id === e.source)
    const slot = handleSlot(e.targetHandle, VIDEO_INPUT_HANDLE_PREFIX)
    if (src?.type === 'video') {
      ;(src.data.result ?? []).forEach((url, i) => {
        if (!url) return
        entries.push({
          slot,
          order,
          ref: { url, nodeId: src.id, kind: 'video', resultIndex: i, label: src.data.label, handle: e.targetHandle },
        })
      })
    } else if (src?.type === 'asset' && src.data.kind === 'video' && src.data.url) {
      entries.push({
        slot,
        order,
        ref: {
          url: src.data.url,
          nodeId: src.id,
          kind: 'video',
          label: src.data.label,
          fileName: src.data.fileName,
          handle: e.targetHandle,
        },
      })
    }
  })
  entries.sort((a, b) => a.slot - b.slot || a.order - b.order)
  return entries.map((e) => e.ref)
}

/**
 * 把旧「编号端点」（image-N/audio-N/video-N 及更早的空 handle）连线归并到统一资源端点 res：
 * 仅处理目标为图像/视频生成节点、源为资源节点（asset/image/video）的连线；
 * 视频首尾帧变体的 image-0/image-1（First/Last 专用端点）保留不动。
 * 归并时按同目标同资源类型的旧排序键（端点编号在前、连线顺序在后）重排该子组，
 * 保证归并后「按连线顺序采集」与旧「按端点编号采集」次序一致。无需归并时原样返回。
 */
export function normalizeResourceEdges(nodes: FlowNode[], edges: Edge[]): Edge[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const kindPrefix: Record<MentionKind, string> = {
    image: IMAGE_INPUT_HANDLE_PREFIX,
    audio: AUDIO_INPUT_HANDLE_PREFIX,
    video: VIDEO_INPUT_HANDLE_PREFIX,
  }
  const next = edges.slice()
  let changed = false
  // 按「目标节点 × 资源类型」分组待归并连线的下标（保持出现顺序）
  const groups = new Map<string, { kind: MentionKind; indices: number[] }>()
  next.forEach((e, i) => {
    const target = byId.get(e.target)
    if (target?.type !== 'image' && target?.type !== 'video') return
    const src = byId.get(e.source)
    let kind: MentionKind
    if (src?.type === 'asset') kind = src.data.kind
    else if (src?.type === 'image') kind = 'image'
    else if (src?.type === 'video') kind = 'video'
    else return // prompt 等文本源：不是资源连线
    if (e.targetHandle === RES_INPUT_HANDLE) return // 已是统一端点
    if (target.type === 'video' && kind === 'image') {
      const variant =
        target.data.videoVariant ?? (target.data.videoTask === 'reference' ? 'reference' : VIDEO_VARIANT_DEFAULT)
      if (
        variant !== 'reference' &&
        (e.targetHandle === imageInputHandleId(0) || e.targetHandle === imageInputHandleId(1))
      ) {
        return // 首尾帧变体的 First/Last 专用端点保留
      }
    }
    const key = `${e.target}#${kind}`
    const group = groups.get(key)
    if (group) group.indices.push(i)
    else groups.set(key, { kind, indices: [i] })
  })
  for (const { kind, indices } of groups.values()) {
    const prefix = kindPrefix[kind]
    // 旧采集排序键（slot 在前、连线顺序在后）重排子组，写回原下标位（indices 本身升序）
    const sorted = indices
      .map((i) => next[i])
      .sort((a, b) => handleSlot(a.targetHandle, prefix) - handleSlot(b.targetHandle, prefix))
    sorted.forEach((e, j) => {
      next[indices[j]] = { ...e, targetHandle: RES_INPUT_HANDLE }
    })
    changed = true
  }
  return changed ? next : edges
}

/** Prompt 节点 @ 菜单的一个候选项：身份 + 消歧后的显示名 + 预览 URL。 */
export type MentionCandidate = {
  /** 去重键：`${nodeId}#${kind}#${resultIndex ?? -1}`。 */
  key: string
  nodeId: string
  kind: MentionKind
  resultIndex?: number
  /** 消歧后的显示名（即插入 token 的方括号内文字）。 */
  name: string
  /** 资源 URL（菜单缩略图/预览用）。 */
  url: string
}

/** 悬停预览用的资源快照（按身份直查，不含图遍历信息）。 */
export type MentionResource = {
  url: string
  kind: MentionKind
  /** 源节点标题。 */
  label: string
  /** 素材节点的原始文件名。 */
  fileName?: string
  /** 生成节点的结果序号。 */
  resultIndex?: number
}

/**
 * 按 @ 引用身份（nodeId + kind + resultIndex）直接查源节点拿资源，供 tag 悬停预览。
 * 刻意**不复用 collectMentionCandidates**：那是「沿下游走一遍图 + 对每个下游节点重算三类上游
 * 引用」的 O(E·N) 采集，挂在 mousemove 路径上太贵；这里一次 nodes.find 即可。
 * 副作用：断线/被筛掉的悬空引用也能预览到资源本体——「我 @ 的是哪个资源」的答案不该受连线状态
 * 影响，是否真的下发由 collectMentionedRefs 决定（职责分离）。源节点已删/结果已清空则返回 null。
 */
export function findMentionResource(
  project: Project,
  ref: PromptMentionRef,
): MentionResource | null {
  const node = project.nodes.find((n) => n.id === ref.nodeId)
  if (!node) return null
  if (node.type === 'asset') {
    if (node.data.kind !== ref.kind || !node.data.url) return null
    return {
      url: node.data.url,
      kind: ref.kind,
      label: node.data.label,
      fileName: node.data.fileName,
    }
  }
  if (
    ((node.type === 'image' || node.type === 'angle') && ref.kind === 'image') ||
    (node.type === 'video' && ref.kind === 'video')
  ) {
    const url = (node.data.result ?? [])[ref.resultIndex ?? 0]
    if (!url) return null
    return { url, kind: ref.kind, label: node.data.label, resultIndex: ref.resultIndex }
  }
  return null
}

/** 候选显示名基础值：素材节点用文件名，生成节点结果用「label·结果N」。 */
function mentionBaseName(ref: UpstreamRef): string {
  if (ref.resultIndex !== undefined) return `${ref.label}·结果${ref.resultIndex + 1}`
  return ref.fileName || ref.label
}

/**
 * 从 promptNodeId 出发沿下游收集可 @ 的资源候选：
 * 沿 source === 当前节点 的边找下游；下游是 prompt → 递归（prompt 链，visited 防环）；
 * 下游是 image / angle（多角度）生成节点 → 并入其上游图像引用；下游是 video 生成节点 →
 * 并入其图/音/视三类引用；podcast 等其他类型跳过（@ 仅对图像/多角度/视频生成请求生效）。
 * 多下游取并集（按身份键去重）；不含手填 imagesText/audiosText（无节点身份可引用）。
 */
export function collectMentionCandidates(project: Project, promptNodeId: string): MentionCandidate[] {
  const visited = new Set<string>()
  const byKey = new Map<string, UpstreamRef>()
  const addRefs = (refs: UpstreamRef[]) => {
    for (const ref of refs) {
      const key = `${ref.nodeId}#${ref.kind}#${ref.resultIndex ?? -1}`
      if (!byKey.has(key)) byKey.set(key, ref)
    }
  }
  const walk = (id: string) => {
    if (visited.has(id)) return
    visited.add(id)
    for (const e of project.edges) {
      if (e.source !== id) continue
      const target = project.nodes.find((n) => n.id === e.target)
      if (target?.type === 'prompt') {
        walk(target.id)
      } else if (target?.type === 'image' || target?.type === 'angle') {
        addRefs(collectUpstreamImageRefs(project, target.id))
      } else if (target?.type === 'video') {
        addRefs(collectUpstreamImageRefs(project, target.id))
        addRefs(collectUpstreamAudioRefs(project, target.id))
        addRefs(collectUpstreamVideoRefs(project, target.id))
      }
    }
  }
  walk(promptNodeId)
  // 同名候选追加 " (2)"、" (3)" 消歧，保证一个候选列表内显示名唯一
  const taken = new Set<string>()
  const candidates: MentionCandidate[] = []
  for (const [key, ref] of byKey) {
    const name = uniqueMentionName(sanitizeMentionName(mentionBaseName(ref)), taken)
    taken.add(name)
    candidates.push({ key, nodeId: ref.nodeId, kind: ref.kind, resultIndex: ref.resultIndex, name, url: ref.url })
  }
  return candidates
}
