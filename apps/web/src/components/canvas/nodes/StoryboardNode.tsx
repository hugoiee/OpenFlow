import { useEffect, useRef, useState } from 'react'
import { NodeResizer, type NodeProps } from '@xyflow/react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  ListVideo,
  Loader2,
  RotateCcw,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useCompositionField } from '@/hooks/useCompositionField'
import { NodeHeader } from './NodeHeader'
import { NodeHandle } from './NodeHandle'
import { agentExpandApi } from '@/lib/api'
import { storyboardRoleAudioHandleId, storyboardRoleImageHandleId } from '@/lib/graph'
import { STORYBOARD_CONCURRENCY, STORYBOARD_SCRIPT_PLACEHOLDER } from '@/lib/nodeCatalog'
import { buildItems } from '@/lib/storyboard'
import { type StoryboardItem, type StoryboardNode as StoryboardNodeType } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'

// 节点默认/最小尺寸：脚本编辑区 + 逐行进度列表需要比普通节点更大的空间
const DEFAULT_WIDTH = 380
const DEFAULT_HEIGHT = 480

/** 单行状态图标：排队沙漏 / 生成中转圈 / 完成绿勾 / 失败红叉 / 未跑空位。 */
function ItemStatusIcon({ status }: { status: StoryboardItem['status'] }) {
  if (status === 'pending') return <Clock className="size-3 shrink-0 text-muted-foreground" />
  if (status === 'running') return <Loader2 className="size-3 shrink-0 animate-spin text-primary" />
  if (status === 'done') return <Check className="size-3 shrink-0 text-emerald-500" />
  if (status === 'error') return <X className="size-3 shrink-0 text-destructive" />
  return <span className="size-3 shrink-0" />
}

/**
 * 脚本分镜节点：整篇双人播客脚本 + prompt 模板（{{line}} 占位符），逐行并发调 Agent LLM
 * 生成 Seedance 口播 prompt（单行可重试），再一键落成 N 组「Prompt → Seedance 视频」节点对。
 * 左侧两个图像端点各连一张角色人像参考图，落成时按行首说话人自动连给对应视频节点。
 */
