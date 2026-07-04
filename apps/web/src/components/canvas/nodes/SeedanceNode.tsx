import { useEffect, useRef, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Download, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { DownloadDialog, type DownloadTarget } from '@/components/canvas/DownloadDialog'
import { NodeHeader } from './NodeHeader'
import { handleStyle } from './handleLayout'
import { createVideoTaskApi } from '@/lib/api'
import { pollTask } from '@/lib/taskPolling'
import {
  GEN_NODE_META,
  SEEDANCE_DURATION_DEFAULT,
  SEEDANCE_RATIO_DEFAULT,
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

  // 下载重命名对话框：downloadTarget 记录当前要下载的结果视频
  const [dialogOpen, setDialogOpen] = useState(false)
  const [downloadTarget, setDownloadTarget] = useState<DownloadTarget | null>(null)
  const openDownload = (url: string, index?: number) => {
    const base = data.label || '视频'
    setDownloadTarget({ url, kind: 'video', defaultName: index ? `${base}-${index}` : base })
    setDialogOpen(true)
  }

  // 兼容旧 video 节点（早期只有 {label, model}）：缺失字段给默认值；以下派生供 handleRun 取参。
  const imagesText = data.imagesText ?? ''
  const audiosText = data.audiosText ?? ''
  const version = data.version ?? SEEDANCE_VERSION_DEFAULT
  const resolution = data.resolution ?? SEEDANCE_RESOLUTION_DEFAULT
  const ratio = data.ratio ?? SEEDANCE_RATIO_DEFAULT
  const duration = data.duration ?? SEEDANCE_DURATION_DEFAULT
  const result = data.result ?? []
  const running = data.running ?? false

  const fail = (message: string) => {
    updateNodeData(id, { running: false, error: message, taskId: undefined })
    window.alert(`视频生成失败：${message}`)
  }

  // 应用任务终态：成功填结果、失败报错，一并清 taskId。
  const applyTaskResult = (task: { status: string; result: string[]; error?: string }) => {
    if (task.status === 'succeeded') {
      updateNodeData(id, { running: false, result: task.result, taskId: undefined })
    } else {
      fail(task.error || '任务失败')
    }
  }

  // 刷新/重开后重连：带着未完成 taskId 载入时恢复「生成中…」并继续轮询（关页面不丢结果）。
  const attachedRef = useRef<string | null>(null)
  useEffect(() => {
    const taskId = data.taskId
    if (!taskId || attachedRef.current === taskId) return
    attachedRef.current = taskId
    const controller = new AbortController()
    updateNodeData(id, { running: true, error: undefined })
    pollTask(taskId, { signal: controller.signal })
      .then(applyTaskResult)
      .catch((e) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        fail(e instanceof Error ? e.message : String(e))
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.taskId])

  const handleRun = async () => {
    const state = useFlowStore.getState()
    const project = state.projects.find((p) => p.id === state.activeProjectId)
    if (!project) {
      fail('未找到当前项目')
      return
    }
    const prompt = collectUpstreamPrompt(project, id)
    if (!prompt.trim()) {
      fail('请先连接一个有内容的 Prompt 节点')
      return
    }
    // 输入图 = 上游 image 节点的连线结果（图片1…）在前，手动填/传的在后
    const manualImages = imagesText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    const combined = [...collectUpstreamImages(project, id), ...manualImages]
    // 任务 → 后端 mode + 真正提交的有序图（文生=空 / 首帧=前1 / 首尾帧=前2 / 参考=全部）
    const task = deriveVideoTask(data.videoTask, data.mode, combined.length)
    // 输入音频 = 上游音频素材节点经连线传入（在前）+ 本节点手动填/传的 URL（在后），一并作 audio_list
    const manualAudios = audiosText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    const audios = [...collectUpstreamAudio(project, id), ...manualAudios]
    updateNodeData(id, { running: true, error: undefined, result: [], taskId: undefined })
    try {
      const taskId = await createVideoTaskApi({
        projectId: project.id,
        nodeId: id,
        model: videoApiModel(data.model),
        version,
        mode: videoTaskMode(task),
        prompt,
        images: videoTaskImages(task, combined),
        audios,
        resolution,
        // adaptive（自适应）=不约束宽高比，等价旧行为，故不传；仅在选了固定比例时下发
        ratio: ratio === SEEDANCE_RATIO_DEFAULT ? undefined : ratio,
        duration,
      })
      attachedRef.current = taskId
      updateNodeData(id, { taskId })
      const controller = new AbortController()
      const done = await pollTask(taskId, { signal: controller.signal })
      applyTaskResult(done)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      fail(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Card
      className={`group/node w-72 gap-2 py-3 shadow-sm transition-shadow ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className={meta.handle}
        style={handleStyle()}
      />
      <NodeHeader id={id} icon={Video} title={data.model} selected={selected} />
      <CardContent className="flex flex-col gap-2 px-3">
        {/* 结果展示区 */}
        <div className="nodrag overflow-hidden rounded-md border">
          {running ? (
            <Skeleton className="aspect-video w-full" />
          ) : result.length > 0 ? (
            <div className="flex flex-col gap-1">
              {result.map((url, i) => (
                <div key={url} className="group/dl relative">
                  <video src={url} controls className="w-full bg-muted" />
                  <button
                    type="button"
                    title="下载"
                    onClick={() => openDownload(url, result.length > 1 ? i + 1 : undefined)}
                    className="nodrag absolute right-1 top-1 rounded-md bg-black/60 p-1 text-white opacity-0 transition-opacity hover:bg-black/80 focus:opacity-100 group-hover/dl:opacity-100"
                  >
                    <Download className="size-3.5" />
                  </button>
                </div>
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
      <DownloadDialog open={dialogOpen} onOpenChange={setDialogOpen} target={downloadTarget} />
      <Handle
        type="source"
        position={Position.Right}
        className={meta.handle}
        style={handleStyle()}
      />
    </Card>
  )
}
