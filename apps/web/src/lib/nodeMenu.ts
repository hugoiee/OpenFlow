import { Type, Image as ImageIcon, Banana, Sparkles, Video, type LucideIcon } from 'lucide-react'
import { IMAGE_MODELS, LLM_MODEL_DEFAULT, VIDEO_MODELS } from '@/lib/nodeCatalog'
import { type FlowNodeType } from '@/lib/types'

// 可添加节点的清单项：类型 + 展示名 + 图标（+ 图像/视频类的预置模型）。
export type NodeMenuItem = {
  type: FlowNodeType
  label: string
  icon: LucideIcon
  model?: string
}

// 各图像模型的图标（缺省回退到通用图像图标）。
const IMAGE_ICONS: Record<string, LucideIcon> = {
  'Image 2': ImageIcon,
  'Nano Banana': Banana,
}

// 节点清单按输出形态分三类：文本 / 图像 / 视频。
// 侧栏（拖拽建节点）与画布右键菜单（点选建节点）共用同一份，避免两处漂移。
export const NODE_GROUPS: { label: string; items: NodeMenuItem[] }[] = [
  {
    label: '文本',
    items: [
      { type: 'prompt', label: 'Prompt 节点', icon: Type },
      { type: 'llm', label: 'Any LLM', icon: Sparkles, model: LLM_MODEL_DEFAULT },
    ],
  },
  {
    label: '图像模型',
    items: IMAGE_MODELS.map((m) => ({
      type: 'image' as const,
      label: m,
      icon: IMAGE_ICONS[m] ?? ImageIcon,
      model: m,
    })),
  },
  {
    label: '视频模型',
    items: VIDEO_MODELS.map((m) => ({
      type: 'video' as const,
      label: m,
      icon: Video,
      model: m,
    })),
  },
]
