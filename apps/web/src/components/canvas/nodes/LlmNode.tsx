import { useEffect, useRef, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Copy, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { NodeHeader } from './NodeHeader'
import { handleStyle } from './handleLayout'
import { createLlmTaskApi } from '@/lib/api'
import { pollTask } from '@/lib/taskPolling'
import { LLM_MODEL_DEFAULT, LLM_NODE_META, LLM_TEMPERATURE_DEFAULT } from '@/lib/nodeCatalog'
import { collectUpstreamPrompt } from '@/lib/graph'
import { type LlmNode as LlmNodeType } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'

const meta = LLM_NODE_META

/**
 * Any LLM 节点：卡片展示文本输出（运行态 / 回答 + 折叠思考 / 空占位）。
 * 模型 / 温度 / 思考等参数都在右侧 Inspector（NodeInspector）里编辑；调用复用画布 Agent 端点。
 */
export function LlmNode({ id, data, selected }: NodeProps<LlmNodeType>) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)

  const model = data.model || LLM_MODEL_DEFAULT
  const temperature = data.temperature ?? LLM_TEMPERATURE_DEFAULT
  const thinking = data.thinking ?? false
  const result = data.result ?? ''
  const reasoning = data.reasoning ?? ''
  const running = data.running ?? false

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
    const prompt = collectUpstreamPrompt(project, id)
    if (!prompt.trim()) {
      fail('请先连接一个有内容的 Prompt / LLM 节点')
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
      const taskId = await createLlmTaskApi({
        projectId: project.id,
        nodeId: id,
        model,
        prompt,
        temperature,
        thinking,
      })
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
      <Handle type="target" position={Position.Left} className={meta.handle} style={handleStyle()} />
      <NodeHeader id={id} icon={Sparkles} title={model} selected={selected} />
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

        {/* 输出展示区 */}
        <div className="nodrag overflow-hidden rounded-md border">
          {running ? (
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-11/12" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ) : result ? (
            <div className="group/copy relative">
              <p className="max-h-64 overflow-y-auto whitespace-pre-wrap p-3 text-sm leading-relaxed">
                {result}
              </p>
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
            <div className="flex min-h-24 w-full items-center justify-center bg-muted p-3 text-[11px] text-muted-foreground">
              暂无输出
            </div>
          )}
        </div>

        <Button size="sm" onClick={handleRun} disabled={running} className="nodrag w-full">
          {running ? (thinking ? '思考中…' : '生成中…') : '运行'}
        </Button>

        {/* 生成失败信息：固定在节点最下方 */}
        {data.error && (
          <p className="nodrag rounded-md bg-destructive/10 p-2 text-[11px] text-destructive">
            {data.error}
          </p>
        )}
      </CardContent>
      <Handle type="source" position={Position.Right} className={meta.handle} style={handleStyle()} />
    </Card>
  )
}
