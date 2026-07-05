import { type NodeProps } from '@xyflow/react'
import { GROUP_PADDING } from '@/lib/layout'
import { type GroupNode as GroupNodeType } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'
import { useCompositionField } from '@/hooks/useCompositionField'

/**
 * 分组容器节点：一块半透明填充背景（不描边），包住子节点（子节点 parentId 指向它、渲染在其上方）。
 * 拖动框体时子节点跟随；分组名显示在框体外左上角，可点击改名。尺寸在分组时按子节点包围盒
 * 固定，不支持手动拖拽调整（无 NodeResizer）。取消分组只走「右键 → 取消分组」。无连接点。
 * 用「明显的背景」而非边框来表示分组；选中时背景更深一档并带主色调，作选中反馈。
 */
export function GroupNode({ id, data, selected, width, height }: NodeProps<GroupNodeType>) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const labelField = useCompositionField(data.label, (v) => updateNodeData(id, { label: v }))

  return (
    <div
      // 用 || 兜 0/NaN（同 PromptNode：React Flow 测量竞态可能写 0）
      style={{ width: width || GROUP_PADDING * 4, height: height || GROUP_PADDING * 3 }}
      className={`relative rounded-xl transition-colors ${
        selected ? 'bg-primary/15' : 'bg-muted/60'
      }`}
    >
      {/* 分组名：显示在分组框外左上角，可点击改名（nodrag，避免误触发拖拽/编辑） */}
      <input
        {...labelField}
        placeholder="分组名"
        className="nodrag absolute -top-6 left-0 max-w-full rounded-sm bg-transparent px-1 py-0.5 text-xs font-medium text-muted-foreground outline-none focus:bg-background/70 focus:text-foreground"
      />
    </div>
  )
}
