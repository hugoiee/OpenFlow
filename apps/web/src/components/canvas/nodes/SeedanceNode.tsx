import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { generateVideoApi } from '@/lib/api'
import {
  GEN_NODE_META,
  SEEDANCE_DURATION_DEFAULT,
  SEEDANCE_RESOLUTION_DEFAULT,
  SEEDANCE_VERSION_DEFAULT,
  deriveVideoTask,
  videoApiModel,
  videoTaskImages,
  videoTaskMode,
} from '@/lib/nodeCatalog'
import { collectUpstreamAudio, collectUpstreamImages, collectUpstreamPrompt } from '@/lib/graph'
import { type VideoNode as VideoNodeType } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'

const meta = GEN_NODE_META.video

/**
 * Seedance 视频生成节点：卡片只展示生成结果（运行态 / 结果视频 / 空占位）。
 * 输入图、version/mode/分辨率/时长等参数都在右侧 Inspector（NodeInspector）里编辑。
 */
export function SeedanceNode({ id, data, selected }: NodeProps<VideoNodeType>) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)

  // 兼容旧 video 节点（早期只有 {label, model}）：缺失字段给默认值；以下派生供 handleRun 取参。
  const imagesText = data.imagesText ?? ''
  const audiosText = data.audiosText ?? ''
  const version = data.version ?? SEEDANCE_VERSION_DEFAULT
  const resolution = data.resolution ?? SEEDANCE_RESOLUTION_DEFAULT
  const duration = data.duration ?? SEEDANCE_DURATION_DEFAULT
  const result = data.result ?? []
  const running = data.running ?? false

  const fail = (message: string) => {
    updateNodeData(id, { running: false, error: message })
    window.alert(`视频生成失败：${message}`)
  }

  const handleRun = async () => {
    const state = useFlowStore.getState()
    const project = state.projects.find((p) => p.id === state.activeProjectId)
    const prompt = project ? collectUpstreamPrompt(project, id) : ''
    if (!prompt.trim()) {
      fail('请先连接一个有内容的 Prompt 节点')
      return
    }
    // 输入图 = 上游 image 节点的连线结果（图片1…）在前，手动填/传的在后
    const manualImages = imagesText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    const combined = [...(project ? collectUpstreamImages(project, id) : []), ...manualImages]
    // 任务 → 后端 mode + 真正提交的有序图（文生=空 / 首帧=前1 / 首尾帧=前2 / 参考=全部）
    const task = deriveVideoTask(data.videoTask, data.mode, combined.length)
    // 输入音频 = 上游音频素材节点经连线传入（在前）+ 本节点手动填/传的 URL（在后），一并作 audio_list
    const manualAudios = audiosText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    const audios = [...(project ? collectUpstreamAudio(project, id) : []), ...manualAudios]
    updateNodeData(id, { running: true, error: undefined, result: [] })
    try {
      const urls = await generateVideoApi({
        model: videoApiModel(data.model),
        version,
        mode: videoTaskMode(task),
        prompt,
        images: videoTaskImages(task, combined),
        audios,
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
      className={`w-72 gap-2 py-3 shadow-sm transition-shadow ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
    >
      <Handle type="target" position={Position.Left} className={`!size-3 ${meta.handle}`} />
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
    </Card>
  )
}
