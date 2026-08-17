// 节点排列的纯计算（不依赖 React / store / React Flow 运行时）：对齐、分布、紧凑排列、
// 按连线布局、拉直连线。与 layout.ts 的分工：layout.ts 管「分组容器 / 网格」这类结构性计算，
// 本文件管「把选中的一堆节点摆整齐」的各种排法。全部只算不改，统一返回新坐标列表。
//
// 语义口径对齐业界（Figma / Miro / UE Blueprint）：
//   对齐 = 只改一个轴，锚点是选区包围盒（不是「最后选中项」）；
//   分布 = 保留首尾位置，把**间隙**均分（不是中心点等距）；
//   紧凑排列 = 先按当前位置聚成行，再用固定间距重排（每次结果一致，不像分布依赖当前散布）。

import { type Edge } from '@xyflow/react'
import { ARRANGE_GAP, computeBoundingBox, nodeSize } from './layout'
import { type FlowNode } from './types'

/** 排列结果：只给新坐标，调用方自行写回。与 computeGridLayout 的返回形状保持一致。 */
export type NodeLayout = { id: string; position: { x: number; y: number } }

/** 六向对齐。center-x = 水平居中（对齐竖直中线），center-y = 垂直居中（对齐水平中线）。 */
export type AlignMode = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom'

/** 分布轴向：x = 水平等距，y = 垂直等距。 */
export type DistributeAxis = 'x' | 'y'

/** 一次排列操作（右键菜单项 ↔ store action 的共用载荷）。 */
export type ArrangeOp =
  | { kind: 'align'; mode: AlignMode }
  | { kind: 'distribute'; axis: DistributeAxis }
  | { kind: 'grid' }
  | { kind: 'tidy' }
  | { kind: 'flow' }
  | { kind: 'straighten' }

/**
 * 端点竖向偏移解析器：给出某节点上某个端点的中心相对节点顶部的 y 偏移（像素）。
 * 由调用方从 React Flow 的 handleBounds 组装（本文件不碰 RF 运行时）；解析不到时应回退节点竖向中心。
 */
export type HandleOffsetResolver = (
  nodeId: string,
  handleId: string | null | undefined,
  type: 'source' | 'target',
) => number

/** 坐标一律取整：避免反复排列后积累出 0.5px 的抖动，也让存库的 JSON 干净。 */
const r = Math.round

/**
 * 六向对齐：锚点为这组节点的包围盒，只改被对齐的那个轴，另一轴原样保留。
 * 少于 2 个节点无意义，返回空。
 */
export function alignNodes(nodes: FlowNode[], mode: AlignMode): NodeLayout[] {
  if (nodes.length < 2) return []
  const box = computeBoundingBox(nodes)
  return nodes.map((n) => {
    const { w, h } = nodeSize(n)
    const { x, y } = n.position
    switch (mode) {
      case 'left':
        return { id: n.id, position: { x: r(box.x), y } }
      case 'center-x':
        return { id: n.id, position: { x: r(box.x + (box.width - w) / 2), y } }
      case 'right':
        return { id: n.id, position: { x: r(box.x + box.width - w), y } }
      case 'top':
        return { id: n.id, position: { x, y: r(box.y) } }
      case 'center-y':
        return { id: n.id, position: { x, y: r(box.y + (box.height - h) / 2) } }
      case 'bottom':
        return { id: n.id, position: { x, y: r(box.y + box.height - h) } }
    }
  })
}

/**
 * 等距分布：按轴向排序后固定首尾，把剩余空隙平均分给相邻**间隙**（节点宽高不同时视觉上比
 * 「中心点等距」整齐）。少于 3 个没有可分的中间项，返回空。
 * 节点挤不下时 gap 会算成负数——照旧执行（等同于均匀重叠），不做特殊处理。
 */
export function distributeNodes(nodes: FlowNode[], axis: DistributeAxis): NodeLayout[] {
  if (nodes.length < 3) return []
  const sizeOf = (n: FlowNode) => (axis === 'x' ? nodeSize(n).w : nodeSize(n).h)
  const posOf = (n: FlowNode) => (axis === 'x' ? n.position.x : n.position.y)
  const sorted = [...nodes].sort((a, b) => posOf(a) - posOf(b))
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const start = posOf(first)
  const span = posOf(last) + sizeOf(last) - start
  const totalSize = sorted.reduce((s, n) => s + sizeOf(n), 0)
  const gap = (span - totalSize) / (sorted.length - 1)
  let cursor = start
  return sorted.map((n) => {
    const position =
      axis === 'x' ? { x: r(cursor), y: n.position.y } : { x: n.position.x, y: r(cursor) }
    cursor += sizeOf(n) + gap
    return { id: n.id, position }
  })
}

/**
 * 紧凑排列（Tidy up）：先按当前位置把节点聚成「行」（竖向有重叠的算同一行），
 * 再从选区左上角起用固定间距重排——行内左对齐顶端、行与行按该行最高的节点让位。
 * 与网格排列的区别：保留用户原本的行列结构（一行三个就还是一行三个），只把间距抹匀。
 */
