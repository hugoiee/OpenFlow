import { useEffect, useRef, useState } from 'react'
import { NodeResizer, type NodeProps } from '@xyflow/react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  ClipboardPaste,
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
import {
  buildItems,
  estimateSegmentDuration,
  itemsToTsv,
  parseItemsTsv,
} from '@/lib/storyboard'
import { type StoryboardItem, type StoryboardNode as StoryboardNodeType } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'

// 节点默认/最小尺寸：六列表格需要宽卡片（prompt 列要能读）
const DEFAULT_WIDTH = 760
const DEFAULT_HEIGHT = 520

/** 单段状态图标：排队沙漏 / 生成中转圈 / 完成绿勾 / 失败红叉 / 未跑空位。 */
function ItemStatusIcon({ status }: { status: StoryboardItem['status'] }) {
  if (status === 'pending') return <Clock className="size-3 shrink-0 text-muted-foreground" />
  if (status === 'running') return <Loader2 className="size-3 shrink-0 animate-spin text-primary" />
  if (status === 'done') return <Check className="size-3 shrink-0 text-emerald-500" />
  if (status === 'error') return <X className="size-3 shrink-0 text-destructive" />
  return <span className="size-3 shrink-0" />
}

/**
 * 表格一行 <tr>：序号（可编辑，改序号=把本行挪到该位置）/ 发言人（下拉切角色）/
 * 脚本（可编辑，改完自动重估时长）/ 时长（可编辑）/ 生成（状态 + 单段运行）/
 * prompt（只读可滚动，可直接选中复制）。独立组件——脚本列的 IME 防抖 hook 不能在父组件循环里创建。
 */
function StoryboardRow({
  item,
  index,
  roleNames,
  running,
  onPatch,
  onMove,
  onRun,
}: {
  item: StoryboardItem
  index: number
  /** 两个角色显示名（发言人下拉的选项）。 */
  roleNames: [string, string]
  running: boolean
  onPatch: (index: number, patch: Partial<StoryboardItem>) => void
  /** 把第 index 行挪到 targetIndex（0 基，已夹取）；running 中禁用（worker 按下标写回会错位）。 */
  onMove: (index: number, targetIndex: number) => void
  onRun: (index: number) => void
}) {
  // 脚本列：改完文本自动按语速重估时长（之后仍可手动改时长覆盖）
  const textField = useCompositionField(item.text ?? '', (v) =>
    onPatch(index, { text: v, duration: estimateSegmentDuration(v) }),
  )
  // 时长列：本地承接输入，失焦/回车时夹到 4~15 提交；外部值变化（如改脚本重估）时
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

  // 序号列：本地承接输入，失焦/回车提交=把本行挪到该位置。行组件按位置复用（key=下标），
  // 移动后本位置换了条目但 index 不变——须在 index **或 item 引用**变化时都重置回真实序号，
  // 否则输入框会留着移动前敲的旧值（数据已正确、仅显示漂移）
  const [orderLocal, setOrderLocal] = useState(String(index + 1))
  const [prevIndex, setPrevIndex] = useState(index)
  const [prevItem, setPrevItem] = useState(item)
  if (index !== prevIndex || item !== prevItem) {
    setPrevIndex(index)
    setPrevItem(item)
    setOrderLocal(String(index + 1))
  }
  const commitOrder = () => {
    const n = Number(orderLocal)
    if (Number.isFinite(n) && Math.round(n) - 1 !== index) {
      onMove(index, Math.round(n) - 1)
    } else {
      setOrderLocal(String(index + 1))
    }
  }

  return (
    <tr className="border-b align-top last:border-b-0">
      <td className="border-r px-1 py-1">
        <Input
          value={orderLocal}
          onChange={(e) => setOrderLocal(e.target.value)}
          onBlur={commitOrder}
          onKeyDown={(e) => e.key === 'Enter' && commitOrder()}
          disabled={running}
          inputMode="numeric"
          className="nodrag h-6 w-9 px-1 text-right text-[11px] tabular-nums"
          title="序号：改成几就把本行挪到第几行（生成中不可改）"
        />
      </td>
      <td className="border-r px-1 py-1">
        {/* 原生 select（Radix 下拉在 React Flow 节点内打不开，见 MentionMenu 注释） */}
        <select
          value={item.roleIndex}
          onChange={(e) => onPatch(index, { roleIndex: Number(e.target.value) })}
          className="nodrag h-6 max-w-20 rounded-md border border-input bg-transparent px-1 text-[11px] text-foreground"
          title="发言人（决定落成时连哪个角色的参考图/音色）"
        >
          <option value={0}>{roleNames[0]}</option>
          <option value={1}>{roleNames[1]}</option>
        </select>
      </td>
      <td className="border-r p-0">
        <Textarea
          {...textField}
          rows={3}
          className="nodrag field-sizing-fixed min-h-0 w-full resize-none rounded-none border-0 px-1.5 py-1 text-[11px] leading-snug shadow-none focus-visible:ring-1"
        />
      </td>
      <td className="border-r px-1 py-1">
        <Input
          value={durationLocal}
          onChange={(e) => setDurationLocal(e.target.value)}
          onBlur={commitDuration}
          onKeyDown={(e) => e.key === 'Enter' && commitDuration()}
          inputMode="numeric"
          className="nodrag h-6 w-10 px-1 text-center text-[11px] tabular-nums"
          title={`视频时长（秒，${STORYBOARD_SEG_MIN_SECONDS}~${STORYBOARD_SEG_MAX_SECONDS}）；落成时写进该段 Seedance 节点`}
        />
      </td>
      <td className="border-r px-1 py-1">
        <div className="flex items-center gap-0.5">
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
        </div>
      </td>
      <td className="p-0">
        {item.status === 'error' && item.error ? (
          <div className="nowheel max-h-24 select-text overflow-y-auto whitespace-pre-wrap break-all px-1.5 py-1 text-[10px] leading-relaxed text-destructive">
            {item.error}
          </div>
        ) : item.prompt ? (
          <div className="nowheel max-h-24 select-text overflow-y-auto whitespace-pre-wrap break-all px-1.5 py-1 text-[10px] leading-relaxed text-muted-foreground">
            {item.prompt}
          </div>
        ) : (
          <span className="px-1.5 py-1 text-[10px] text-muted-foreground/50">—</span>
        )}
      </td>
    </tr>
  )
}

