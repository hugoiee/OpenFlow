import { useEffect, useRef, useState } from 'react'
import { NodeResizer, type NodeProps } from '@xyflow/react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  ListVideo,
  Loader2,
  Play,
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
import {
  STORYBOARD_SEGMENTS_HANDLE,
  storyboardRoleAudioHandleId,
  storyboardRoleImageHandleId,
} from '@/lib/graph'
import {
  STORYBOARD_CONCURRENCY,
  STORYBOARD_SCRIPT_PLACEHOLDER,
  STORYBOARD_SEG_MAX_SECONDS,
  STORYBOARD_SEG_MIN_SECONDS,
} from '@/lib/nodeCatalog'
import { buildItems, estimateSegmentDuration } from '@/lib/storyboard'
import { type StoryboardItem, type StoryboardNode as StoryboardNodeType } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'

// 节点默认/最小尺寸：分镜表格 + 折叠区需要比普通节点更大的空间
const DEFAULT_WIDTH = 460
const DEFAULT_HEIGHT = 480

/** 单段状态图标：排队沙漏 / 生成中转圈 / 完成绿勾 / 失败红叉 / 未跑空位。 */
function ItemStatusIcon({ status }: { status: StoryboardItem['status'] }) {
  if (status === 'pending') return <Clock className="size-3 shrink-0 text-muted-foreground" />
  if (status === 'running') return <Loader2 className="size-3 shrink-0 animate-spin text-primary" />
  if (status === 'done') return <Check className="size-3 shrink-0 text-emerald-500" />
  if (status === 'error') return <X className="size-3 shrink-0 text-destructive" />
  return <span className="size-3 shrink-0" />
}

/**
 * 分镜表格的一行：A 角色徽标 / B 段文本（可编辑，改完自动重估 C）/ C 时长（可编辑）/
 * D 状态 + 单段运行/查看。独立组件——B 列的 IME 防抖 hook 不能在父组件循环里创建。
 */
function StoryboardRow({
  item,
  index,
  roleName,
  running,
  expanded,
  onPatch,
  onRun,
  onToggleExpand,
}: {
  item: StoryboardItem
  index: number
  roleName: string
  running: boolean
  expanded: boolean
  onPatch: (index: number, patch: Partial<StoryboardItem>) => void
  onRun: (index: number) => void
  onToggleExpand: (index: number) => void
}) {
  // B 列：改完文本自动按语速重估 C 列时长（之后仍可手动改 C 覆盖）
  const textField = useCompositionField(item.text ?? '', (v) =>
    onPatch(index, { text: v, duration: estimateSegmentDuration(v) }),
  )
  // C 列：本地承接输入，失焦/回车时夹到 4~15 提交；外部值变化（如改 B 列重估）时
  // 用「渲染期对比上次 prop」的官方派生模式同步回本地（effect 里 setState 会被 lint 拦）
  const [durationLocal, setDurationLocal] = useState(String(item.duration ?? ''))
  const [prevDuration, setPrevDuration] = useState(item.duration)
  if (item.duration !== prevDuration) {
    setPrevDuration(item.duration)
    setDurationLocal(String(item.duration ?? ''))
  }
  const commitDuration = () => {
    const n = Number(durationLocal)
    const clamped = Number.isFinite(n)
      ? Math.min(STORYBOARD_SEG_MAX_SECONDS, Math.max(STORYBOARD_SEG_MIN_SECONDS, Math.round(n)))
      : (item.duration ?? STORYBOARD_SEG_MIN_SECONDS)
    setDurationLocal(String(clamped))
    if (clamped !== item.duration) onPatch(index, { duration: clamped })
  }

  return (
    <div className="border-b px-2 py-1.5 text-[11px] last:border-b-0">
      <div className="flex items-start gap-1.5">
        <span className="mt-1 w-5 shrink-0 text-right text-muted-foreground">{index + 1}</span>
        <span className="mt-1 max-w-16 shrink-0 truncate rounded bg-muted px-1 text-[10px] text-muted-foreground">
          {roleName}
        </span>
        <Textarea
          {...textField}
          rows={2}
          className="nodrag field-sizing-fixed min-h-0 flex-1 resize-none px-1.5 py-1 text-[11px] leading-snug"
        />
        <div className="flex shrink-0 items-center gap-1">
          <Input
            value={durationLocal}
            onChange={(e) => setDurationLocal(e.target.value)}
            onBlur={commitDuration}
            onKeyDown={(e) => e.key === 'Enter' && commitDuration()}
            inputMode="numeric"
            className="nodrag h-6 w-10 px-1 text-center text-[11px] tabular-nums"
            title={`视频时长（秒，${STORYBOARD_SEG_MIN_SECONDS}~${STORYBOARD_SEG_MAX_SECONDS}）；落成时写进该段 Seedance 节点`}
          />
          <span className="text-[10px] text-muted-foreground">s</span>
        </div>
        <div className="mt-1 flex shrink-0 items-center gap-1">
          <ItemStatusIcon status={item.status} />
          {!running && (
            <Button
              size="icon"
              variant="ghost"
              className="size-5"
              title={item.status === 'done' || item.status === 'error' ? '重新生成本段' : '生成本段'}
              onClick={() => onRun(index)}
            >
              {item.status === 'done' || item.status === 'error' ? (
                <RotateCcw className="size-3" />
              ) : (
                <Play className="size-3" />
              )}
            </Button>
          )}
          {item.status === 'done' && item.prompt && (
            <button
              type="button"
              className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground"
              onClick={() => onToggleExpand(index)}
            >
              {expanded ? '收起' : '查看'}
            </button>
          )}
        </div>
      </div>
      {item.status === 'error' && item.error && (
        <p className="mt-1 whitespace-pre-wrap break-all pl-7 text-[10px] text-destructive">
          {item.error}
        </p>
      )}
      {item.status === 'done' && item.prompt && expanded && (
        <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-1.5 pl-2 font-sans text-[10px] leading-relaxed text-muted-foreground">
          {item.prompt}
        </pre>
      )}
    </div>
  )
}

