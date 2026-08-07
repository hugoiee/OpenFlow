// 节点布局的纯计算工具（不依赖 React / store）：分组包围盒、网格排列、子节点脱离父容器。
// 供「分组 / 整理 / 取消分组」store action 复用，逻辑可独立单测。

import { type FlowNode } from './types'

/** 分组容器四周留白（子节点包围盒外扩这么多像素，避免子节点贴着框边）。 */
export const GROUP_PADDING = 40

/** 网格排列时相邻单元的间距（像素）。 */
export const ARRANGE_GAP = 48

// React Flow 尚未测量到尺寸时，按类型给的兜底宽高（与各节点卡片实际尺寸大致对齐）。
const FALLBACK_SIZE: Record<string, { w: number; h: number }> = {
  prompt: { w: 264, h: 200 },
  image: { w: 288, h: 380 },
  video: { w: 288, h: 400 },
  asset: { w: 220, h: 220 },
  group: { w: 200, h: 200 },
}

/** 取节点渲染尺寸：优先 measured（React Flow 实测），其次显式 width/height，最后按类型兜底。 */
export function nodeSize(n: FlowNode): { w: number; h: number } {
  const fb = FALLBACK_SIZE[n.type ?? 'prompt'] ?? { w: 240, h: 200 }
  const w = n.measured?.width ?? (typeof n.width === 'number' ? n.width : undefined) ?? fb.w
  const h = n.measured?.height ?? (typeof n.height === 'number' ? n.height : undefined) ?? fb.h
  return { w, h }
}

/** 一组节点的绝对包围盒（position 为各自的绝对坐标；不含 padding）。 */
export function computeBoundingBox(nodes: FlowNode[]): {
  x: number
  y: number
  width: number
  height: number
} {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    const { w, h } = nodeSize(n)
    minX = Math.min(minX, n.position.x)
    minY = Math.min(minY, n.position.y)
    maxX = Math.max(maxX, n.position.x + w)
    maxY = Math.max(maxY, n.position.y + h)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * 把一组节点排成等间距的整齐网格：按当前位置（先上后左）排序后行优先填充，
 * 列数取 ceil(sqrt(n))，单元尺寸取组内最大宽/高 + 间距，起点为组的左上角。
 * 返回每个节点的新坐标（只算不改）。
 */
export function computeGridLayout(
  nodes: FlowNode[],
  gap = ARRANGE_GAP,
): { id: string; position: { x: number; y: number } }[] {
  if (nodes.length === 0) return []
  const originX = Math.min(...nodes.map((n) => n.position.x))
  const originY = Math.min(...nodes.map((n) => n.position.y))
  const sorted = [...nodes].sort(
    (a, b) => a.position.y - b.position.y || a.position.x - b.position.x,
  )
  const maxW = Math.max(...nodes.map((n) => nodeSize(n).w))
  const maxH = Math.max(...nodes.map((n) => nodeSize(n).h))
  const cols = Math.ceil(Math.sqrt(sorted.length))
  const cellW = maxW + gap
  const cellH = maxH + gap
  return sorted.map((n, i) => ({
    id: n.id,
    position: {
      x: originX + (i % cols) * cellW,
      y: originY + Math.floor(i / cols) * cellH,
    },
  }))
}

/**
 * 把属于 groupIds 里任一容器的子节点「脱离」出来：坐标由相对父容器转回绝对，清掉 parentId/extent。
 * 容器节点本身原样保留（调用方自行决定是否移除）。用于取消分组、以及删除容器前释放子节点。
 */
export function detachChildren(nodes: FlowNode[], groupIds: Set<string>): FlowNode[] {
  const groupPos = new Map<string, { x: number; y: number }>()
  for (const n of nodes) if (groupIds.has(n.id)) groupPos.set(n.id, n.position)
  return nodes.map((n) => {
    if (n.parentId && groupPos.has(n.parentId)) {
      const gp = groupPos.get(n.parentId)!
      // 去掉 parentId / extent，坐标转绝对
      const { parentId: _p, extent: _e, ...rest } = n
      void _p
      void _e
      return {
        ...rest,
        position: { x: n.position.x + gp.x, y: n.position.y + gp.y },
      } as FlowNode
    }
    return n
  })
}
