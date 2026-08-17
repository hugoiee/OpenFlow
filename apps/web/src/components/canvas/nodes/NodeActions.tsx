import { Copy, Trash2 } from 'lucide-react'
import { useFlowStore } from '@/store/useFlowStore'

/**
 * 节点卡片**底部动作行**里的通用件：左边一条灰色小字副标题（模型名 / 文件名），右边复制 + 删除。
 * 返回的是 Fragment，由各节点塞进自己已有的那一行（图像/视频/播客的「生成」行、Prompt 的预设行、
 * 切割节点的「切割」行、分镜节点的工具栏、素材节点新加的一行），所以按钮永远和该节点的主操作同排。
 *
 * ⚠️ 这些原本长在 NodeHeader 里，和可改名的节点名抢同一行 —— 名字起长一点就把副标题和两个按钮
 * 挤没了。挪到底部行后头部只剩「色点 + 图标 + 名称」，名称再长也只是自己 truncate，不影响别人。
 *
 * 副标题的 span 恒渲染（哪怕为空）：它带 flex-1，同时充当把右侧按钮推到行尾的弹性占位，
 * 各调用方就不必各自再写 ml-auto。
 */
export function NodeActions({
  id,
  subtitle,
  selected,
  spacer = true,
}: {
  id: string
  /** 小字副标题（模型名 / 文件名等固定信息）；无则留空，仅作占位撑开。 */
  subtitle?: string
  /** 选中时按钮常显，否则 hover 节点才显（依赖节点根 Card 上的 `group/node`）。 */
  selected?: boolean
  /**
   * 是否渲染那条 flex-1 的副标题/占位 span。调用方那一行里**已经有别的 flex-1 元素**时传 false
   * （如 Prompt 的「选用预设」按钮、切割节点的反馈文字），否则两个 flex-1 会平分宽度、把对方压扁。
   */
  spacer?: boolean
}) {
  const removeNode = useFlowStore((s) => s.removeNode)
  const duplicateNode = useFlowStore((s) => s.duplicateNode)

  const visibility = selected ? 'opacity-100' : 'opacity-0 group-hover/node:opacity-100'

  return (
    <>
      {spacer && (
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{subtitle}</span>
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
        className={`nodrag shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 ${visibility}`}
      >
        <Trash2 className="size-3.5" />
      </button>
    </>
  )
}