/**
 * 脚本分镜节点（Excel 式表格）：表头 序号/发言人/脚本/时长/生成/prompt。
 * 表格来源三入口——上游脚本切割节点写入、本节点「粘贴脚本切分」、「从 Excel 粘贴」（TSV 导入）；
 * 「复制表格」把整表（含表头与 prompt）以 TSV 写入剪贴板，可直接粘进 Excel。
 * 「生成」逐段并发调 Agent LLM（单段可重跑），「落成节点」批量建
 * 「Prompt → Seedance(reference)」节点对并按发言人自动连参考图/音色、写入时长列。
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
  const [pasteOpen, setPasteOpen] = useState(false)
  // 工具栏操作反馈（复制/导入结果，纯 UI 态）
  const [feedback, setFeedback] = useState('')

  // 卸载时中止进行中的逐段请求（被中断的段由 runner 末尾的清扫复位为 idle）
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  const roleLabel = (roleIndex: number) =>
    (roleIndex === 0 ? roleAField.value : roleBField.value).trim() ||
    (roleIndex === 0 ? '角色A' : '角色B')

  /** 发送给 LLM 的台词行 = 「发言人: 段文本」（模板 {{line}} 的替换值）。 */
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

  // 「切分脚本 → 重建表格」：本节点粘贴入口（另两入口：上游切割节点 / 从 Excel 粘贴）
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
    state.setStoryboardItems(projectId, id, nextItems, false)
    setFeedback(`已切 ${nextItems.length} 段`)
  }

  // 「复制表格」：整表（含表头与 prompt）以 TSV 写入剪贴板，直接粘进 Excel
  const handleCopyTable = async () => {
    const tsv = itemsToTsv(items, [roleLabel(0), roleLabel(1)])
    try {
      await navigator.clipboard.writeText(tsv)
      setFeedback(`已复制 ${items.length} 行（含表头），可直接粘进 Excel`)
    } catch {
      window.alert('复制失败：浏览器拒绝了剪贴板写入')
    }
  }

  // 「从 Excel 粘贴」导入：TSV 文本 → 重建表格（列：[序号,] 发言人, 脚本 [, 时长]）
  const importTsv = (text: string) => {
    const state = useFlowStore.getState()
    const projectId = state.activeProjectId
    if (!projectId || !text.trim()) return
    try {
      const { items: nextItems, roleAName, roleBName } = parseItemsTsv(text, [
        roleAField.value,
        roleBField.value,
      ])
      updateNodeData(id, { roleAName, roleBName })
      state.setStoryboardItems(projectId, id, nextItems, false)
      setFeedback(`已导入 ${nextItems.length} 行（发言人：${roleAName} / ${roleBName}）`)
      setPasteOpen(false)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
    }
  }

  // 「生成」：对表格全部行逐段跑 LLM（整表重置状态）
  const handleGenerate = () => {
    const state = useFlowStore.getState()
    const projectId = state.activeProjectId
    if (!projectId || items.length === 0) return
    const template = templateField.value
    updateNodeData(id, { template })
    if (!ensureTemplate(template)) return
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

  // 改序号=移动行：从 store 取最新表格（防 300ms 防抖窗口内的过期快照）整表重排后写回
  const handleMoveRow = (from: number, target: number) => {
    const state = useFlowStore.getState()
    const projectId = state.activeProjectId
    if (!projectId || running) return
    const project = state.projects.find((p) => p.id === projectId)
    const node = project?.nodes.find((n) => n.id === id)
    if (node?.type !== 'storyboard') return
    const current = [...(node.data.items ?? [])]
    if (from < 0 || from >= current.length) return
    const to = Math.min(current.length - 1, Math.max(0, target))
    const [moved] = current.splice(from, 1)
    current.splice(to, 0, moved)
    state.setStoryboardItems(projectId, id, current, false)
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
        minWidth={560}
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
        {/* 角色名 + Excel 互通工具栏 */}
        <div className="flex shrink-0 items-center gap-1.5">
          <Input
            {...roleAField}
            placeholder="角色A"
            className="nodrag h-7 w-24 text-xs"
            title="角色 1 名字"
          />
          <Input
            {...roleBField}
            placeholder="角色B"
            className="nodrag h-7 w-24 text-xs"
            title="角色 2 名字"
          />
          <span className="min-w-0 flex-1 truncate text-right text-[10px] text-muted-foreground">
            {feedback}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopyTable}
            disabled={items.length === 0}
            className="nodrag h-7 gap-1 px-2 text-xs"
            title="把整张表（含表头与 prompt 列）以制表符分隔复制到剪贴板，可直接粘进 Excel"
          >
            <ClipboardCopy className="size-3" />
            复制表格
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPasteOpen((v) => !v)}
            className="nodrag h-7 gap-1 px-2 text-xs"
            title="从 Excel 复制行后粘到输入区导入（列：[序号,] 发言人, 脚本 [, 时长]）"
          >
            <ClipboardPaste className="size-3" />
            从 Excel 粘贴
          </Button>
        </div>

        {/* 从 Excel 粘贴导入区：粘贴即导入（onPaste 拦截），也可手动编辑后点导入 */}
        {pasteOpen && (
          <div className="flex shrink-0 flex-col gap-1 rounded-md border border-dashed p-2">
            <Textarea
              placeholder={
                '在 Excel 里复制行后，在此按 Ctrl/Cmd+V 直接导入。\n列约定（Tab 分隔）：[序号,] 发言人, 脚本 [, 时长]；表头行自动跳过。'
              }
              rows={3}
              onPaste={(e) => {
                e.preventDefault()
                importTsv(e.clipboardData.getData('text/plain'))
              }}
              onChange={() => {}}
              value=""
              className="nodrag field-sizing-fixed w-full resize-none font-mono text-[10px] leading-relaxed"
            />
          </div>
        )}

        {/* 粘贴脚本入口（默认收起；表格另两入口：上游脚本切割节点 / 从 Excel 粘贴） */}
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
              placeholder="每段台词实际发送给 LLM 的完整 prompt；{{line}} 会被替换为「发言人: 段文本」，{{duration}}（可选）替换为该段时长秒数，无其他包装"
              className="nodrag nowheel field-sizing-fixed h-36 w-full resize-none font-mono text-[10px] leading-relaxed"
            />
          )}
        </div>

        {/* 分镜表格：序号 / 发言人 / 脚本（可编辑）/ 时长（可编辑）/ 生成 / prompt */}
        {items.length > 0 ? (
          <div className="nodrag nowheel min-h-0 flex-1 overflow-auto rounded-md border">
            <table className="w-full border-collapse text-[11px]">
              <thead className="sticky top-0 z-10 bg-muted">
                <tr className="text-left text-[10px] text-muted-foreground">
                  <th className="w-9 border-b border-r px-1.5 py-1 text-right font-medium">序号</th>
                  <th className="w-14 border-b border-r px-1.5 py-1 font-medium">发言人</th>
                  <th className="min-w-44 border-b border-r px-1.5 py-1 font-medium">脚本</th>
                  <th className="w-13 border-b border-r px-1.5 py-1 font-medium">时长</th>
                  <th className="w-13 border-b border-r px-1.5 py-1 font-medium">生成</th>
                  <th className="min-w-44 border-b px-1.5 py-1 font-medium">prompt</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <StoryboardRow
                    key={i}
                    item={it}
                    index={i}
                    roleNames={[roleLabel(0), roleLabel(1)]}
                    running={running}
                    onPatch={handlePatchRow}
                    onMove={handleMoveRow}
                    onRun={handleRunRow}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed text-[11px] text-muted-foreground">
            表格为空：连上游「脚本切割」节点点切割、展开「粘贴脚本切分」、或「从 Excel 粘贴」导入
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
