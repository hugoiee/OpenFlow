import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Check, CircleSlash } from 'lucide-react'
import { NODE_MARK_META, NODE_MARK_ORDER } from '@/lib/nodeMark'
import { placeFloating } from '@/lib/floating'
import { type NodeMark } from '@/lib/types'

const WIDTH = 132
const MAX_HEIGHT = 168

/**
 * 节点头部色点的选色浮层：可用 / 待定 / 废弃（+ 已有标记时多一项「清除标记」）。
 *
 * **自绘 + createPortal 到 body**，不用 Radix DropdownMenu，也不能直接画在节点卡片里 —— 两个坑：
 * ① Radix 菜单的 pointerdown 会被 React Flow 的节点拖拽吞掉，在节点内根本打不开（同 MentionMenu）；
 * ② 节点卡片是带 overflow-hidden 的 Card，且 React Flow 给每个节点 div 同时加 transform + z-index
 *    形成独立层叠上下文，浮层画在节点内既会被裁掉、z-50 也盖不住邻居节点。
 * portal 之后 React 合成事件仍沿 React 树冒泡回节点，故根元素要把 click / contextmenu 拦下来。
 */
export function NodeMarkPicker({
  anchor,
  value,
  onPick,
  onClose,
}: {
  /** 触发按钮的屏幕矩形（getBoundingClientRect），浮层据此定位。 */
  anchor: DOMRect
  value?: NodeMark
  /** null = 清除标记 */
  onPick: (mark: NodeMark | null) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      // stopPropagation：否则 Esc 会冒泡给 React Flow 取消节点选中
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const pos = placeFloating(anchor, { width: WIDTH, maxHeight: MAX_HEIGHT, side: 'bottom' })

  return createPortal(
    <div
      ref={ref}
      className="nodrag nowheel fixed z-50 overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: WIDTH, maxHeight: pos.maxHeight }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      {NODE_MARK_ORDER.map((mark) => (
        <button
          key={mark}
          type="button"
          onClick={() => onPick(mark)}
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <span className={`size-3 shrink-0 rounded-full ${NODE_MARK_META[mark].dot}`} />
          <span className="flex-1">{NODE_MARK_META[mark].label}</span>
          {value === mark && <Check className="size-3.5 shrink-0 text-muted-foreground" />}
        </button>
      ))}
      {value && (
        <>
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            onClick={() => onPick(null)}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <CircleSlash className="size-3 shrink-0 text-muted-foreground" />
            <span className="flex-1">清除标记</span>
          </button>
        </>
      )}
    </div>,
    document.body,
  )
}
