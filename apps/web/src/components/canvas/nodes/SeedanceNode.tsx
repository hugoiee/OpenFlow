import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { generateVideoApi } from '@/lib/api'
import {
  GEN_NODE_META,
  SEEDANCE_DURATION_DEFAULT,
  SEEDANCE_MODE_DEFAULT,
  SEEDANCE_RESOLUTION_DEFAULT,
  SEEDANCE_VERSION_DEFAULT,
  videoApiModel,
} from '@/lib/nodeCatalog'
import { type VideoNode as VideoNodeType } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'

const meta = GEN_NODE_META.video

/** 收集所有指向该节点的上游 prompt 节点文本，拼成生成指令。 */
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

/**
 * Seedance 视频生成节点：卡片只展示生成结果（运行态 / 结果视频 / 空占位）。
 * 输入图、version/mode/分辨率/时长等参数都在右侧 Inspector（NodeInspector）里编辑。
 */
export function SeedanceNode({ id, data, selected }: NodeProps<VideoNodeType>) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)

  // 兼容旧 video 节点（早期只有 {label, model}）：缺失字段给默认值；以下派生供 handleRun 取参。
  const imagesText = data.imagesText ?? ''
  const version = data.version ?? SEEDANCE_VERSION_DEFAULT
  const mode = data.mode ?? SEEDANCE_MODE_DEFAULT
  const resolution = data.resolution ?? SEEDANCE_RESOLUTION_DEFAULT
  const duration = data.duration ?? SEEDANCE_DURATION_DEFAULT
  const result = data.result ?? []
  const running = data.running ?? false

  const fail = (message: string) => {
    updateNodeData(id, { running: false, error: message })
    window.alert(`视频生成失败：${message}`)
  }

  const handleRun = async () => {
    const prompt = collectUpstreamPrompt(id)
    if (!prompt.trim()) {
      fail('请先连接一个有内容的 Prompt 节点')
      return
    }
    const images = imagesText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    updateNodeData(id, { running: true, error: undefined, result: [] })
    try {
      const urls = await generateVideoApi({
        model: videoApiModel(data.model),
        version,
        mode,
        prompt,
        images,
        resolution,
        duration,
      })
      updateNodeData(id, { running: false, result: urls })
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Card
      className={`relative w-72 gap-2 py-3 shadow-sm transition-shadow ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
    >
      <Handle type="target" position={Position.Left} className={`!size-3 ${meta.handle}`} />
      <span className="pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap text-[11px] text-muted-foreground">
        Prompt*
      </span>
      <CardHeader className="px-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className={`size-2 rounded-full ${meta.dot}`} />
          {data.label}
          <span className="ml-auto text-xs font-normal text-muted-foreground">{data.model}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-3">
        {/* 结果展示区 */}
        <div className="nodrag overflow-hidden rounded-md border">
          {running ? (
            <Skeleton className="aspect-video w-full" />
          ) : result.length > 0 ? (
            <div className="flex flex-col gap-1">
              {result.map((url) => (
                <video key={url} src={url} controls className="w-full bg-muted" />
              ))}
            </div>
          ) : (
            <div
              className="flex aspect-video w-full items-center justify-center bg-muted text-[11px] text-muted-foreground"
              style={{
                backgroundImage:
                  'repeating-conic-gradient(var(--border) 0% 25%, transparent 0% 50%)',
                backgroundSize: '16px 16px',
              }}
            >
              暂无结果
            </div>
          )}
        </div>

        <Button size="sm" onClick={handleRun} disabled={running} className="nodrag w-full">
          {running ? '生成中…' : '生成'}
        </Button>

        {data.error && (
          <p className="nodrag rounded-md bg-destructive/10 p-2 text-[11px] text-destructive">
            {data.error}
          </p>
        )}
      </CardContent>
      <Handle type="source" position={Position.Right} className={`!size-3 ${meta.handle}`} />
      <span className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap text-[11px] text-muted-foreground">
        Video
      </span>
    </Card>
  )
}
