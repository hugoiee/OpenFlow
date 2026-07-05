import { AudioLines, Brain, Eye, Video, type LucideIcon } from 'lucide-react'
import {
  MODEL_CAPABILITY_LABELS,
  MODEL_CAPABILITY_ORDER,
  modelCapabilities,
  type ModelCapability,
} from '@/lib/modelCapabilities'
import { cn } from '@/lib/utils'

/** 能力 → 图标（顺序取自 MODEL_CAPABILITY_ORDER）。 */
const CAP_ICON: Record<ModelCapability, LucideIcon> = {
  thinking: Brain,
  image: Eye,
  audio: AudioLines,
  video: Video,
}

/**
 * 模型能力小图标：只渲染该模型**推断支持**的能力（思考/图像/音频/视频），各带中文 tooltip。
 * 供 Model 下拉的每个选项后缀展示；未命中任何能力则不渲染（返回 null）。
 */
export function ModelCapabilityBadges({ model, className }: { model: string; className?: string }) {
  const caps = modelCapabilities(model)
  const active = MODEL_CAPABILITY_ORDER.filter((k) => caps[k])
  if (active.length === 0) return null
  return (
    <span className={cn('flex items-center gap-1', className)}>
      {active.map((key) => {
        const Icon = CAP_ICON[key]
        return (
          <span
            key={key}
            title={MODEL_CAPABILITY_LABELS[key]}
            aria-label={MODEL_CAPABILITY_LABELS[key]}
            className="text-muted-foreground"
          >
            <Icon className="size-3" />
          </span>
        )
      })}
    </span>
  )
}
