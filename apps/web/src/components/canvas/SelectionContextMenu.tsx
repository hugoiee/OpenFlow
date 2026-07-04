import { useEffect, useRef } from 'react'
import { Group, LayoutGrid, Ungroup, type LucideIcon } from 'lucide-react'

/**
 * 选中节点的右键菜单：对当前选中的多个节点做「分组 / 整理」，或对选中的容器「取消分组」。
 * 由 FlowCanvas 在 onNodeContextMenu / onSelectionContextMenu 里按选中情况打开；
 * 定位（相对画布容器的 top/left）由父级算好。自带点击外部 / Esc 关闭。
 */
export function SelectionContextMenu({
  top,
  left,
  canGroup,
  canArrange,
  canUngroup,
  onGroup,
  onArrange,
  onUngroup,
  onClose,
}: {
  top: number
  left: number
  canGroup: boolean
  canArrange: boolean
  canUngroup: boolean
  onGroup: () => void
  onArrange: () => void
  onUngroup: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

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

  const items: { label: string; icon: LucideIcon; show: boolean; onClick: () => void }[] = [
    { label: '分组', icon: Group, show: canGroup, onClick: onGroup },
    { label: '整理（网格排列）', icon: LayoutGrid, show: canArrange, onClick: onArrange },
    { label: '取消分组', icon: Ungroup, show: canUngroup, onClick: onUngroup },
  ]

  return (
    <div
      ref={ref}
      style={{ top, left }}
      onContextMenu={(e) => e.preventDefault()}
      className="absolute z-30 min-w-40 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
    >
      {items
        .filter((it) => it.show)
        .map((it) => {
          const Icon = it.icon
          return (
            <button
              key={it.label}
              type="button"
              onClick={it.onClick}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Icon className="size-4 text-muted-foreground" />
              {it.label}
            </button>
          )
        })}
    </div>
  )
}
