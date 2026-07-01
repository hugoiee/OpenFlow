import { Clapperboard, Image as ImageIcon, Images, Type, type LucideIcon } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import {
  SEEDANCE_DURATION_DEFAULT,
  SEEDANCE_DURATION_MAX,
  SEEDANCE_DURATION_MIN,
  SEEDANCE_RATIO_DEFAULT,
  SEEDANCE_RATIO_LABELS,
  SEEDANCE_RATIO_OPTIONS,
  SEEDANCE_RESOLUTION_DEFAULT,
  SEEDANCE_RESOLUTION_OPTIONS,
  SEEDANCE_VERSION_DEFAULT,
  SEEDANCE_VERSION_OPTIONS,
  VIDEO_TASK_OPTIONS,
  deriveVideoTask,
  videoTaskSlotLabels,
  type VideoTask,
} from '@/lib/nodeCatalog'
import { collectUpstreamImages } from '@/lib/graph'
import { type GenerationNodeData } from '@/lib/types'
import { useActiveProject, useFlowStore } from '@/store/useFlowStore'
import { AudioInput } from './AudioInput'
import { ImageInput } from './ImageInput'

/** 任务 → 卡片图标。 */
const TASK_ICONS: Record<VideoTask, LucideIcon> = {
  text: Type,
  first: ImageIcon,
  firstLast: Clapperboard,
  reference: Images,
}

/**
 * 视频节点（Seedance）参数控件（右侧 Inspector 用）。
 * 顶部是 4 选 1「任务」卡片（文生 / 首帧 / 首尾帧 / 参考图）；下方按任务自适应输入图区，
 * 再是 version / 分辨率 / 时长。任务在运行时映射回后端 mode + 有序输入图（POST 契约不变）。
 */
export function VideoParams({ id, data }: { id: string; data: GenerationNodeData }) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const project = useActiveProject()

  const imagesText = data.imagesText ?? ''
  // 合并序列张数（连线 + 手动）：用于旧数据无 videoTask 时按张数还原任务
  const manualCount = imagesText.split('\n').filter((s) => s.trim()).length
  const connectedCount = project ? collectUpstreamImages(project, id).length : 0
  const task = deriveVideoTask(data.videoTask, data.mode, connectedCount + manualCount)
  const activeOption = VIDEO_TASK_OPTIONS.find((o) => o.value === task)
  const slotLabels = videoTaskSlotLabels(task)

  const version = data.version ?? SEEDANCE_VERSION_DEFAULT
  const resolution = data.resolution ?? SEEDANCE_RESOLUTION_DEFAULT
  const ratio = data.ratio ?? SEEDANCE_RATIO_DEFAULT
  const duration = data.duration ?? SEEDANCE_DURATION_DEFAULT

  return (
    <div className="flex flex-col gap-3">
      {/* 模型参数：version / 分辨率 / 宽高比 / 时长（置于生成方式之上） */}
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          version
          <Select value={version} onValueChange={(v) => updateNodeData(id, { version: v })}>
            <SelectTrigger className="w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEEDANCE_VERSION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          分辨率
          <Select value={resolution} onValueChange={(v) => updateNodeData(id, { resolution: v })}>
            <SelectTrigger className="w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEEDANCE_RESOLUTION_OPTIONS.map((r) => (
                <SelectItem key={r} value={r} className="text-xs">
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          宽高比
          <Select value={ratio} onValueChange={(v) => updateNodeData(id, { ratio: v })}>
            <SelectTrigger className="w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEEDANCE_RATIO_OPTIONS.map((r) => (
                <SelectItem key={r} value={r} className="text-xs">
                  {SEEDANCE_RATIO_LABELS[r] ?? r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>时长（秒）</span>
            <span className="font-medium text-foreground">{duration}s</span>
          </div>
          <Slider
            value={[duration]}
            min={SEEDANCE_DURATION_MIN}
            max={SEEDANCE_DURATION_MAX}
            step={1}
            onValueChange={(vals) => updateNodeData(id, { duration: vals[0] })}
            className="py-1"
          />
        </div>
      </div>

      {/* 任务选择：4 选 1 卡片 */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-muted-foreground">生成方式</span>
        <div className="grid grid-cols-2 gap-1.5">
          {VIDEO_TASK_OPTIONS.map((o) => {
            const Icon = TASK_ICONS[o.value]
            const active = task === o.value
            return (
              <button
                key={o.value}
                type="button"
                title={o.desc}
                onClick={() => updateNodeData(id, { videoTask: o.value })}
                className={`flex flex-col items-center gap-1 rounded-md border p-2 text-[11px] transition-colors ${
                  active
                    ? 'border-primary bg-primary/10 font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                <Icon className="size-4" />
                {o.label}
              </button>
            )
          })}
        </div>
        {activeOption && (
          <p className="text-[10px] leading-snug text-muted-foreground">{activeOption.desc}</p>
        )}
      </div>

      {/* 按任务自适应的输入图区：文生视频无需图；其余给画廊 / 槽位输入 */}
      {task === 'text' ? (
        <p className="rounded-md border border-dashed px-2 py-3 text-center text-[11px] text-muted-foreground">
          纯文本生成视频，无需输入图
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] text-muted-foreground">
            {slotLabels ? `输入图（${slotLabels.join(' / ')}）` : '参考图（每行一个 URL）'}
          </span>
          <ImageInput
            id={id}
            imagesText={imagesText}
            slotLabels={slotLabels}
            placeholder={
              slotLabels
                ? `输入图片 URL（顺序对应 ${slotLabels.join(' / ')}）`
                : '参考图 URL（每行一个）'
            }
          />
        </div>
      )}

      {/* 输入音频：所有任务均可挂音轨（audio_list）；上游音频素材连线只读展示，手动可传/填 */}
      <div className="flex flex-col gap-2">
        <span className="text-[11px] text-muted-foreground">输入音频（audio_list）</span>
        <AudioInput id={id} audiosText={data.audiosText ?? ''} />
      </div>
    </div>
  )
}
