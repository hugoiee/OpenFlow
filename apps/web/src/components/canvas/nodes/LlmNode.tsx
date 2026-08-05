import { useEffect, useRef, useState } from 'react'
import { type NodeProps, useUpdateNodeInternals } from '@xyflow/react'
import { Copy, Maximize, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { NodeHeader } from './NodeHeader'
import { NodeHandle } from './NodeHandle'
import {
  AddInputControls,
  AudioInputHandles,
  ImageInputHandles,
  VideoInputHandles,
} from './ImageInputHandles'
import { createLlmTaskApi } from '@/lib/api'
import { pollTask } from '@/lib/taskPolling'
import { LLM_MODEL_DEFAULT } from '@/lib/nodeCatalog'
import { LLM_SYSTEM_HANDLE, imageInputCount } from '@/lib/graph'
import { buildLlmRequest } from '@/lib/requestBody'
import { type LlmNode as LlmNodeType } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'

/**
 * Any LLM 节点：卡片展示文本输出（运行态 / 回答 + 折叠思考 / 空占位）。
 * 模型 / 温度 / 思考等参数都在右侧 Inspector（NodeInspector）里编辑；调用复用画布 Agent 端点。
 */
export function LlmNode({ id, data, selected }: NodeProps<LlmNodeType>) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const updateNodeInternals = useUpdateNodeInternals()

  const model = data.model || LLM_MODEL_DEFAULT
  const thinking = data.thinking ?? false
  const result = data.result ?? ''
  const reasoning = data.reasoning ?? ''
  const running = data.running ?? false
  // 图像默认 ≥1（沿用旧行为）；音频 / 视频 0 起步，点「Add Input」才出现端点
  const imageInputs = imageInputCount(data.imageInputs)
  const audioInputs = Math.max(0, data.audioInputs ?? 0)
  const videoInputs = Math.max(0, data.videoInputs ?? 0)

  // 「Add Input」动态增减端点后，通知 React Flow 重新测量本节点的 handle 位置——
  // 否则挂载后新增的 audio-/video- 端点不会被登记进连接系统，无法连线（image 默认≥1 在挂载时已登记故无此症状）。
  useEffect(() => {
    updateNodeInternals(id)
  }, [id, imageInputs, audioInputs, videoInputs, updateNodeInternals])

  const [copied, setCopied] = useState(false)
  const copyResult = async () => {
    try {
      await navigator.clipboard.writeText(result)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      // 剪贴板不可用时静默（非关键路径）
    }
  }

  // 「展开全文」弹窗 + 预览是否被截断（截断了才显示底部渐隐遮罩与「展开全文」按钮）
  const [fullOpen, setFullOpen] = useState(false)
  const previewRef = useRef<HTMLParagraphElement>(null)
  const [clamped, setClamped] = useState(false)
  useEffect(() => {
    const el = previewRef.current
    setClamped(!!el && el.scrollHeight > el.clientHeight + 1)
  }, [result])

  // 生成失败：节点底部内联显示；silent=false 时再弹窗。
  // 重连路径（刷新重开）走 silent——非点击场景连环 alert 会阻塞整个应用。
  const fail = (message: string, opts?: { silent?: boolean }) => {
    updateNodeData(id, { running: false, error: message, taskId: undefined })
    if (!opts?.silent) window.alert(`LLM 生成失败：${message}`)
  }

  // 应用任务终态：result[0]=回答、result[1]=思考（若有）；一并清 taskId。
  const applyTaskResult = (
    task: { status: string; result: string[]; error?: string },
    opts?: { silent?: boolean },
  ) => {
    if (task.status === 'succeeded') {
      updateNodeData(id, {
        running: false,
        result: task.result[0] ?? '',
        reasoning: task.result[1] ?? '',
        taskId: undefined,
      })
    } else {
      fail(task.error || '任务失败', opts)
    }
  }

  // 刷新/重开后重连：带着未完成 taskId 载入时恢复「思考中…」并继续轮询（关页面不丢结果）。
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
    if (node?.type !== 'llm') {
      fail('未找到当前节点')
      return
    }
    // 请求体与 Inspector 的「请求 JSON 预览」同源（buildLlmRequest），保证预览=实发
    const body = buildLlmRequest(project, node)
    if (!body.prompt.trim()) {
      fail('请先在「Prompt 输入」端点连接一个有内容的 Prompt / LLM 节点')
      return
    }
    updateNodeData(id, {
      running: true,
      error: undefined,
      result: '',
      reasoning: '',
      taskId: undefined,
    })
    try {
      const taskId = await createLlmTaskApi(body)
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
      {/* 左侧输入端点：Prompt（粉）+ System Prompt（粉）+ 图像输入端点（绿，image-0..，Image 1..N） */}
      <NodeHandle type="target" index={0} tone="prompt" label="Prompt" required title="Prompt 输入" />
      <NodeHandle
        type="target"
        id={LLM_SYSTEM_HANDLE}
        index={1}
        tone="prompt"
        label="System Prompt"
        title="System Prompt 输入"
      />
      {/* 媒体输入端点竖向排列：图像(绿) → 音频(蓝) → 视频(玫红)，baseIndex 依次顺延 */}
      <ImageInputHandles count={imageInputs} baseIndex={2} />
      <AudioInputHandles count={audioInputs} baseIndex={2 + imageInputs} />
      <VideoInputHandles count={videoInputs} baseIndex={2 + imageInputs + audioInputs} />
      <NodeHeader id={id} icon={Sparkles} title={data.label} subtitle={model} selected={selected} />
      <CardContent className="flex flex-col gap-2 px-3">
        {/* 思考过程（若返回）：可折叠，默认收起 */}
        {reasoning && !running && (
          <details className="nodrag rounded-md border bg-muted/40 px-2 py-1.5 text-xs">
            <summary className="cursor-pointer select-none text-[11px] text-muted-foreground">
              思考过程
            </summary>
            <p className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap text-muted-foreground">
              {reasoning}
            </p>
          </details>
        )}

        {/* 输出展示区：节点内只显示紧凑预览，超长时底部渐隐 + 「展开全文」弹窗看完整内容 */}
        <div className="nodrag overflow-hidden rounded-md border">
          {running ? (
            <div className="flex aspect-square w-full flex-col justify-center gap-2 p-3">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-11/12" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ) : result ? (
            <div className="group/copy relative">
              <p
                ref={previewRef}
                className="max-h-40 overflow-hidden whitespace-pre-wrap p-3 text-sm leading-relaxed"
              >
                {result}
              </p>
              {/* 超长：底部渐隐遮罩 + 展开全文按钮（遮罩不挡点击，仅按钮可点） */}
              {clamped && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-card via-card/90 to-transparent pt-8 pb-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setFullOpen(true)}
                    className="nodrag pointer-events-auto h-6 gap-1 px-2 text-[11px] shadow-sm"
                  >
                    <Maximize className="size-3" />
                    展开全文
                  </Button>
                </div>
              )}
              <button
                type="button"
                title={copied ? '已复制' : '复制'}
                onClick={copyResult}
                className="nodrag absolute right-1 top-1 rounded-md bg-black/60 p-1 text-white opacity-0 transition-opacity hover:bg-black/80 focus:opacity-100 group-hover/copy:opacity-100"
              >
                <Copy className="size-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex aspect-square w-full items-center justify-center bg-muted p-3 text-[11px] text-muted-foreground">
              暂无输出
            </div>
          )}
        </div>

        {/* Add Input + 运行 并排 */}
        <div className="flex items-center gap-2">
          <AddInputControls id={id} image={imageInputs} audio={audioInputs} video={videoInputs} />
          <Button size="sm" onClick={handleRun} disabled={running} className="nodrag ml-auto h-8">
            {running ? (thinking ? '思考中…' : '生成中…') : '运行'}
          </Button>
        </div>

        {/* 生成失败信息：固定在节点最下方 */}
        {data.error && (
          <p className="nodrag rounded-md bg-destructive/10 p-2 text-[11px] text-destructive">
            {data.error}
          </p>
        )}
      </CardContent>
      {/* 输出：Text（粉，LLM 输出文本） */}
      <NodeHandle type="source" index={0} tone="prompt" label="Text" title="文本输出" />

      {/* 展开全文弹窗：宽、可滚动、带复制（Dialog 经 portal 渲染，放在节点内不影响布局） */}
      <Dialog open={fullOpen} onOpenChange={setFullOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 opacity-70" />
              {model}
            </DialogTitle>
            <DialogDescription>完整输出，可滚动查看与复制。</DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-4 text-sm leading-relaxed">
            {result}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={copyResult} className="gap-1.5">
              <Copy className="size-3.5" />
              {copied ? '已复制' : '复制全文'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