/**
 * 脚本分镜节点（表格形态）：A 说话人 / B 分割后脚本（可编辑）/ C 时长（可编辑）/
 * D LLM 产出的 prompt。表格来源双入口——上游脚本切割节点写入，或本节点「粘贴脚本」区切分。
 * 「生成」逐段并发调 Agent LLM（单段可重跑），「落成节点」批量建
 * 「Prompt → Seedance(reference)」节点对并按说话人自动连参考图/音色、写入 C 列时长。
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

  const [scriptOpen, setScriptOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  // 卸载时中止进行中的逐段请求（被中断的段由 runner 末尾的清扫复位为 idle）
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  const roleLabel = (roleIndex: number) =>
    (roleIndex === 0 ? roleAField.value : roleBField.value).trim() ||
    (roleIndex === 0 ? '角色A' : '角色B')

  /** 发送给 LLM 的台词行 = 「角色名: 段文本」（模板 {{line}} 的替换值）。 */
  const composeLine = (it: StoryboardItem) => `${roleLabel(it.roleIndex)}: ${it.text}`

  /**
   * 逐段并发 runner：worker 池共享游标，同时最多 STORYBOARD_CONCURRENCY 段在请求。
   * 所有写入走 store 的 patchStoryboardItem（set 时刻读最新 items 改一格）——组件里整表回写
   * 会让并发完成的段互相覆盖。projectId 显式传入，切画布/关面板也不丢写。
   */
  const runIndices = async (
    projectId: string,
    template: string,
    rows: StoryboardItem[],
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
          // {{duration}} 为可选占位符：让 LLM 知道该段的目标视频时长；{{line}} 由后端替换
          const rowTemplate = template.replaceAll(
            '{{duration}}',
            String(rows[idx].duration ?? ''),
          )
          const prompt = await agentExpandApi(
            { template: rowTemplate, line: composeLine(rows[idx]) },
            controller.signal,
          )
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
    // 被中止的段（还停在 pending/running）复位为 idle，避免僵尸态
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

  /** 模板校验（生成前置检查，缺 {{line}} 时 alert 并返回 false）。 */
  const ensureTemplate = (template: string) => {
    if (template.includes('{{line}}')) return true
    window.alert('prompt 里缺少 {{line}} 占位符（代表台词行），请展开「发送给 LLM 的 prompt」检查')
    return false
  }

  // 「切分脚本 → 重建表格」：本节点粘贴入口（另一入口是上游脚本切割节点）
  const handleSplitScript = () => {
    const state = useFlowStore.getState()
    const projectId = state.activeProjectId
    if (!projectId) return
    const script = scriptField.value
    const roleNames: [string, string] = [roleAField.value.trim(), roleBField.value.trim()]
    updateNodeData(id, { script, roleAName: roleNames[0], roleBName: roleNames[1] })
    let nextItems: StoryboardItem[]
    try {
      nextItems = buildItems(script, roleNames)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
      return
    }
    setExpanded(new Set())
    state.setStoryboardItems(projectId, id, nextItems, false)
  }

  // 「生成」：对表格全部行逐段跑 LLM（整表重置状态）
  const handleGenerate = () => {
    const state = useFlowStore.getState()
    const projectId = state.activeProjectId
    if (!projectId || items.length === 0) return
    const template = templateField.value
    updateNodeData(id, { template })
    if (!ensureTemplate(template)) return
    setExpanded(new Set())
    state.updateNodeDataInProject(projectId, id, { running: true })
    void runIndices(
      projectId,
      template,
      items,
      items.map((_, i) => i),
    )
  }

  // 单段生成/重跑（非 running 态）
  const handleRunRow = (index: number) => {
    const state = useFlowStore.getState()
    const projectId = state.activeProjectId
    if (!projectId || running) return
    const template = templateField.value
    if (!ensureTemplate(template)) return
    state.updateNodeDataInProject(projectId, id, { running: true })
    void runIndices(projectId, template, items, [index])
  }

  // 落成节点：已生成的段 → N 组「Prompt → Seedance」节点对（不自动运行视频生成）
  const handleMaterialize = () => {
    const addStoryboardShots = useFlowStore.getState().addStoryboardShots
    const shots = items
      .filter((it) => it.status === 'done' && it.prompt)
      .map((it) => ({
        line: composeLine(it),
        roleIndex: it.roleIndex,
        prompt: it.prompt!,
        duration: it.duration,
      }))
    const n = addStoryboardShots({ storyboardNodeId: id, shots })
    if (n > 0) {
      window.alert(`已在画布下方创建 ${n} 组「Prompt → Seedance」分镜节点（未自动运行）`)
    }
  }

  const handlePatchRow = (index: number, patch: Partial<StoryboardItem>) => {
    const state = useFlowStore.getState()
    if (state.activeProjectId) state.patchStoryboardItem(state.activeProjectId, id, index, patch)
  }

  const toggleExpanded = (index: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  return (
    <Card
      style={{ width: width || DEFAULT_WIDTH, height: height || DEFAULT_HEIGHT }}
      className={`group/node flex flex-col gap-2 py-3 shadow-sm transition-shadow ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={420}
        minHeight={400}
        lineClassName="!border-primary/60"
        handleClassName="!size-2.5 !rounded-sm !border-2 !border-background !bg-primary"
      />
      <NodeHeader id={id} icon={ListVideo} title={data.label} selected={selected} />
      {/* 左侧端点：分镜表（上游脚本切割节点连入）+ 角色参考图×2 + 角色音色×2 */}
      <NodeHandle
        type="target"
        id={STORYBOARD_SEGMENTS_HANDLE}
        index={0}
        tone="prompt"
        label="分镜表"
      />
      <NodeHandle
        type="target"
        id={storyboardRoleImageHandleId(0)}
        index={1}
        tone="image"
        label={`${roleLabel(0)} 参考图`}
      />
      <NodeHandle
        type="target"
        id={storyboardRoleImageHandleId(1)}
        index={2}
        tone="image"
        label={`${roleLabel(1)} 参考图`}
      />
      <NodeHandle
        type="target"
        id={storyboardRoleAudioHandleId(0)}
        index={3}
        tone="audio"
        label={`${roleLabel(0)} 音色`}
      />
      <NodeHandle
        type="target"
        id={storyboardRoleAudioHandleId(1)}
        index={4}
        tone="audio"
        label={`${roleLabel(1)} 音色`}
      />
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2 px-3">
        {/* 两个角色名：表格 A 列展示 + 发送行「角色名: 段文本」+ 端点标签 */}
        <div className="flex shrink-0 items-center gap-1.5">
          <Input
            {...roleAField}
            placeholder="角色A"
            className="nodrag h-7 flex-1 text-xs"
            title="角色 1 名字"
          />
          <Input
            {...roleBField}
            placeholder="角色B"
            className="nodrag h-7 flex-1 text-xs"
            title="角色 2 名字"
          />
        </div>

        {/* 粘贴脚本入口（默认收起；另一入口是上游脚本切割节点） */}
        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            onClick={() => setScriptOpen((v) => !v)}
            className="nodrag flex items-center gap-1 self-start text-[11px] text-muted-foreground hover:text-foreground"
          >
            {scriptOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            粘贴脚本切分（或连上游「脚本切割」节点）
          </button>
          {scriptOpen && (
            <>
              <Textarea
                {...scriptField}
                placeholder={STORYBOARD_SCRIPT_PLACEHOLDER}
                className="nodrag nowheel field-sizing-fixed h-28 w-full resize-none font-mono text-xs leading-relaxed"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleSplitScript}
                disabled={running}
                className="nodrag h-7 self-end text-xs"
                title="按语速（约 6 字/秒）切成 4~15s 的段，重建下方表格（已生成的 prompt 会清空）"
              >
                切分脚本 → 重建表格
              </Button>
            </>
          )}
        </div>

        {/* 发送给 LLM 的 prompt：默认收起（长文本会占满卡片） */}
        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            onClick={() => setTemplateOpen((v) => !v)}
            className="nodrag flex items-center gap-1 self-start text-[11px] text-muted-foreground hover:text-foreground"
          >
            {templateOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            发送给 LLM 的 prompt（{'{{line}}'} 替换为台词行后原样发出）
          </button>
          {templateOpen && (
            <Textarea
              {...templateField}
              placeholder="每段台词实际发送给 LLM 的完整 prompt；{{line}} 会被替换为「角色名: 段文本」，{{duration}}（可选）替换为该段时长秒数，无其他包装"
              className="nodrag nowheel field-sizing-fixed h-36 w-full resize-none font-mono text-[10px] leading-relaxed"
            />
          )}
        </div>

        {/* 分镜表格：A 说话人 / B 段文本（可编辑）/ C 时长（可编辑）/ D 状态与 prompt */}
        {items.length > 0 ? (
          <div className="nodrag nowheel min-h-0 flex-1 overflow-y-auto rounded-md border">
            {items.map((it, i) => (
              <StoryboardRow
                key={i}
                item={it}
                index={i}
                roleName={roleLabel(it.roleIndex)}
                running={running}
                expanded={expanded.has(i)}
                onPatch={handlePatchRow}
                onRun={handleRunRow}
                onToggleExpand={toggleExpanded}
              />
            ))}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed text-[11px] text-muted-foreground">
            表格为空：连上游「脚本切割」节点点切割，或展开上方「粘贴脚本切分」
          </div>
        )}

        {/* 操作区：进度 + 两个按钮 */}
        <div className="flex shrink-0 items-center gap-2">
          {items.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {doneCount}/{items.length} 段已生成
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={handleMaterialize}
              disabled={running || doneCount === 0}
              className="nodrag h-8"
              title="为每段已生成的 prompt 创建一组「Prompt → Seedance 视频」节点，自动连参考图/音色并写入时长（不自动运行）"
            >
              落成节点
            </Button>
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={running || items.length === 0}
              className="nodrag h-8"
            >
              {running ? '生成中…' : '生成'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
