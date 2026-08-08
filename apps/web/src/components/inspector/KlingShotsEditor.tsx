import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ToggleRow } from '@/components/inspector/ToggleRow'
import { useCompositionField } from '@/hooks/useCompositionField'
import { KLING_SHOT_DURATION_MIN, KLING_SHOT_MAX } from '@/lib/nodeCatalog'
import { type GenerationNodeData } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'
import type { VideoShot } from '@openflow/shared'
import { Plus, X } from 'lucide-react'

/**
 * 可灵多镜头（config.multi_shot）分镜编辑器。
 * 开启后不再下发顶层 prompt——画面描述改由这里逐段给出，以 multi_prompt 数组发送
 * （index 由后端按数组序生成）。上游约束：最多 6 段、每段 ≥1s、各段之和 = 任务总时长。
 *
 * 「之和 = 总时长」只提示不强改：用户加一段时和值必然先对不上，
 * 中途替他把别人的时长挪来挪去比让他自己配平更烦人。
 */
export function KlingShotsEditor({
  id,
  data,
  totalDuration,
}: {
  id: string
  data: GenerationNodeData
  totalDuration: number
}) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const enabled = Boolean(data.multiShot)
  const shots = data.shots ?? []
  const sum = shots.reduce((acc, s) => acc + (s.duration || 0), 0)
  const balanced = sum === totalDuration

  const writeShots = (next: VideoShot[]) => updateNodeData(id, { shots: next })
  const patchShot = (index: number, patch: Partial<VideoShot>) =>
    writeShots(shots.map((s, i) => (i === index ? { ...s, ...patch } : s)))

  const addShot = () => {
    // 新段默认吃掉剩余时长（配平后就不用再手动改），剩余不足则给最小值
    const rest = Math.max(KLING_SHOT_DURATION_MIN, totalDuration - sum)
    writeShots([...shots, { prompt: '', duration: rest }])
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <ToggleRow
        label="多镜头分镜"
        title="config.multi_shot：开启后不发 prompt，改用下面的分镜逐段描述画面"
        value={enabled}
        onChange={(v) => {
          // 首次开启时先落一段，免得开了却是空列表（那样会被后端退回单镜头）
          updateNodeData(id, {
            multiShot: v,
            ...(v && shots.length === 0
              ? { shots: [{ prompt: '', duration: totalDuration }] }
              : {}),
          })
        }}
      />

      {enabled && (
        <div className="flex flex-col gap-2">
          <div
            className={`text-[11px] ${balanced ? 'text-muted-foreground' : 'text-destructive'}`}
          >
            {shots.length}/{KLING_SHOT_MAX} 段 · 时长合计 {sum}s / 总时长 {totalDuration}s
            {!balanced && '（上游要求两者相等）'}
          </div>

          {shots.map((shot, i) => (
            <ShotRow
              key={i}
              index={i}
              shot={shot}
              onPrompt={(prompt) => patchShot(i, { prompt })}
              onDuration={(duration) => patchShot(i, { duration })}
              onRemove={() => writeShots(shots.filter((_, j) => j !== i))}
            />
          ))}

          {shots.length < KLING_SHOT_MAX && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addShot}
              className="nodrag h-7 text-xs"
            >
              <Plus className="size-3.5" />
              添加分镜
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/** 单段分镜：序号 + 时长输入 + 删除 + 画面描述（IME 防抖走 useCompositionField）。 */
function ShotRow({
  index,
  shot,
  onPrompt,
  onDuration,
  onRemove,
}: {
  index: number
  shot: VideoShot
  onPrompt: (v: string) => void
  onDuration: (v: number) => void
  onRemove: () => void
}) {
  const field = useCompositionField(shot.prompt, onPrompt)
  return (
    <div className="flex flex-col gap-1 rounded-md border p-2">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">分镜 {index + 1}</span>
        <label className="ml-auto flex items-center gap-1">
          时长
          <input
            type="number"
            min={KLING_SHOT_DURATION_MIN}
            step={1}
            value={shot.duration}
            onChange={(e) =>
              onDuration(Math.max(KLING_SHOT_DURATION_MIN, Math.round(Number(e.target.value)) || KLING_SHOT_DURATION_MIN))
            }
            className="nodrag h-6 w-14 rounded-md border bg-transparent px-1 text-right text-xs"
          />
          s
        </label>
        <button
          type="button"
          title="删除该分镜"
          onClick={onRemove}
          className="nodrag rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <Textarea
        {...field}
        rows={2}
        placeholder={`分镜 ${index + 1} 的画面描述`}
        className="nodrag min-h-0 resize-none text-xs"
      />
    </div>
  )
}
