import { useState } from 'react'
import { NodeResizer, type NodeProps } from '@xyflow/react'
import { Scissors } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useCompositionField } from '@/hooks/useCompositionField'
import { NodeHeader } from './NodeHeader'
import { NodeHandle } from './NodeHandle'
import {
  STORYBOARD_SEG_MAX_SECONDS,
  STORYBOARD_SEG_MIN_SECONDS,
  STORYBOARD_SPEED_OPTIONS,
  normalizeSplitSpeed,
} from '@/lib/nodeCatalog'
import { buildItems } from '@/lib/storyboard'
import { type SplitterNode as SplitterNodeType } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'
import { markCardClass } from '@/lib/nodeMark'

const DEFAULT_WIDTH = 340
const DEFAULT_HEIGHT = 360

/**
 * 脚本切割节点：粘贴整篇播客脚本原文（标题/小节标题行自动跳过），按**节点上可选的语速档位**
 * （默认 6 字/秒）切成 4~15s 的段，写进下游已连线的脚本分镜节点表格
 * （没有则自动在右侧新建一个并连线；重切=更新同一个，不堆节点）。
 * 语速只影响本节点的切分与时长估算——分镜节点只接收切好的段落，其行内重估仍走默认语速。
 */
export function SplitterNode({ id, data, selected, width, height }: NodeProps<SplitterNodeType>) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const scriptField = useCompositionField(data.script ?? '', (v) => updateNodeData(id, { script: v }))
  const roleAField = useCompositionField(data.roleAName ?? '', (v) =>
    updateNodeData(id, { roleAName: v }),
  )
  const roleBField = useCompositionField(data.roleBName ?? '', (v) =>
    updateNodeData(id, { roleBName: v }),
  )
  // 切分语速（字/秒）：旧数据/非法值归一为默认 6
  const charsPerSecond = normalizeSplitSpeed(data.charsPerSecond)
  // 上次切割结果反馈（纯 UI 态，不入库）
  const [feedback, setFeedback] = useState('')

  const handleSplit = () => {
    const script = scriptField.value
    const roleNames: [string, string] = [roleAField.value.trim(), roleBField.value.trim()]
    // 本地值兜底 + 显式提交（提交有 300ms 防抖）
    updateNodeData(id, { script, roleAName: roleNames[0], roleBName: roleNames[1] })
    let items
    try {
      items = buildItems(script, roleNames, charsPerSecond)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e))
      return
    }
    const result = useFlowStore
      .getState()
      .splitScriptToStoryboard({ splitterNodeId: id, roleAName: roleNames[0], roleBName: roleNames[1], items })
    if (!result) return
    setFeedback(`已切 ${items.length} 段 → ${result.created ? '新建' : '更新'}分镜节点`)
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
      <NodeHeader id={id} icon={Scissors} title={data.label} selected={selected} mark={data.mark} />
      {/* 右侧输出：连脚本分镜节点的「分镜表」端点（数据由「切割」动作直接写入，连线用于标识归属） */}
      <NodeHandle type="source" index={0} tone="prompt" label="分镜表" />
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2 px-3">
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
        <Textarea
          {...scriptField}
          placeholder={
            '粘贴整篇脚本原文：每行「角色名: 台词」。\n标题/小节标题行会自动跳过；无前缀的长行并入上一句。'
          }
          className="nodrag field-sizing-fixed min-h-16 w-full flex-1 resize-none font-mono text-xs leading-relaxed"
        />
        <div className="flex shrink-0 items-center gap-2">
          {/* 语速档位：原生 select（Radix 下拉在 React Flow 节点内打不开，见 MentionMenu 注释） */}
          <select
            value={charsPerSecond}
            onChange={(e) => updateNodeData(id, { charsPerSecond: Number(e.target.value) })}
            className="nodrag h-7 shrink-0 rounded-md border border-input bg-transparent px-1 text-[11px] text-foreground"
            title="切分语速（字/秒）：越快同样时长塞得下越多字，段数更少、各段字数更多"
          >
            {STORYBOARD_SPEED_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
            {feedback || `切成 ${STORYBOARD_SEG_MIN_SECONDS}~${STORYBOARD_SEG_MAX_SECONDS}s 的段`}
          </span>
          <Button size="sm" onClick={handleSplit} className="nodrag h-8 shrink-0">
            切割
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
