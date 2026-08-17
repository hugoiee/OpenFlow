import { useEffect, useRef } from 'react'
import { NodeResizer, type NodeProps } from '@xyflow/react'
import { Download, Podcast } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useCompositionField } from '@/hooks/useCompositionField'
import { NodeHeader } from './NodeHeader'
import { createPodcastTaskApi } from '@/lib/api'
import { pollTask } from '@/lib/taskPolling'
import { PODCAST_SCRIPT_PLACEHOLDER } from '@/lib/nodeCatalog'
import { buildPodcastRequest } from '@/lib/requestBody'
import { type PodcastNode as PodcastNodeType } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'
import { markCardClass } from '@/lib/nodeMark'

// 节点默认/最小尺寸：脚本编辑区需要比普通节点更大的空间（理由同 PromptNode 的显式像素尺寸）
const DEFAULT_WIDTH = 320
const DEFAULT_HEIGHT = 320

/**
 * 播客音频节点（火山 TTS）：内置双人对话脚本编辑区，运行时后端按「角色名: 台词」
 * 逐行合成（各角色用自己的火山音色 ID）并拼接成整期 WAV。
 * 角色名/音色 ID/语速在右侧 Inspector 编辑；终端节点，无连接点。
 */
export function PodcastNode({ id, data, selected, width, height }: NodeProps<PodcastNodeType>) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const scriptField = useCompositionField(data.script ?? '', (v) => updateNodeData(id, { script: v }))
  const running = data.running ?? false
  const audioUrl = data.result?.[0] ?? ''

  // 生成失败：节点底部内联显示；silent=false 时再弹窗（重连路径走 silent，避免连环 alert）
  const fail = (message: string, opts?: { silent?: boolean }) => {
    updateNodeData(id, { running: false, error: message, taskId: undefined })
    if (!opts?.silent) window.alert(`播客生成失败：${message}`)
  }

  const applyTaskResult = (
    task: { status: string; result: string[]; error?: string },
    opts?: { silent?: boolean },
  ) => {
    if (task.status === 'succeeded') {
      // result = [音频 URL, 计费字数合计]；字数解析失败时不展示
      const words = Number(task.result[1])
      updateNodeData(id, {
        running: false,
        result: task.result,
        textWords: Number.isFinite(words) && words > 0 ? words : undefined,
        taskId: undefined,
      })
    } else {
      fail(task.error || '任务失败', opts)
    }
  }

  // 刷新/重开后重连：带着未完成 taskId 载入时恢复「生成中…」并继续轮询（关页面不丢结果）
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
    if (node?.type !== 'podcast') {
      fail('未找到当前节点')
      return
    }
    // 用本地输入值兜底：脚本提交已防抖，store 里的值可能滞后
    const body = buildPodcastRequest(project, node)
    body.script = scriptField.value
    if (!body.script.trim()) {
      fail('请先填写对话脚本（每行「角色名: 台词」）')
      return
    }
    if (body.roles.some((r) => !r.voiceId)) {
      fail('请先在右侧面板填写两个角色的火山音色 ID（控制台 > 音色库复制）')
      return
    }
    updateNodeData(id, { running: true, error: undefined, result: [], taskId: undefined })
    try {
      const taskId = await createPodcastTaskApi(body)
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
      style={{ width: width || DEFAULT_WIDTH, height: height || DEFAULT_HEIGHT }}
      className={`group/node flex flex-col gap-2 py-3 shadow-sm transition-shadow ${markCardClass(data.mark, selected)}`}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={DEFAULT_WIDTH}
        minHeight={DEFAULT_HEIGHT}
        lineClassName="!border-primary/60"
        handleClassName="!size-2.5 !rounded-sm !border-2 !border-background !bg-primary"
      />
      <NodeHeader id={id} icon={Podcast} title={data.label} selected={selected} mark={data.mark} />
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2 px-3">
        {/* 对话脚本编辑区：吃掉剩余高度 */}
        <Textarea
          {...scriptField}
          placeholder={PODCAST_SCRIPT_PLACEHOLDER}
          className="nodrag field-sizing-fixed min-h-0 w-full flex-1 resize-none font-mono text-xs leading-relaxed"
        />

        {/* 结果区：生成中骨架 / 音频播放器 + 下载（同源 URL，<a download> 直接可用） */}
        {running ? (
          <div className="flex shrink-0 flex-col gap-2 rounded-md border p-3">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
            <p className="text-[11px] text-muted-foreground">逐句合成中，脚本越长耗时越久…</p>
          </div>
        ) : audioUrl ? (
          <div className="flex shrink-0 flex-col gap-1">
            <div className="flex items-center gap-1.5">
              {/* 音频没有画面可展示，preload=none 到点播放才拉流（整期播客 WAV 往往几十 MB） */}
              <audio
                controls
                preload="none"
                src={audioUrl}
                className="nodrag h-9 min-w-0 flex-1"
              />
              <Button
                asChild
                size="icon"
                variant="outline"
                className="nodrag size-9 shrink-0"
                title="下载音频"
              >
                <a href={audioUrl} download>
                  <Download className="size-4" />
                </a>
              </Button>
            </div>
            {/* usage：各句 usage.text_words 合计（火山计费口径，含标点） */}
            {typeof data.textWords === 'number' && (
              <span className="text-[10px] text-muted-foreground">
                计费字数 {data.textWords}（含标点）
              </span>
            )}
          </div>
        ) : null}

        <div className="flex shrink-0 items-center">
          <Button size="sm" onClick={handleRun} disabled={running} className="nodrag ml-auto h-8">
            {running ? '生成中…' : '生成播客'}
          </Button>
        </div>

        {data.error && (
          <p className="nodrag shrink-0 whitespace-pre-wrap rounded-md bg-destructive/10 p-2 text-[11px] text-destructive">
            {data.error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
