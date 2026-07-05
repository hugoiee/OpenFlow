import { useEffect, useRef, useState } from 'react'
import { type NodeProps, useUpdateNodeInternals } from '@xyflow/react'
import { Download, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { DownloadDialog, type DownloadTarget } from '@/components/canvas/DownloadDialog'
import { NodeHeader } from './NodeHeader'
import { NodeHandle } from './NodeHandle'
import { AddInputControls, AudioInputHandles, ImageInputHandles } from './ImageInputHandles'
import { createVideoTaskApi } from '@/lib/api'
import { pollTask } from '@/lib/taskPolling'
import { audioInputCount, imageInputCount, imageInputHandleId } from '@/lib/graph'
import { VIDEO_VARIANT_DEFAULT } from '@/lib/nodeCatalog'
import { buildVideoRequest } from '@/lib/requestBody'
import { type VideoNode as VideoNodeType } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'

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

  const result = data.result ?? []
  const running = data.running ?? false

  // 变体：frames（首尾帧）/ reference（参考图）。旧数据按 legacy videoTask 推断。
  const variant = data.videoVariant ?? (data.videoTask === 'reference' ? 'reference' : VIDEO_VARIANT_DEFAULT)
  const isReference = variant === 'reference'
  const imageInputs = imageInputCount(data.imageInputs)
  const audioInputs = audioInputCount(data.audioInputs)
  // 左侧端点竖向排位：Prompt(0) → 图像端点 → 音频端点。frames 固定 2 张图，reference 为 imageInputs
  const imageSlots = isReference ? imageInputs : 2
  const audioBaseIndex = 1 + imageSlots

  // 「Add Input」/ 切换变体 动态增减端点后，通知 React Flow 重新测量本节点 handle，否则新增端点无法连线
  const updateNodeInternals = useUpdateNodeInternals()
  useEffect(() => {
    updateNodeInternals(id)
  }, [id, imageSlots, audioInputs, updateNodeInternals])

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
    const node = project.nodes.find((n) => n.id === id)
    if (node?.type !== 'video') {
      fail('未找到当前节点')
      return
    }
    // 请求体与 Inspector 的「请求 JSON 预览」同源（buildVideoRequest），保证预览=实发
    const body = buildVideoRequest(project, node)
    if (!body.prompt.trim()) {
      fail('请先连接一个有内容的 Prompt 节点')
      return
    }
    updateNodeData(id, { running: true, error: undefined, result: [], taskId: undefined })
    try {
      const taskId = await createVideoTaskApi(body)
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
      {/* 左侧输入端点：Prompt（必填，粉实心）+ 图像端点（绿）+ 音频端点（蓝） */}
      <NodeHandle type="target" index={0} tone="prompt" label="Prompt" required title="Prompt 输入（必填）" />
      {isReference ? (
        <ImageInputHandles count={imageInputs} baseIndex={1} />
      ) : (
        <>
          <NodeHandle type="target" id={imageInputHandleId(0)} index={1} tone="image" label="First Frame" title="首帧" />
          <NodeHandle type="target" id={imageInputHandleId(1)} index={2} tone="image" label="Last Frame" title="尾帧" />
        </>
      )}
      <AudioInputHandles count={audioInputs} baseIndex={audioBaseIndex} />
      <NodeHeader
        id={id}
        icon={Video}
        title={`${data.model} · ${isReference ? '参考图' : '首尾帧'}`}
        selected={selected}
      />
      <CardContent className="flex flex-col gap-2 px-3">
        {/* 结果展示区 */}
        <div className="nodrag overflow-hidden rounded-md border">
          {running ? (
            <Skeleton className="aspect-square w-full" />
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
              className="flex aspect-square w-full items-center justify-center bg-muted text-[11px] text-muted-foreground"
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

        {/* Add Input（图标按钮：参考图=图+音，首尾帧=仅音）+ 生成 并排 */}
        <div className="flex flex-wrap items-center gap-2">
          <AddInputControls
            id={id}
            image={isReference ? imageInputs : undefined}
            audio={audioInputs}
          />
          <Button size="sm" onClick={handleRun} disabled={running} className="nodrag ml-auto h-8">
            {running ? '生成中…' : '生成'}
          </Button>
        </div>

        {data.error && (
          <p className="nodrag rounded-md bg-destructive/10 p-2 text-[11px] text-destructive">
            {data.error}
          </p>
        )}
      </CardContent>
      <DownloadDialog open={dialogOpen} onOpenChange={setDialogOpen} target={downloadTarget} />
      {/* 输出：Video（默认色） */}
      <NodeHandle type="source" index={0} label="Video" title="视频输出" />
    </Card>
  )
}
