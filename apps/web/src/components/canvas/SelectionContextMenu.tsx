import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ChevronRight,
  Group,
  LayoutGrid,
  MoveHorizontal,
  Rows3,
  Ungroup,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import type { ArrangeOp } from '@/lib/arrange'

/**
 * 选中节点的右键菜单：分组 / 取消分组 + 各种排列（对齐、分布、整理、拉直连线）。
 * 由 FlowCanvas 在 onNodeContextMenu / onSelectionContextMenu 里按选中情况打开；
 * 定位（相对画布容器的 top/left）由父级算好。自带点击外部 / Esc 关闭。
 *
 * 二级菜单自绘（不用 Radix DropdownMenu：本仓库画布内的浮层一律自绘，见 MentionMenu 的坑），
 * 用 fixed 定位挂在行的右侧、右边放不下就翻到左侧。
 */

type MenuLeaf = { label: string; icon: LucideIcon; op: ArrangeOp }

const ALIGN_ITEMS: MenuLeaf[] = [
  { label: '左对齐', icon: AlignStartVertical, op: { kind: 'align', mode: 'left' } },
  {
    label: '水平居中',
    icon: AlignCenterVertical,
    op: { kind: 'align', mode: 'center-x' },
  },
  { label: '右对齐', icon: AlignEndVertical, op: { kind: 'align', mode: 'right' } },
  { label: '顶部对齐', icon: AlignStartHorizontal, op: { kind: 'align', mode: 'top' } },
  {
    label: '垂直居中',
    icon: AlignCenterHorizontal,
    op: { kind: 'align', mode: 'center-y' },
  },
  { label: '底部对齐', icon: AlignEndHorizontal, op: { kind: 'align', mode: 'bottom' } },
]

const DISTRIBUTE_ITEMS: MenuLeaf[] = [
  {
    label: '水平等距',
    icon: AlignHorizontalDistributeCenter,
    op: { kind: 'distribute', axis: 'x' },
  },
  {
    label: '垂直等距',
    icon: AlignVerticalDistributeCenter,
    op: { kind: 'distribute', axis: 'y' },
  },
]

const TIDY_ITEMS: MenuLeaf[] = [
  { label: '网格排列', icon: LayoutGrid, op: { kind: 'grid' } },
  { label: '紧凑排列', icon: Rows3, op: { kind: 'tidy' } },
  { label: '按连线布局', icon: Workflow, op: { kind: 'flow' } },
]

const SUB_WIDTH = 168
const ROW_HEIGHT = 32

/** 二级菜单的 fixed 定位：默认贴在行右侧，右边放不下就翻到左侧；纵向回夹进视口。 */
function placeSubmenu(anchor: DOMRect, itemCount: number) {
  const height = itemCount * ROW_HEIGHT + 8
  const fitsRight = anchor.right + SUB_WIDTH + 8 <= window.innerWidth
  return {
    left: fitsRight ? anchor.right + 2 : Math.max(8, anchor.left - SUB_WIDTH - 2),
    top: Math.max(8, Math.min(anchor.top - 4, window.innerHeight - height - 8)),
    width: SUB_WIDTH,
  }
}

function MenuRow({
  label,
  icon: Icon,
  hasSub,
  onClick,
  onHover,
}: {
  label: string
  icon: LucideIcon
  hasSub?: boolean
  /** 收到本行的屏幕矩形（带子菜单的行拿它定位子菜单，普通行忽略即可）。 */
  onClick?: (rect: DOMRect) => void
  onHover?: (rect: DOMRect | null) => void
}) {
  return (
    <button
      type="button"
      onClick={(e) => onClick?.(e.currentTarget.getBoundingClientRect())}
      onMouseEnter={(e) => onHover?.(e.currentTarget.getBoundingClientRect())}
      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex-1">{label}</span>
      {hasSub && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
    </button>
  )
}

export function SelectionContextMenu({
  top,
  left,
  canGroup,
  canArrange,
  canDistribute,
  canStraighten,
  canUngroup,
  onGroup,
  onArrange,
  onUngroup,
  onClose,
}: {
  top: number
  left: number
  canGroup: boolean
  /** ≥2 个可排列节点：对齐 / 整理都靠它 */
  canArrange: boolean
  /** ≥3 个才有可分的中间项 */
  canDistribute: boolean
  /** 选中项之间存在连线 */
  canStraighten: boolean
  canUngroup: boolean
  onGroup: () => void
  onArrange: (op: ArrangeOp) => void
  onUngroup: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [sub, setSub] = useState<{
    key: string
    items: MenuLeaf[]
    style: ReturnType<typeof placeSubmenu>
  } | null>(null)

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  // 悬停到带子菜单的行 → 开对应二级菜单；悬停到别的行 → 关掉（子菜单本身不 stop hover，故不会自关）。
  // 点击父行也走这里：菜单常常正好开在指针底下，此时不会有 mouseenter，只靠 hover 会像点不动。
  const openSub = useCallback(
    (key: string, items: MenuLeaf[]) => (rect: DOMRect | null) => {
      if (rect) setSub({ key, items, style: placeSubmenu(rect, items.length) })
    },
    [],
  )
  const closeSub = useCallback(() => setSub(null), [])

  const pick = (op: ArrangeOp) => {
    onArrange(op)
    setSub(null)
  }

  const groupSection = canGroup || canUngroup
  const arrangeSection = canArrange || canDistribute || canStraighten

  return (
    <div
      ref={ref}
      style={{ top, left }}
      onContextMenu={(e) => e.preventDefault()}
      className="absolute z-30 min-w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
    >
      {canGroup && (
        <MenuRow label="分组" icon={Group} onClick={onGroup} onHover={closeSub} />
      )}
      {canUngroup && (
        <MenuRow label="取消分组" icon={Ungroup} onClick={onUngroup} onHover={closeSub} />
      )}
      {groupSection && arrangeSection && <div className="my-1 h-px bg-border" />}
      {canArrange && (
        <MenuRow
          label="对齐"
          icon={AlignStartVertical}
          hasSub
          onClick={openSub('align', ALIGN_ITEMS)}
          onHover={openSub('align', ALIGN_ITEMS)}
        />
      )}
      {canDistribute && (
        <MenuRow
          label="分布"
          icon={AlignHorizontalDistributeCenter}
          hasSub
          onClick={openSub('distribute', DISTRIBUTE_ITEMS)}
          onHover={openSub('distribute', DISTRIBUTE_ITEMS)}
        />
      )}
      {canArrange && (
        <MenuRow
          label="整理"
          icon={LayoutGrid}
          hasSub
          onClick={openSub('tidy', TIDY_ITEMS)}
          onHover={openSub('tidy', TIDY_ITEMS)}
        />
      )}
      {canStraighten && (
        <MenuRow
          label="拉直连线"
          icon={MoveHorizontal}
          onClick={() => pick({ kind: 'straighten' })}
          onHover={closeSub}
        />
      )}

      {sub && (
        <div
          key={sub.key}
          style={{ position: 'fixed', ...sub.style }}
          className="z-40 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {sub.items.map((it) => (
            <MenuRow
              key={it.label}
              label={it.label}
              icon={it.icon}
              onClick={() => pick(it.op)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
