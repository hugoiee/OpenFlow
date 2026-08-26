// 端点/连线的「数据类型 → 颜色」单一来源，供节点端点(NodeHandle)与画布连线着色 + 连接校验共用。
// 约定：文本/Prompt 连接用粉色，图像连接用绿色，其余（音频/视频/未定义）用默认色。

import type { FlowNode } from './types'
import {
  AUDIO_INPUT_HANDLE_PREFIX,
  IMAGE_INPUT_HANDLE_PREFIX,
  RES_INPUT_HANDLE,
  STORYBOARD_ROLE_AUDIO_HANDLE_PREFIX,
  STORYBOARD_ROLE_IMAGE_HANDLE_PREFIX,
  STORYBOARD_SEGMENTS_HANDLE,
  VIDEO_INPUT_HANDLE_PREFIX,
} from './graph'

/** 已定义连接类型的颜色（端点与连线同色）。 */
export const HANDLE_COLORS = {
  /** 文本 / Prompt 连接。 */
  text: '#F1A0FA',
  /** 图像连接。 */
  image: '#6EDDB3',
  /** 音频连接。 */
  audio: '#8AB4F8',
  /** 视频连接。 */
  video: '#FB7185',
} as const

/** 端点色调：prompt/text=粉，image=绿，audio=蓝，video=玫红，default=不着色（用默认灰）。 */
export type HandleTone = 'prompt' | 'image' | 'audio' | 'video' | 'default'

/** 色调 → 具体颜色（default 返回 undefined，回退 CSS 默认）。 */
export function toneColor(tone: HandleTone): string | undefined {
  if (tone === 'prompt') return HANDLE_COLORS.text
  if (tone === 'image') return HANDLE_COLORS.image
  if (tone === 'audio') return HANDLE_COLORS.audio
  if (tone === 'video') return HANDLE_COLORS.video
  return undefined
}

/** 一个节点「输出」的数据种类（决定其输出端点与外连连线的颜色/可连性）。 */
export type SourceKind = 'text' | 'image' | 'audio' | 'video' | 'other'

export function sourceKind(node: FlowNode | undefined): SourceKind {
  if (!node) return 'other'
  if (node.type === 'prompt') return 'text'
  if (node.type === 'image') return 'image'
  if (node.type === 'angle') return 'image' // 多角度节点产出新视角图，输出作图像源
  if (node.type === 'video') return 'video' // Seedance 视频生成节点的输出作视频源
  if (node.type === 'splitter') return 'text' // 脚本切割节点的输出是切好段的脚本（文本粉）
  if (node.type === 'asset') {
    return node.data.kind === 'image' ? 'image' : node.data.kind === 'video' ? 'video' : 'audio'
  }
  return 'other' // group 等
}

/** 连线颜色 = 其源节点输出的数据类型色（文本粉 / 图像绿 / 音频蓝 / 视频玫红 / 其余默认）。 */
export function edgeColorForSource(node: FlowNode | undefined): string | undefined {
  const k = sourceKind(node)
  if (k === 'text') return HANDLE_COLORS.text
  if (k === 'image') return HANDLE_COLORS.image
  if (k === 'audio') return HANDLE_COLORS.audio
  if (k === 'video') return HANDLE_COLORS.video
  return undefined
}

/** 目标端点接受的数据种类（按 targetHandle + 目标节点类型判定）。null=不限（未定义）。 */
export function targetAccepts(
  targetNode: FlowNode | undefined,
  targetHandle: string | null | undefined,
): readonly SourceKind[] | null {
  if (targetHandle === RES_INPUT_HANDLE) {
    // 统一资源端点：视频节点图/音/视都收；图像/多角度节点只吃图（音/视频对生图无意义）；
    // 其余节点类型压根没有 res 端点 → 一律不收（批量连线按钮会拿 res 试连任意落点节点）
    if (targetNode?.type === 'video') return ['image', 'audio', 'video'] as const
    if (targetNode?.type === 'image' || targetNode?.type === 'angle') return ['image'] as const
    return [] as const
  }
  if (
    typeof targetHandle === 'string' &&
    targetHandle.startsWith(STORYBOARD_ROLE_IMAGE_HANDLE_PREFIX)
  ) {
    return ['image'] // 脚本分镜的角色参考图端点只接图像
  }
  if (
    typeof targetHandle === 'string' &&
    targetHandle.startsWith(STORYBOARD_ROLE_AUDIO_HANDLE_PREFIX)
  ) {
    return ['audio'] // 脚本分镜的角色音色参考端点只接音频
  }
  if (targetHandle === STORYBOARD_SEGMENTS_HANDLE) {
    return ['text'] // 分镜表端点：接脚本切割节点的输出（文本类）
  }
  if (typeof targetHandle === 'string' && targetHandle.startsWith(IMAGE_INPUT_HANDLE_PREFIX)) {
    return ['image'] // 图像输入端点只接图像
  }
  if (typeof targetHandle === 'string' && targetHandle.startsWith(AUDIO_INPUT_HANDLE_PREFIX)) {
    return ['audio'] // 音频输入端点只接音频
  }
  if (typeof targetHandle === 'string' && targetHandle.startsWith(VIDEO_INPUT_HANDLE_PREFIX)) {
    return ['video'] // 视频输入端点只接视频
  }
  // 默认（空 handle）端点：Prompt/图像/多角度/视频 节点的默认口都是 Prompt（只接文本）
  if (
    targetNode &&
    (targetNode.type === 'prompt' ||
      targetNode.type === 'image' ||
      targetNode.type === 'angle' ||
      targetNode.type === 'video')
  ) {
    return ['text']
  }
  return null
}

/**
 * 连接是否合法：图像端点只接图像源、文本端点(Prompt/System)只接文本源、
 * 统一资源端点按节点类型收图/音/视；未定义端点不限。找不到节点信息时放行（交由 React Flow 默认处理）。
 */
export function isValidTypedConnection(
  sourceNode: FlowNode | undefined,
  targetNode: FlowNode | undefined,
  targetHandle: string | null | undefined,
): boolean {
  const accepts = targetAccepts(targetNode, targetHandle)
  if (accepts === null) return true
  return accepts.includes(sourceKind(sourceNode))
}