export function tidyUpLayout(nodes: FlowNode[], gap = ARRANGE_GAP): NodeLayout[] {
  if (nodes.length < 2) return []
  const items = nodes.map((n) => ({ n, ...nodeSize(n) }))
  const sorted = [...items].sort(
    (a, b) => a.n.position.y - b.n.position.y || a.n.position.x - b.n.position.x,
  )
  // 行聚类：与本行**首个（最靠上）**节点竖向有重叠才算同一行。
  // ⚠️ 别改成「与行内最高的节点比」——那样一个高节点会把它下面本该另起一行的节点链式吞进来，
  // 两列错落的图会被压成一行。
  const rows: (typeof sorted)[] = []
  let rowBottom = -Infinity
  for (const it of sorted) {
    const top = it.n.position.y
    if (rows.length === 0 || top >= rowBottom) {
      rows.push([it])
      rowBottom = top + it.h
    } else {
      rows[rows.length - 1].push(it)
    }
  }
  const originX = Math.min(...items.map((i) => i.n.position.x))
  const originY = Math.min(...items.map((i) => i.n.position.y))
  const out: NodeLayout[] = []
  let y = originY
  for (const row of rows) {
    row.sort((a, b) => a.n.position.x - b.n.position.x)
    let x = originX
    for (const it of row) {
      out.push({ id: it.n.id, position: { x: r(x), y: r(y) } })
      x += it.w + gap
    }
    y += Math.max(...row.map((i) => i.h)) + gap
  }
  return out
}

/**
 * 按连线布局（水平流）：把这组节点按连线拓扑分层，同层竖排、层与层从左往右等距摆开——
 * 契合本项目「左入右出」的数据流向（Prompt → 图像 / 视频）。
 * 层号取最长路径（无入边=0，其余 = max(上游层)+1，迭代松弛；有环时循环内的节点保持初值不发散）。
 * 只认「两端都在这组节点里」的连线；孤立节点没有入边故落在第 0 层。
 */
export function flowLayout(
  nodes: FlowNode[],
  edges: Edge[],
  gapX = ARRANGE_GAP,
  gapY = ARRANGE_GAP,
): NodeLayout[] {
  if (nodes.length < 2) return []
  const ids = new Set(nodes.map((n) => n.id))
  const inner = edges.filter(
    (e) => e.source !== e.target && ids.has(e.source) && ids.has(e.target),
  )
  const layer = new Map(nodes.map((n) => [n.id, 0]))
  for (let i = 0; i < nodes.length; i++) {
    let changed = false
    for (const e of inner) {
      const want = layer.get(e.source)! + 1
      if (want > layer.get(e.target)!) {
        layer.set(e.target, want)
        changed = true
      }
    }
    if (!changed) break
  }
  // 按层分列，列内保持原本的上下相对次序（不做重排，免得用户认不出自己的图）
  const cols = new Map<number, FlowNode[]>()
  for (const n of nodes) {
    const l = layer.get(n.id)!
    const col = cols.get(l)
    if (col) col.push(n)
    else cols.set(l, [n])
  }
  const originX = Math.min(...nodes.map((n) => n.position.x))
  const originY = Math.min(...nodes.map((n) => n.position.y))
  const levels = [...cols.keys()].sort((a, b) => a - b)
  const measured = levels.map((l) => {
    const col = [...cols.get(l)!].sort((a, b) => a.position.y - b.position.y)
    const sizes = col.map((n) => nodeSize(n))
    return {
      col,
      sizes,
      width: Math.max(...sizes.map((s) => s.w)),
      height: sizes.reduce((s, z) => s + z.h, 0) + gapY * (col.length - 1),
    }
  })
  const maxHeight = Math.max(...measured.map((m) => m.height))
  const out: NodeLayout[] = []
  let x = originX
  for (const m of measured) {
    // 每列整体竖向居中，图看起来才是「一条流」而不是全部顶端对齐的阶梯
    let y = originY + (maxHeight - m.height) / 2
    m.col.forEach((n, i) => {
      out.push({ id: n.id, position: { x: r(x), y: r(y) } })
      y += m.sizes[i].h + gapY
    })
    x += m.width + gapX
  }
  return out
}

/**
 * 拉直连线：沿连线把下游节点竖向挪到与上游端点同一水平线上（连线就成了直线），x 不动。
 * 一个节点只认它的**第一条**入边（多入边时互相打架，取先出现的那条为准，同 UE Blueprint 的做法）；
 * 从无入边的根节点出发逐级下推，已定位过的节点不再被第二次挪动；环内节点（无根可达）保持原样。
 * 端点偏移由 offsetOf 提供（本项目端点是竖向槽位排布，不能直接对齐节点顶边或中心）。
 */
export function straightenLayout(
  nodes: FlowNode[],
  edges: Edge[],
  offsetOf: HandleOffsetResolver,
): NodeLayout[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const inner = edges.filter(
    (e) => e.source !== e.target && byId.has(e.source) && byId.has(e.target),
  )
  if (inner.length === 0) return []
  const incoming = new Map<string, Edge>()
  for (const e of inner) if (!incoming.has(e.target)) incoming.set(e.target, e)
  const outgoing = new Map<string, Edge[]>()
  for (const e of incoming.values()) {
    const list = outgoing.get(e.source)
    if (list) list.push(e)
    else outgoing.set(e.source, [e])
  }
  const y = new Map(nodes.map((n) => [n.id, n.position.y]))
  const queue = nodes.filter((n) => !incoming.has(n.id)).map((n) => n.id)
  const seen = new Set(queue)
  while (queue.length) {
    const id = queue.shift()!
    for (const e of outgoing.get(id) ?? []) {
      if (seen.has(e.target)) continue
      seen.add(e.target)
      const anchor = y.get(e.source)! + offsetOf(e.source, e.sourceHandle, 'source')
      y.set(e.target, r(anchor - offsetOf(e.target, e.targetHandle, 'target')))
      queue.push(e.target)
    }
  }
  return nodes
    .filter((n) => y.get(n.id) !== n.position.y)
    .map((n) => ({ id: n.id, position: { x: n.position.x, y: y.get(n.id)! } }))
}
