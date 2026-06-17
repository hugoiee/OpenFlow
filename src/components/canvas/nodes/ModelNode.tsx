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
import { runMockModel } from '@/lib/mockModel'
import { MODEL_OPTIONS, type ModelNode as ModelNodeType } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'

/** 收集所有指向该模型节点的上游 prompt 节点文本，拼成输入。 */
function collectUpstreamPrompt(nodeId: string): string {
  const state = useFlowStore.getState()
  const project = state.projects.find((p) => p.id === state.activeProjectId)
  if (!project) return ''
  const sourceIds = project.edges.filter((e) => e.target === nodeId).map((e) => e.source)
  return project.nodes
    .filter((n) => n.type === 'prompt' && sourceIds.includes(n.id))
    .map((n) => (n.type === 'prompt' ? n.data.text : ''))
    .filter(Boolean)
    .join('\n\n')
}

export function ModelNode({ id, data, selected }: NodeProps<ModelNodeType>) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)

  const handleRun = async () => {
    updateNodeData(id, { running: true, result: '' })
    const prompt = collectUpstreamPrompt(id)
    const result = await runMockModel(data.model, prompt)
    updateNodeData(id, { running: false, result })
  }

  return (
    <Card
      className={`w-72 gap-2 py-3 shadow-sm transition-shadow ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
    >
      <Handle type="target" position={Position.Top} className="!size-3 !bg-violet-500" />
      <CardHeader className="px-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className="size-2 rounded-full bg-violet-500" />
          {data.label}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-3">
        <Select
          value={data.model}
          onValueChange={(value) => updateNodeData(id, { model: value })}
        >
          <SelectTrigger className="nodrag w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODEL_OPTIONS.map((m) => (
              <SelectItem key={m} value={m} className="text-xs">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          size="sm"
          onClick={handleRun}
          disabled={data.running}
          className="nodrag w-full"
        >
          {data.running ? '运行中…' : '运行'}
        </Button>

        {data.result && (
          <pre className="nodrag max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-xs text-muted-foreground">
            {data.result}
          </pre>
        )}
      </CardContent>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-3 !bg-violet-500"
      />
    </Card>
  )
}
