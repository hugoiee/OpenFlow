import { useState } from 'react'
import { type LucideIcon } from 'lucide-react'
import { CardHeader, CardTitle } from '@/components/ui/card'
import { NODE_MARK_META } from '@/lib/nodeMark'
import { type NodeMark } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'
import { NodeMarkPicker } from './NodeMarkPicker'

/**
 * 所有画布节点共用的头部：颜色标记色点 + 图标 + 名称（data.label，双击重命名）。**只有这三样**。
 *
 * ⚠️ 副标题（模型名 / 文件名）与复制 / 删除按钮已挪到各节点**底部的动作行**（见 NodeActions）：
 * 它们原本和可改名的节点名挤同一行，名字起长一点就会把它们挤没。现在名称独占整行，再长也只是
 * 自己 truncate。色点则在**已标记时常显**（标记本来就是给人扫图用的），未标记时 hover 才显，
 * 免得每张卡片都挂一个空圈。统一头部间距（px-3 / gap-2），保证各类节点视觉一致。
 */
export function NodeHeader({
  id,
  icon: Icon,
  title,
  selected,
  mark,
  markable = true,
}: {
  id: string
  icon: LucideIcon
  title: string
  selected?: boolean
  /** 当前颜色标记（data.mark）。 */
  mark?: NodeMark
  /** 该节点是否支持颜色标记（素材节点传 false：纯上传源，无所谓可用与否）。 */
  markable?: boolean
}) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)

  // 选色浮层的锚点矩形（非空即展开）；浮层是 portal 到 body 的 fixed 层，故要传屏幕坐标
  const [markAnchor, setMarkAnchor] = useState<DOMRect | null>(null)

  // 重命名编辑态：双击标题进入，Enter/blur 提交（trim 非空才写入）、Esc 取消
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const commitRename = () => {
    const label = draft.trim()
    if (label) updateNodeData(id, { label })
    setEditing(false)
  }

  return (
    <CardHeader className="px-3">
      <CardTitle className="flex items-center gap-2 text-sm">
        {markable && (
          <button
            type="button"
            title={mark ? `标记：${NODE_MARK_META[mark].label}（点击修改）` : '标记颜色'}
            // 阻止冒泡：否则点击会被 React Flow 当作点选节点（并清掉其他选中项）
            onClick={(e) => {
              e.stopPropagation()
              setMarkAnchor(markAnchor ? null : e.currentTarget.getBoundingClientRect())
            }}
            className={`nodrag -ml-0.5 size-3 shrink-0 rounded-full transition-opacity ${
              mark
                ? NODE_MARK_META[mark].dot
                : `border border-muted-foreground/50 ${
                    selected ? 'opacity-100' : 'opacity-0 group-hover/node:opacity-100'
                  }`
            }`}
          />
        )}
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
      </CardTitle>
      {markAnchor && (
        <NodeMarkPicker
          anchor={markAnchor}
          value={mark}
          onPick={(next) => {
            // 清除标记写 undefined：updateNodeData 是浅合并，存库时 JSON 会把它整个丢掉
            updateNodeData(id, { mark: next ?? undefined })
            setMarkAnchor(null)
          }}
          onClose={() => setMarkAnchor(null)}
        />
      )}
    </CardHeader>
  )
}
