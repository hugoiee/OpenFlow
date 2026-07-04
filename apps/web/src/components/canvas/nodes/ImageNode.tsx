import { useEffect, useRef, useState } from 'react'
import { type NodeProps } from '@xyflow/react'
import { Banana, Download, Image as ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { DownloadDialog, type DownloadTarget } from '@/components/canvas/DownloadDialog'
import { NodeHeader } from './NodeHeader'
import { NodeHandle } from './NodeHandle'
import { AddImageInputButton, ImageInputHandles } from './ImageInputHandles'
import { createImageTaskApi } from '@/lib/api'
import { pollTask } from '@/lib/taskPolling'
import { imageInputCount } from '@/lib/graph'
import { buildImageRequest } from '@/lib/requestBody'
import { type ImageNode as ImageNodeType } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'

/**
 * 图像生成节点：卡片只展示生成结果（运行态 / 结果图 / 空占位）。
 * 输入图、尺寸/质量/张数等参数都在右侧 Inspector（NodeInspector）里编辑。
 */
export function ImageNode({ id, data, selected }: NodeProps<ImageNodeType>) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)

  // 下载重命名对话框：downloadTarget 记录当前要下载的结果图
  const [dialogOpen, setDialogOpen] = useState(false)
  const [downloadTarget, setDownloadTarget] = useState<DownloadTarget | null>(null)
  const openDownload = (url: string, index?: number) => {
    const base = data.label || '图像'
    setDownloadTarget({ url, kind: 'image', defaultName: index ? `${base}-${index}` : base })
    setDialogOpen(true)
  }

  const result = data.result ?? []
  const running = data.running ?? false
  const imageInputs = imageInputCount(data.imageInputs)

  // 生成失败：节点底部内联显示；silent=false 时再弹窗提示。
  // 重连路径（刷新重开 / Agent 触发）走 silent——非点击场景连环 alert 会阻塞整个应用。
  const fail = (message: string, opts?: { silent?: boolean }) => {
    updateNodeData(id, { running: false, error: message, taskId: undefined })
    if (!opts?.silent) window.alert(`图像生成失败：${message}`)
  }

  // 应用任务终态：成功填结果、失败报错，一并清 taskId（重连锚点用毕）。
  const applyTaskResult = (
    task: { status: string; result: string[]; error?: string },
    opts?: { silent?: boolean },
  ) => {
    if (task.status === 'succeeded') {
      updateNodeData(id, { running: false, result: task.result, taskId: undefined })
    } else {
      fail(task.error || '任务失败', opts)
    }
  }

  // 刷新/重开后重连：节点带着未完成的 taskId 载入时，恢复「生成中…」并继续轮询。
  // attachedRef 按 taskId 记录已挂载的轮询，避免与 handleRun 或重渲染重复轮询。
  const attachedRef = useRef<string | null>(null)
  useEffect(() => {
    const taskId = data.taskId
    if (!taskId || attachedRef.current === taskId) return
    attachedRef.current = taskId
    const controller = new AbortController()
    updateNodeData(id, { running: true, error: undefined })
    pollTask(taskId, { signal: controller.signal })
      .then((task) => applyTaskResult(task, { silent: true }))
      .catch((e) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        fail(e instanceof Error ? e.message : String(e), { silent: true })
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
    if (node?.type !== 'image') {
      fail('未找到当前节点')
      return
    }
    // 请求体与 Inspector 的「请求 JSON 预览」同源（buildImageRequest），保证预览=实发
    const body = buildImageRequest(project, node)
    if (!body.prompt.trim()) {
      fail('请先连接一个有内容的 Prompt 节点')
      return
    }
    updateNodeData(id, { running: true, error: undefined, result: [], taskId: undefined })
    try {
      const taskId = await createImageTaskApi(body)
      // 立刻存下 taskId：点击后 1s 刷新也已存下，可重连（关页面不丢结果）
      attachedRef.current = taskId
      updateNodeData(id, { taskId })
      const controller = new AbortController()
      const task = await pollTask(taskId, { signal: controller.signal })
      applyTaskResult(task)
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
      {/* 左侧输入端点：Prompt（粉，index 0）+ 图像输入端点（绿，image-0..，Image 1..N） */}
      <NodeHandle type="target" index={0} tone="prompt" label="Prompt" required title="Prompt 输入" />
      <ImageInputHandles count={imageInputs} baseIndex={1} />
      <NodeHeader
        id={id}
        icon={data.model === 'Nano Banana' ? Banana : ImageIcon}
        title={data.model}
        selected={selected}
      />
      <CardContent className="flex flex-col gap-2 px-3">
        {/* 结果展示区 */}
        <div className="nodrag overflow-hidden rounded-md border">
          {running ? (
            <Skeleton className="aspect-square w-full" />
          ) : result.length > 0 ? (
            <div className={`grid gap-1 ${result.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {result.map((url, i) => (
                <div key={url} className="group/dl relative">
                  <a href={url} target="_blank" rel="noreferrer" className="block">
                    <img
                      src={url}
                      alt="生成结果"
                      className="max-h-64 w-full bg-muted object-contain"
                    />
                  </a>
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

        {/* 添加图像输入 + 生成 并排 */}
        <div className="flex items-center gap-2">
          <AddImageInputButton id={id} count={imageInputs} />
          <Button size="sm" onClick={handleRun} disabled={running} className="nodrag ml-auto h-8">
            {running ? '生成中…' : '生成'}
          </Button>
        </div>

        {/* 生成失败信息：固定在节点最下方 */}
        {data.error && (
          <p className="nodrag rounded-md bg-destructive/10 p-2 text-[11px] text-destructive">
            {data.error}
          </p>
        )}
      </CardContent>
      <DownloadDialog open={dialogOpen} onOpenChange={setDialogOpen} target={downloadTarget} />
      {/* 输出：Image（绿） */}
      <NodeHandle type="source" index={0} tone="image" label="Image" title="图像输出" />
    </Card>
  )
}
