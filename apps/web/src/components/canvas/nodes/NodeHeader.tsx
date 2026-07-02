import { Trash2, type LucideIcon } from 'lucide-react'
import { CardHeader, CardTitle } from '@/components/ui/card'
import { useFlowStore } from '@/store/useFlowStore'

/**
 * 所有画布节点共用的头部：图标 + 名称（模型名 / 节点名 / 文件名），右侧一个删除按钮。
 * 删除按钮默认隐藏，节点被 hover 或选中时才显示（依赖节点根 Card 上的 `group/node`）。
 * 统一头部间距（px-3 / gap-2），保证各类节点视觉一致。
 */
export function NodeHeader({
  id,
  icon: Icon,
  title,
  selected,
}: {
  id: string
  icon: LucideIcon
  title: string
  selected?: boolean
}) {
  const removeNode = useFlowStore((s) => s.removeNode)

  return (
    <CardHeader className="px-3">
      <CardTitle className="flex items-center gap-2 text-sm">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <button
          type="button"
          title="删除节点"
          onClick={() => removeNode(id)}
          className={`nodrag -mr-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 ${
            selected ? 'opacity-100' : 'opacity-0 group-hover/node:opacity-100'
          }`}
        >
          <Trash2 className="size-3.5" />
        </button>
      </CardTitle>
    </CardHeader>
  )
}