export function StoryboardNode({
  id,
  data,
  selected,
  width,
  height,
}: NodeProps<StoryboardNodeType>) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const scriptField = useCompositionField(data.script ?? '', (v) => updateNodeData(id, { script: v }))
  const templateField = useCompositionField(data.template ?? '', (v) =>
    updateNodeData(id, { template: v }),
  )
  const roleAField = useCompositionField(data.roleAName ?? '', (v) =>
    updateNodeData(id, { roleAName: v }),
  )
  const roleBField = useCompositionField(data.roleBName ?? '', (v) =>
    updateNodeData(id, { roleBName: v }),
  )
  const running = data.running ?? false
  const items = data.items ?? []
  const doneCount = items.filter((it) => it.status === 'done' && it.prompt).length

  const [templateOpen, setTemplateOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  // 卸载时中止进行中的逐行请求（被中断的行由 runner 末尾的清扫复位为 idle）
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  /**
   * 逐行并发 runner：worker 池共享游标，同时最多 STORYBOARD_CONCURRENCY 行在请求。
   * 所有写入走 store 的 patchStoryboardItem（set 时刻读最新 items 改一格）——组件里整表回写
   * 会让并发完成的行互相覆盖。projectId 显式传入，切画布/关面板也不丢写。
   */
  const runIndices = async (
    projectId: string,
    template: string,
    lines: StoryboardItem[],
    indices: number[],
  ) => {
    const controller = new AbortController()
    abortRef.current = controller
    const store = () => useFlowStore.getState()
    for (const idx of indices) {
      store().patchStoryboardItem(projectId, id, idx, { status: 'pending', error: undefined })
    }
    let cursor = 0
    const worker = async () => {
      while (!controller.signal.aborted) {
        const my = cursor++
        if (my >= indices.length) return
        const idx = indices[my]
        store().patchStoryboardItem(projectId, id, idx, { status: 'running' })
        try {
          const prompt = await agentExpandApi({ template, line: lines[idx].line }, controller.signal)
          store().patchStoryboardItem(projectId, id, idx, {
            status: 'done',
            prompt,
            error: undefined,
          })
        } catch (e) {
          if (controller.signal.aborted) return
          store().patchStoryboardItem(projectId, id, idx, {
            status: 'error',
            error: e instanceof Error ? e.message : String(e),
          })
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(STORYBOARD_CONCURRENCY, indices.length) }, worker),
    )
    // 被中止的行（还停在 pending/running）复位为 idle，避免僵尸态
    if (controller.signal.aborted) {
      const project = store().projects.find((p) => p.id === projectId)
      const node = project?.nodes.find((n) => n.id === id)
      if (node?.type === 'storyboard') {
        node.data.items?.forEach((it, idx) => {
          if (it.status === 'pending' || it.status === 'running') {
            store().patchStoryboardItem(projectId, id, idx, { status: 'idle' })
          }
        })
      }
    }
    store().updateNodeDataInProject(projectId, id, { running: false })
  }

  // 整表生成：拆行重建 items → 全部下标丢进 runner
  const handleGenerate = () => {
    const state = useFlowStore.getState()
    const projectId = state.activeProjectId
    if (!projectId) return
    // 用本地输入值兜底（提交有 300ms 防抖，store 里的值可能滞后）并显式提交
    const script = scriptField.value
    const template = templateField.value
    const roleNames: [string, string] = [roleAField.value.trim(), roleBField.value.trim()]
    updateNodeData(id, {
      script,
      template,
      roleAName: roleNames[0],
      roleBName: roleNames[1],
    })
    if (!template.includes('{{line}}')) {
      window.alert('模板里缺少 {{line}} 占位符（代表台词行），请点「模板」检查')
      return
    }
    let nextItems: StoryboardItem[]
    try {
      nextItems = buildItems(script, roleNames)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
      return
    }
    setExpanded(new Set())
    state.setStoryboardItems(projectId, id, nextItems, true)
    void runIndices(
      projectId,
      template,
      nextItems,
      nextItems.map((_, i) => i),
    )
  }

  // 单行重试（非 running 态、该行 error 时可用）
  const handleRetry = (index: number) => {
    const state = useFlowStore.getState()
    const projectId = state.activeProjectId
    if (!projectId || running) return
    state.updateNodeDataInProject(projectId, id, { running: true })
    void runIndices(projectId, templateField.value, items, [index])
  }

  // 落成节点：已生成的行 → N 组「Prompt → Seedance」节点对（不自动运行视频生成）
  const handleMaterialize = () => {
    const addStoryboardShots = useFlowStore.getState().addStoryboardShots
    const shots = items
      .filter((it) => it.status === 'done' && it.prompt)
      .map((it) => ({ line: it.line, roleIndex: it.roleIndex, prompt: it.prompt! }))
    const n = addStoryboardShots({ storyboardNodeId: id, shots })
    if (n > 0) {
      window.alert(`已在画布下方创建 ${n} 组「Prompt → Seedance」分镜节点（未自动运行）`)
    }
  }

  const toggleExpanded = (index: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const roleLabel = (roleIndex: number) =>
    (roleIndex === 0 ? roleAField.value : roleBField.value).trim() || (roleIndex === 0 ? '角色A' : '角色B')

  return (
    <Card
      style={{ width: width || DEFAULT_WIDTH, height: height || DEFAULT_HEIGHT }}
      className={`group/node flex flex-col gap-2 py-3 shadow-sm transition-shadow ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={340}
        minHeight={400}
        lineClassName="!border-primary/60"
        handleClassName="!size-2.5 !rounded-sm !border-2 !border-background !bg-primary"
      />
      <NodeHeader id={id} icon={ListVideo} title={data.label} selected={selected} />
      {/* 左侧角色端点（参考图×2 + 音色参考×2）：落成时按行首说话人连给对应视频节点 */}
      <NodeHandle
        type="target"
        id={storyboardRoleImageHandleId(0)}
        index={0}
        tone="image"
        label={`${roleLabel(0)} 参考图`}
      />
      <NodeHandle
        type="target"
        id={storyboardRoleImageHandleId(1)}
        index={1}
        tone="image"
        label={`${roleLabel(1)} 参考图`}
      />
      <NodeHandle
        type="target"
        id={storyboardRoleAudioHandleId(0)}
        index={2}
        tone="audio"
        label={`${roleLabel(0)} 音色`}
      />
      <NodeHandle
        type="target"
        id={storyboardRoleAudioHandleId(1)}
        index={3}
        tone="audio"
        label={`${roleLabel(1)} 音色`}
      />
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2 px-3">
        {/* 两个角色名：脚本行首按此匹配说话人（同播客节点语义） */}
        <div className="flex shrink-0 items-center gap-1.5">
          <Input
            {...roleAField}
            placeholder="角色A"
            className="nodrag h-7 flex-1 text-xs"
            title="角色 1 名字（脚本行首匹配）"
          />
          <Input
            {...roleBField}
            placeholder="角色B"
            className="nodrag h-7 flex-1 text-xs"
            title="角色 2 名字（脚本行首匹配）"
          />
        </div>

        {/* 脚本编辑区 */}
        <Textarea
          {...scriptField}
          placeholder={STORYBOARD_SCRIPT_PLACEHOLDER}
          className="nodrag field-sizing-fixed min-h-16 w-full flex-1 resize-none font-mono text-xs leading-relaxed"
        />

        {/* prompt 模板：默认收起（长模板会占满卡片） */}
        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            onClick={() => setTemplateOpen((v) => !v)}
            className="nodrag flex items-center gap-1 self-start text-[11px] text-muted-foreground hover:text-foreground"
          >
            {templateOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            模板（用 {'{{line}}'} 代表台词行）
          </button>
          {templateOpen && (
            <Textarea
              {...templateField}
              placeholder="prompt 模板，{{line}} 会被替换为台词行原文"
              className="nodrag nowheel field-sizing-fixed h-36 w-full resize-none font-mono text-[10px] leading-relaxed"
            />
          )}
        </div>

        {/* 逐行进度列表 */}
        {items.length > 0 && (
          <div className="nodrag nowheel min-h-0 flex-1 overflow-y-auto rounded-md border">
            {items.map((it, i) => (
              <div key={i} className="border-b px-2 py-1.5 text-[11px] last:border-b-0">
                <div className="flex items-center gap-1.5">
                  <ItemStatusIcon status={it.status} />
                  <span className="shrink-0 text-muted-foreground">{i + 1}</span>
                  <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                    {roleLabel(it.roleIndex)}
                  </span>
                  <span className="min-w-0 flex-1 truncate" title={it.line}>
                    {it.line}
                  </span>
                  {it.status === 'error' && !running && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-5 shrink-0"
                      title="重试本行"
                      onClick={() => handleRetry(i)}
                    >
                      <RotateCcw className="size-3" />
                    </Button>
                  )}
                  {it.status === 'done' && it.prompt && (
                    <button
                      type="button"
                      className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground"
                      onClick={() => toggleExpanded(i)}
                    >
                      {expanded.has(i) ? '收起' : '查看'}
                    </button>
                  )}
                </div>
                {it.status === 'error' && it.error && (
                  <p className="mt-1 whitespace-pre-wrap break-all pl-4 text-[10px] text-destructive">
                    {it.error}
                  </p>
                )}
                {it.status === 'done' && it.prompt && expanded.has(i) && (
                  <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-1.5 pl-2 font-sans text-[10px] leading-relaxed text-muted-foreground">
                    {it.prompt}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 操作区：生成进度 + 两个按钮 */}
        <div className="flex shrink-0 items-center gap-2">
          {items.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {doneCount}/{items.length} 行已生成
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={handleMaterialize}
              disabled={running || doneCount === 0}
              className="nodrag h-8"
              title="为每行已生成的 prompt 创建一组「Prompt → Seedance 视频」节点并自动连参考图（不自动运行）"
            >
              落成节点
            </Button>
            <Button size="sm" onClick={handleGenerate} disabled={running} className="nodrag h-8">
              {running ? '生成中…' : '生成'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
