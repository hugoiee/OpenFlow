import { useEffect, useRef, useState } from 'react'
import { type NodeProps, useUpdateNodeInternals } from '@xyflow/react'
import { Download, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { DownloadDialog, type DownloadTarget } from '@/components/canvas/DownloadDialog'
import { NodeHeader } from './NodeHeader'
import { NodeHandle } from './NodeHandle'
import { TaskFailurePanel } from './TaskFailurePanel'
import { createVideoTaskApi } from '@/lib/api'
import { pollTask } from '@/lib/taskPolling'
import { RES_INPUT_HANDLE, imageInputHandleId } from '@/lib/graph'
import { VIDEO_VARIANT_DEFAULT, videoVariantLabel } from '@/lib/nodeCatalog'
import { buildVideoRequest } from '@/lib/requestBody'
import { type VideoNode as VideoNodeType } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'
import { markCardClass } from '@/lib/nodeMark'
import { NodeActions } from './NodeActions'

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
  // 左侧端点竖向排位：Prompt(0) → （frames 时 First/Last 两个专用图像端点）→ 统一资源端点
  const resIndex = isReference ? 1 : 3

  // 切换变体动态增减端点后，通知 React Flow 重新测量本节点 handle，否则新出现的端点无法连线
  const updateNodeInternals = useUpdateNodeInternals()
  useEffect(() => {
    updateNodeInternals(id)
  }, [id, variant, updateNodeInternals])

  /**
   * 生成失败：节点底部内联展示。
   * keepTaskId=true 用于「任务跑到失败终态」——taskId 要留着，底部面板才能凭它去历史重拉结果；
   * 前置校验类失败（没连 Prompt 等）与任务无关，照旧清掉。
   */
  const fail = (
    message: string,
    opts?: { silent?: boolean; keepTaskId?: boolean; recoverable?: boolean },
  ) => {
    updateNodeData(id, {
      running: false,
      error: message,
      errorRecoverable: opts?.recoverable ?? false,
      ...(opts?.keepTaskId ? {} : { taskId: undefined }),
    })
    if (!opts?.silent) window.alert(`视频生成失败：${message}`)
  }

  // 应用任务终态：成功填结果清 taskId；失败留下 taskId 与「可否重拉」供底部面板自救。
  const applyTaskResult = (task: {
    status: string
    result: string[]
    error?: string
    recoverable?: boolean
  }) => {
    if (task.status === 'succeeded') {
      updateNodeData(id, {
        running: false,
        result: task.result,
        error: undefined,
        taskId: undefined,
      })
    } else {
      // 可恢复的失败（上游没带回 URL / 请求被掐断）不弹窗打断：面板里就能重拉
      fail(task.error || '任务失败', {
        keepTaskId: true,
        recoverable: task.recoverable,
        silent: task.recoverable,
      })
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
        // 重连路径非用户点击触发，连环 alert 会阻塞整个应用
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
    if (node?.type !== 'video') {
      fail('未找到当前节点')
      return
    }
    // 请求体与 Inspector 的「请求 JSON 预览」同源（buildVideoRequest），保证预览=实发
    const body = buildVideoRequest(project, node)
    // 可灵多镜头模式下画面描述写在分镜里、顶层 prompt 本就为空——此时改校验分镜非空
    const hasShots = Boolean(body.multiShot) && (body.shots ?? []).some((s) => s.prompt.trim())
    if (!body.prompt.trim() && !hasShots) {
      fail(
        body.multiShot
          ? '请先填写至少一段分镜内容，或关闭多镜头改用 Prompt 节点'
          : '请先连接一个有内容的 Prompt 节点',
      )
      return
    }
    updateNodeData(id, {
      running: true,
      error: undefined,
      errorRecoverable: false,
      result: [],
      taskId: undefined,
    })
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
      className={`group/node w-72 gap-2 py-3 shadow-sm transition-shadow ${markCardClass(data.mark, selected)}`}
    >
      {/* 左侧输入端点：Prompt（必填，粉实心）+（首尾帧变体：First/Last 专用图像端点）+
          统一资源端点（接图/音/视任意源；用哪个由上游 Prompt 里 @ 引用指定，没 @ 则全发；
          首尾帧变体下资源端点收音频等，图序仍由 First/Last 决定） */}
      <NodeHandle type="target" index={0} tone="prompt" label="Prompt" required title="Prompt 输入（必填）" />
      {!isReference && (
        <>
          <NodeHandle type="target" id={imageInputHandleId(0)} index={1} tone="image" label="First Frame" title="首帧" />
          <NodeHandle type="target" id={imageInputHandleId(1)} index={2} tone="image" label="Last Frame" title="尾帧" />
        </>
      )}
      <NodeHandle
        type="target"
        id={RES_INPUT_HANDLE}
        index={resIndex}
        tone="video"
        label="Assets"
        title="资源输入（图/音/视都可连多份，Prompt 里 @ 指定用哪个）"
      />
      <NodeHeader
        id={id}
        icon={Video}
        title={data.label}
        selected={selected}
        mark={data.mark}
      />
      <CardContent className="flex flex-col gap-2 px-3">
        {/* 结果展示区（node-media：滑出视口时跳过渲染，见 index.css） */}
        <div className="node-media nodrag overflow-hidden rounded-md border">
          {running ? (
            <Skeleton className="aspect-square w-full" />
          ) : result.length > 0 ? (
            <div className="flex flex-col gap-1">
              {result.map((url, i) => (
                <div key={url} className="group/dl relative">
                  {/* preload=metadata：只拉首帧与时长，不预取整片。画布上出片的视频节点一多，
                      全量预取会把带宽与解码器实例吃光，平移时尤其明显 */}
                  <video src={url} controls preload="metadata" className="w-full bg-muted" />
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

        {/* 底部动作行：模型名+变体 + 复制 / 删除 + 生成（都挪到这里，头部只留可改名的节点名） */}
        <div className="flex items-center gap-2">
          <NodeActions
            id={id}
            subtitle={`${data.model} · ${videoVariantLabel(data.model, variant)}`}
            selected={selected}
          />
          <Button size="sm" onClick={handleRun} disabled={running} className="nodrag h-8">
            {running ? '生成中…' : '生成'}
          </Button>
        </div>

        {data.error && (
          <TaskFailurePanel
            message={data.error}
            taskId={data.taskId}
            recoverable={data.errorRecoverable}
            onResult={(urls) =>
              updateNodeData(id, {
                result: urls,
                error: undefined,
                errorRecoverable: false,
                taskId: undefined,
              })
            }
          />
        )}
      </CardContent>
      <DownloadDialog open={dialogOpen} onOpenChange={setDialogOpen} target={downloadTarget} />
      {/* 输出：Video（玫红）——可连下游节点的视频输入端点 */}
      <NodeHandle type="source" index={0} tone="video" label="Video" title="视频输出" />
    </Card>
  )
}
