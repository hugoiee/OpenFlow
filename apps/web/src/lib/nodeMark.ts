// 节点颜色标记的元数据与配色（纯常量 + 纯函数，供节点卡片 / 头部色点 / 右键菜单共用）。
// 语义固定三档，不做自定义色板：标记是给人扫图用的，含义写死在 UI 上才不用靠记忆。

import { type FlowNodeType, type NodeMark } from './types'

/** 菜单与色点的排列顺序（可用 → 待定 → 废弃）。 */
export const NODE_MARK_ORDER: NodeMark[] = ['ok', 'todo', 'reject']

/**
 * 每档标记的展示元数据。配色照 ASSET_NODE_META 的写法给暗色主题换浅一档
 * （500 在深色底上偏闷，400 才跳得出来）。
 * - dot：头部色点 / 菜单前的小圆点的填充
 * - border：卡片描边色（Card 自带 1px border，这里只换颜色不改宽度，不会挪动内部布局）
 * - ring：未选中时叠一圈同色 ring 把描边视觉加粗（ring 是 box-shadow，不占布局）
 */
export const NODE_MARK_META: Record<
  NodeMark,
  { label: string; dot: string; border: string; ring: string }
> = {
  ok: {
    label: '可用',
    dot: 'bg-emerald-500 dark:bg-emerald-400',
    border: 'border-emerald-500 dark:border-emerald-400',
    ring: 'ring-emerald-500/60 dark:ring-emerald-400/60',
  },
  todo: {
    label: '待定',
    dot: 'bg-amber-500 dark:bg-amber-400',
    border: 'border-amber-500 dark:border-amber-400',
    ring: 'ring-amber-500/60 dark:ring-amber-400/60',
  },
  reject: {
    label: '废弃',
    dot: 'bg-rose-500 dark:bg-rose-400',
    border: 'border-rose-500 dark:border-rose-400',
    ring: 'ring-rose-500/60 dark:ring-rose-400/60',
  },
}

/**
 * 该类型的节点能否打标记：素材节点是纯上传源（内容就是本地那个文件，无所谓可用与否）故排除，
 * 其余全部可标记。group 容器不在 FlowNodeType 里（由 groupSelectedNodes 直接建），单独判。
 */
export function isMarkableType(type: string | undefined): boolean {
  return !!type && type !== 'asset'
}

/**
 * 节点卡片的描边 class：标记染 border 色，选中仍是 primary ring——两者走**不同图层**，
 * 所以「已标记 + 被选中」时两个信息能同时看见（选中一圈粗白/黑 ring，里面一圈标记色描边）。
 * 未选中且有标记时补一圈同色细 ring，让描边在缩小的画布上也扫得出来。
 */
export function markCardClass(mark: NodeMark | undefined, selected?: boolean): string {
  const meta = mark ? NODE_MARK_META[mark] : null
  const border = meta ? meta.border : ''
  const ring = selected ? 'ring-2 ring-primary' : meta ? `ring-1 ${meta.ring}` : ''
  return `${border} ${ring}`.trim()
}

/** 供 FlowCanvas 判定右键菜单里「标记颜色」是否可用（选中项里有非素材节点即可）。 */
export function hasMarkableNode(nodes: { type?: FlowNodeType | 'group' | string }[]): boolean {
  return nodes.some((n) => isMarkableType(n.type))
}
