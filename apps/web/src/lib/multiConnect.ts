// 框选多个资源节点后「一并连线」：从选中集合里任一节点拖线到生成节点，
// 松手时把其余选中的合法资源节点也连到同一个目标端点。
// 纯函数（不碰 store / React Flow 实例），供 useFlowStore.onConnect 调用，也便于单独验证。

import type { Connection, Edge } from '@xyflow/react'
import { sourceKind, isValidTypedConnection } from './handleTypes'
import { newId } from './id'
import type { FlowNode } from './types'

/** 能作为下游输入的「资源」节点：图像/音频/视频素材 + 图像/视频生成节点（其结果作输入）。 */
function isResourceNode(node: FlowNode): boolean {
  const kind = sourceKind(node)
  return kind === 'image' || kind === 'audio' || kind === 'video'
}

/** 同源同目标同端点的连线是否已存在（避免重复连）。 */
function hasEdge(edges: Edge[], source: string, target: string, targetHandle: string | null): boolean {
  return edges.some(
    (e) => e.source === source && e.target === target && (e.targetHandle ?? null) === targetHandle,
  )
}

/**
 * 为一次新建立的连接，算出「其余被选中的资源节点」要补的连线。
 *
 * 仅当拖拽起点节点本身处于选中态时才生效（否则就是一次普通单连，返回空）。
 * 顺序按 nodes 数组序（= 节点创建顺序），因为没写 @ 时连线顺序就是实发 image_list 顺序。
 * 不合法的连接（如把音频连到只收图像的图像节点 res 端点）**静默跳过**，
 * 与 addConnectedNode「类型不匹配则只建节点不连线」的既有做法一致。
 */
export function collectMultiConnectEdges(
  nodes: FlowNode[],
  edges: Edge[],
  connection: Connection,
): Edge[] {
  const { source, target } = connection
  const targetHandle = connection.targetHandle ?? null
  if (!source || !target) return []
  const sourceNode = nodes.find((n) => n.id === source)
  // 起点未被选中 → 用户只是单连一根线，不做批量
  if (!sourceNode?.selected) return []
  const targetNode = nodes.find((n) => n.id === target)
  if (!targetNode) return []

  const extra: Edge[] = []
  for (const node of nodes) {
    if (!node.selected) continue
    if (node.id === source || node.id === target) continue // 起点由 addEdge 负责；目标不连自己
    if (!isResourceNode(node)) continue
    if (!isValidTypedConnection(node, targetNode, targetHandle)) continue
    if (hasEdge(edges, node.id, target, targetHandle)) continue
    extra.push({
      id: newId('e_'),
      source: node.id,
      target,
      targetHandle: targetHandle ?? undefined,
      type: 'default',
    })
  }
  return extra
}
