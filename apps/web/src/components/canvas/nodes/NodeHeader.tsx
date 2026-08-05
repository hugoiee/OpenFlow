import { useState } from 'react'
import { Copy, Trash2, type LucideIcon } from 'lucide-react'
import { CardHeader, CardTitle } from '@/components/ui/card'
import { useFlowStore } from '@/store/useFlowStore'

/**
 * 所有画布节点共用的头部：图标 + 名称（data.label，双击重命名）+ 可选副标题（模型名 / 文件名），
 * 右侧复制 + 删除按钮。两个按钮默认隐藏，节点被 hover 或选中时才显示（依赖节点根 Card 上的 `group/node`）。
 * 统一头部间距（px-3 / gap-2），保证各类节点视觉一致。
 */
export function NodeHeader({
  id,
  icon: Icon,
  title,
  subtitle,
  selected,
}: {
  id: string
  icon: LucideIcon
  title: string
  /** 小字副标题（模型名 / 文件名等固定信息）；标题让位给可改名的 label 后，原信息降级到这里。 */
  subtitle?: string
  selected?: boolean
}) {
  const removeNode = useFlowStore((s) => s.removeNode)
  const duplicateNode = useFlowStore((s) => s.duplicateNode)
  const updateNodeData = useFlowStore((s) => s.updateNodeData)

  // 重命名编辑态：双击标题进入，Enter/blur 提交（trim 非空才写入）、Esc 取消
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const commitRename = () => {
    const label = draft.trim()
    if (label) updateNodeData(id, { label })
    setEditing(false)
  }

  // 复制 / 删除按钮的显隐：选中常显，否则 hover 节点才显
  const visibility = selected ? 'opacity-100' : 'opacity-0 group-hover/node:opacity-100'

  return (
    <CardHeader className="px-3">
      <CardTitle className="flex items-center gap-2 text-sm">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={commitRename}
            onKeyDown={(e) => {
              // 输入法组词中，别把选字的回车/Esc 当作提交/取消
              if (e.nativeEvent.isComposing) return
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') setEditing(false)
            }}
            className="nodrag min-w-0 flex-1 rounded-sm bg-background px-1 -mx-1 text-sm font-semibold outline-none ring-1 ring-ring"
          />
        ) : (
          <span
            title="双击重命名"
            // 阻止冒泡：画布 zoomOnDoubleClick 默认开启，双击会冒泡到 pane 触发缩放
            onDoubleClick={(e) => {
              e.stopPropagation()
              setDraft(title)
              setEditing(true)
            }}
            className="min-w-0 flex-1 truncate"
          >
            {title}
          </span>
        )}
        {!editing && subtitle && (
          <span className="max-w-[45%] shrink-0 truncate text-xs font-normal text-muted-foreground">
            {subtitle}
          </span>
        )}
        <button
          type="button"
          title="复制节点"
          // 阻止冒泡：否则点击会被 React Flow 当作选中原节点，导致副本与原节点同时选中
          onClick={(e) => {
            e.stopPropagation()
            duplicateNode(id)
          }}
          className={`nodrag shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:opacity-100 ${visibility}`}
        >
          <Copy className="size-3.5" />
        </button>
        <button
          type="button"
          title="删除节点"
          onClick={() => removeNode(id)}
          className={`nodrag -mr-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 ${visibility}`}
        >
          <Trash2 className="size-3.5" />
        </button>
      </CardTitle>
    </CardHeader>
  )
}
