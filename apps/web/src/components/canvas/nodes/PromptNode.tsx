import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { useFlowStore } from '@/store/useFlowStore'
import type { PromptNode as PromptNodeType } from '@/lib/types'

export function PromptNode({ id, data, selected }: NodeProps<PromptNodeType>) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)

  return (
    <Card
      className={`inline-block w-auto gap-2 py-3 shadow-sm transition-shadow ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
    >
      <CardHeader className="px-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className="size-2 rounded-full bg-sky-500 dark:bg-sky-400" />
          {data.label}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3">
        <Textarea
          value={data.text}
          onChange={(e) => updateNodeData(id, { text: e.target.value })}
          placeholder="在这里写 prompt…"
          className="nodrag field-sizing-fixed h-24 min-h-24 w-56 min-w-56 resize overflow-hidden text-sm"
        />
      </CardContent>
      <Handle
        type="source"
        position={Position.Right}
        className="!size-3 !bg-sky-500 dark:!bg-sky-400"
      />
    </Card>
  )
}
