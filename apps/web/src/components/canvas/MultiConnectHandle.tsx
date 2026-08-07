import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useViewport } from '@xyflow/react'
import { Link2 } from 'lucide-react'
import { RES_INPUT_HANDLE } from '@/lib/graph'
import { sourceKind, toneColor, type HandleTone } from '@/lib/handleTypes'
import { computeBoundingBox } from '@/lib/layout'
import { selectedResourceNodes } from '@/lib/multiConnect'
import type { FlowNode } from '@/lib/types'
import { useActiveProject, useFlowStore } from '@/store/useFlowStore'

/** 松手落点解析出的目标：连到已有节点的某端点，或落在空白处（交给调用方弹建节点菜单）。 */
type DropTarget =
  | { kind: 'node'; nodeId: string; handleId: string | null }
  | { kind: 'pane' }

/** 子节点的 position 是相对父容器的，算包围盒前先转成绝对坐标（分组不嵌套，父级只需查一层）。 */
function toAbsolute(nodes: FlowNode[], all: FlowNode[]): FlowNode[] {
  return nodes.map((n) => {
    if (!n.parentId) return n
    const parent = all.find((p) => p.id === n.parentId)
    if (!parent) return n
    return {
      ...n,
      position: { x: n.position.x + parent.position.x, y: n.position.y + parent.position.y },
    } as FlowNode
  })
}

/**
 * 松手时按屏幕坐标反查落点：优先精确落在的**输入端点**，否则落在的节点卡片（走统一资源端点 res），
 * 都不是则视为落在画布空白处。用 elementFromPoint 而非 React Flow 的连接系统——本按钮不是 handle，
 * 起点不在任何节点上，走不了 onConnect 那条路。
 */
function resolveDropTarget(clientX: number, clientY: number): DropTarget {
  const el = document.elementFromPoint(clientX, clientY)
  if (!el) return { kind: 'pane' }
  const handleEl = el.closest('.react-flow__handle')
  const nodeEl = el.closest<HTMLElement>('.react-flow__node')
  const nodeId = nodeEl?.dataset.id ?? null
  if (!nodeId) return { kind: 'pane' }
  // 落在输出端点上不算（资源要进的是输入口）；输入端点用它自己的 handleId
  if (handleEl?.classList.contains('target')) {
    return { kind: 'node', nodeId, handleId: handleEl.getAttribute('data-handleid') || null }
  }
  return { kind: 'node', nodeId, handleId: RES_INPUT_HANDLE }
}

/**
 * 批量连线按钮：框选 ≥2 个资源节点时浮在选区包围盒中心，从它拖到目标节点即可把选中的资源
 * **一并**连到同一个输入端点（顺序按节点创建序 = 没写 @ 时的实发列表序）。
 *
 * 与「从某个资源节点的输出端点拖线」那条既有路径互补：那条要先挑一个起点节点，这条不用。
 * 必须渲染在 <ReactFlow> 内部（用 useViewport 把 flow 坐标换算成画布面坐标）。
 */
export function MultiConnectHandle({
  onDropOnPane,
}: {
  /** 松手落在画布空白处：由 FlowCanvas 在该处弹建节点菜单，选中后新建节点并把选中资源全连上。 */
  onDropOnPane: (clientX: number, clientY: number) => void
}) {
  const project = useActiveProject()
  const connectSelectedResourcesTo = useFlowStore((s) => s.connectSelectedResourcesTo)
  const { x: vx, y: vy, zoom } = useViewport()
  const buttonRef = useRef<HTMLButtonElement>(null)
  // 拖拽中的起点/当前点（均为 client 坐标，直接画在 fixed 浮层上，省去容器 rect 换算）
  const [drag, setDrag] = useState<{ from: { x: number; y: number }; to: { x: number; y: number } } | null>(null)

  const selected = project ? selectedResourceNodes(project.nodes) : []
  const count = selected.length
  const active = count >= 2
  // 选中的资源同一类型时，预览线用该类型色（与画布连线的配色语言一致）；混选则用中性主色
  const kinds = new Set(selected.map((n) => sourceKind(n)))
  const lineColor = (kinds.size === 1 ? toneColor([...kinds][0] as HandleTone) : undefined) ?? 'var(--primary)'

  // 拖拽期间在 window 上跟指针（pointer capture 会把事件锁在按钮上，这里仍统一挂 window 更稳）
  useEffect(() => {
    if (!drag) return
    const onMove = (e: PointerEvent) => {
      setDrag((d) => (d ? { ...d, to: { x: e.clientX, y: e.clientY } } : d))
    }
    const onUp = (e: PointerEvent) => {
      setDrag(null)
      const target = resolveDropTarget(e.clientX, e.clientY)
      if (target.kind === 'node') connectSelectedResourcesTo(target.nodeId, target.handleId)
      else onDropOnPane(e.clientX, e.clientY)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrag(null) // 拖到一半反悔
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey)
    }
  }, [drag, connectSelectedResourcesTo, onDropOnPane])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    // 关键：不让画布拿到这次 pointerdown，否则 React Flow 会当成点空白而清掉选中态
    e.preventDefault()
    e.stopPropagation()
    const rect = buttonRef.current?.getBoundingClientRect()
    const from = rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : { x: e.clientX, y: e.clientY }
    setDrag({ from, to: { x: e.clientX, y: e.clientY } })
  }, [])

  if (!project || !active) return null

  // 选区包围盒中心（flow 坐标）→ 画布面坐标（与 React Flow 的 transform 同一套）
  const box = computeBoundingBox(toAbsolute(selected, project.nodes))
  const left = (box.x + box.width / 2) * zoom + vx
  const top = (box.y + box.height / 2) * zoom + vy

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        // nodrag/nopan：别让按住按钮变成拖画布；z-10 压在节点之上但低于右键菜单(z-30)
        className="nodrag nopan absolute z-10 flex -translate-x-1/2 -translate-y-1/2 cursor-grab items-center gap-1 rounded-full border border-primary/30 bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground shadow-md transition-transform hover:scale-105 active:cursor-grabbing"
        style={{ left, top }}
        title={`拖到目标节点，把选中的 ${count} 个资源一并连过去`}
        onPointerDown={onPointerDown}
        onContextMenu={(e) => e.stopPropagation()}
      >
        <Link2 className="size-3.5" />
        {count}
      </button>

      {/* 拖拽预览线：fixed 全屏浮层 + pointer-events-none，免得挡住 elementFromPoint 的落点判定 */}
      {drag &&
        createPortal(
          <svg className="pointer-events-none fixed inset-0 z-50 size-full">
            <line
              x1={drag.from.x}
              y1={drag.from.y}
              x2={drag.to.x}
              y2={drag.to.y}
              stroke={lineColor}
              strokeWidth={2}
              strokeDasharray="6 4"
              strokeLinecap="round"
            />
            <circle cx={drag.to.x} cy={drag.to.y} r={4} fill={lineColor} />
          </svg>,
          document.body,
        )}
    </>
  )
}
