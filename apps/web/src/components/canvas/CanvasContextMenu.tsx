import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NODE_GROUPS, type NodeMenuItem } from '@/lib/nodeMenu'

/**
 * 画布右键菜单：在给定坐标（相对画布容器）浮出一份分组节点清单，点选即添加节点。
 * 自带关闭：点击菜单外部、按 Esc、选中项后由父级关闭。定位/落点由父级（FlowCanvas）负责。
 */
export function CanvasContextMenu({
  top,
  left,
  onPick,
  onClose,
}: {
  top: number
  left: number
  onPick: (item: NodeMenuItem) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  // 落点靠近画布右/下边缘时回夹：父级只按经验值预夹过一次，这里用**实测尺寸**再夹一次，
  // 免得菜单被裁掉一截（右键新建与「批量连线拖到空白处」都可能落在很靠下的位置）。
  const [pos, setPos] = useState({ top, left })
  useLayoutEffect(() => {
    const el = ref.current
    const parent = el?.offsetParent as HTMLElement | null
    if (!el || !parent) return setPos({ top, left })
    setPos({
      top: Math.max(4, Math.min(top, parent.clientHeight - el.offsetHeight - 4)),
      left: Math.max(4, Math.min(left, parent.clientWidth - el.offsetWidth - 4)),
    })
  }, [top, left])

  useEffect(() => {
    // 点击菜单外部或按 Esc 关闭（pointerdown 先于画布交互，避免误触）
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

  return (
    <div
      ref={ref}
      style={{ top: pos.top, left: pos.left }}
      onContextMenu={(e) => e.preventDefault()}
      className="absolute z-30 min-w-44 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
    >
      {NODE_GROUPS.map((group) => (
        <div key={group.label} className="py-0.5">
          <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
            {group.label}
          </div>
          {group.items.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => onPick(item)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Icon className="size-4 text-muted-foreground" />
                {item.label}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
