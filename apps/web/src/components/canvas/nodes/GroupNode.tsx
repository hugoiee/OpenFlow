import { type NodeProps } from '@xyflow/react'
import { GROUP_PADDING } from '@/lib/layout'
import { NODE_MARK_META } from '@/lib/nodeMark'
import { type GroupNode as GroupNodeType } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'
import { useCompositionField } from '@/hooks/useCompositionField'

/**
 * 分组容器节点：虚线描边 + 半透明填充的框，包住子节点（子节点 parentId 指向它、渲染在其上方）。
 * 拖动框体时子节点跟随；分组名显示在框体外左上角，可点击改名。尺寸在分组时按子节点包围盒
 * 固定，不支持手动拖拽调整（无 NodeResizer）。取消分组只走「右键 → 取消分组」。无连接点。
 * 选中时描边与填充换成主色，作选中反馈。
 *
 * ⚠️ 配色用 muted-foreground 的低透明度而**不是** bg-muted：muted 在浅色主题是 0.97、画布底是
 * 纯白，两者几乎同色 —— 只靠 bg-muted 的话浅色下这个框基本看不见。改用「中性前景色低透明度」
 * 才能在明暗两套主题下都与底色拉开差距（浅色压暗一点、深色提亮一点）。
 * 描边走 border 而非 ring/outline：容器有显式宽高 + box-border，边画在盒内不会撑大框。
 */
export function GroupNode({ id, data, selected, width, height }: NodeProps<GroupNodeType>) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const labelField = useCompositionField(data.label, (v) => updateNodeData(id, { label: v }))
  const mark = data.mark

  return (
    <div
      // 用 || 兜 0/NaN（同 PromptNode：React Flow 测量竞态可能写 0）
      style={{ width: width || GROUP_PADDING * 4, height: height || GROUP_PADDING * 3 }}
      className={`relative rounded-xl border-2 border-dashed transition-colors ${
        // 有标记时描边恒为标记色（分组没有 NodeHeader 的色点，描边是它唯一的标记出口，
        // 不能被选中态吃掉），选中与否改用填充深浅来区分
        mark ? NODE_MARK_META[mark].border : selected ? 'border-primary/70' : 'border-muted-foreground/60'
      } ${selected ? 'bg-primary/15' : 'bg-muted-foreground/15'}`}
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
