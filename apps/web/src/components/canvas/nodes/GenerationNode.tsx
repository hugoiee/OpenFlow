import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { GEN_NODE_META } from '@/lib/nodeCatalog'
import { type ImageNode, type VideoNode } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'

/** 图像 / 视频生成节点（共用）。固定预置模型；生成功能待接入，运行按钮暂置灰。 */
export function GenerationNode({ id, type, data, selected }: NodeProps<ImageNode | VideoNode>) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
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
        <Select
          value={data.model || undefined}
          onValueChange={(v) => updateNodeData(id, { model: v })}
        >
          <SelectTrigger className="nodrag w-full text-xs">
            <SelectValue placeholder="选择模型" />
          </SelectTrigger>
          <SelectContent>
            {meta.models.map((m) => (
              <SelectItem key={m} value={m} className="text-xs">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button size="sm" disabled className="nodrag w-full" title="生成功能待接入">
          运行
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">生成功能待接入</p>
      </CardContent>
      <Handle type="source" position={Position.Right} className={`!size-3 ${meta.handle}`} />
    </Card>
  )
}
