import { NodeResizer, type NodeProps } from '@xyflow/react'
import { Ungroup } from 'lucide-react'
import { GROUP_PADDING } from '@/lib/layout'
import { type GroupNode as GroupNodeType } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'

// 容器最小尺寸：至少能放下一个节点 + 四周留白
const MIN_WIDTH = 160
const MIN_HEIGHT = 120

/**
 * 分组容器节点：一个半透明虚线框，包住子节点（子节点 parentId 指向它、渲染在其上方）。
 * 拖动框体时子节点跟随；顶部一条工具条可改名 / 取消分组。框体本身可拖拽调整大小（NodeResizer）。
 * 无连接点（不参与连线）。
 */
export function GroupNode({ id, data, selected, width, height }: NodeProps<GroupNodeType>) {
  const ungroupNode = useFlowStore((s) => s.ungroupNode)
  const updateNodeData = useFlowStore((s) => s.updateNodeData)

  return (
    <div
      // 用 || 兜 0/NaN（同 PromptNode：React Flow 测量竞态可能写 0）
      style={{ width: width || GROUP_PADDING * 4, height: height || GROUP_PADDING * 3 }}
      className={`rounded-xl border-2 border-dashed bg-muted/15 transition-colors ${
        selected ? 'border-primary/70' : 'border-muted-foreground/40'
      }`}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={MIN_WIDTH}
        minHeight={MIN_HEIGHT}
        lineClassName="!border-primary/50"
        handleClassName="!size-2.5 !rounded-sm !border-2 !border-background !bg-primary"
      />

      {/* 顶部工具条：改名 + 取消分组（nodrag，避免拖到就误触发拖拽/编辑） */}
      <div className="absolute left-2 right-2 top-1.5 flex items-center gap-1">
        <input
          value={data.label}
          onChange={(e) => updateNodeData(id, { label: e.target.value })}
          placeholder="分组名"
          className="nodrag min-w-0 flex-1 rounded-sm bg-transparent px-1 py-0.5 text-xs font-medium text-muted-foreground outline-none focus:bg-background/70 focus:text-foreground"
        />
        <button
          type="button"
          title="取消分组（释放子节点）"
          onClick={() => ungroupNode(id)}
          className="nodrag shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Ungroup className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
