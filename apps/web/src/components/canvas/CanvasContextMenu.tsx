import { useEffect, useRef } from 'react'
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
      style={{ top, left }}
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
