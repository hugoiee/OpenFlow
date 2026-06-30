import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { GEN_NODE_META } from '@/lib/nodeCatalog'
import { type ImageNode, type VideoNode } from '@/lib/types'

/** 图像 / 视频生成节点（共用）。模型在添加时已固定，画布上只读展示、不可切换；生成功能待接入。 */
export function GenerationNode({ type, data, selected }: NodeProps<ImageNode | VideoNode>) {
  const meta = GEN_NODE_META[type]

  return (
    <Card
      className={`w-72 gap-2 py-3 shadow-sm transition-shadow ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
    >
      <Handle type="target" position={Position.Left} className={`!size-3 ${meta.handle}`} />
      <CardHeader className="px-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className={`size-2 rounded-full ${meta.dot}`} />
          {data.label}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-3">
        <div className="rounded-md border bg-muted/40 px-2 py-1.5 text-xs">{data.model}</div>

        <Button size="sm" disabled className="nodrag w-full" title="生成功能待接入">
          运行
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">生成功能待接入</p>
      </CardContent>
      <Handle type="source" position={Position.Right} className={`!size-3 ${meta.handle}`} />
    </Card>
  )
}
