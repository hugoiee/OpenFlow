import { Type, Image as ImageIcon, Banana, Sparkles, Clapperboard, Images, Podcast, type LucideIcon } from 'lucide-react'
import { IMAGE_MODELS, LLM_MODEL_DEFAULT, VIDEO_MODELS, type VideoVariant } from '@/lib/nodeCatalog'
import { type FlowNodeType } from '@/lib/types'

// 可添加节点的清单项：类型 + 展示名 + 图标（+ 图像/视频类的预置模型 + 视频变体）。
export type NodeMenuItem = {
  type: FlowNodeType
  label: string
  icon: LucideIcon
  model?: string
  /** 视频节点变体：首尾帧 / 参考图（video 类型专用）。 */
  videoVariant?: VideoVariant
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
    // Seedance 拆成两个变体节点：首尾帧 / 参考图（都只连 Prompt 时退化为文生视频）
    items: [
      {
        type: 'video' as const,
        label: `${VIDEO_MODELS[0]} 首尾帧`,
        icon: Clapperboard,
        model: VIDEO_MODELS[0],
        videoVariant: 'frames' as const,
      },
      {
        type: 'video' as const,
        label: `${VIDEO_MODELS[0]} 参考图`,
        icon: Images,
        model: VIDEO_MODELS[0],
        videoVariant: 'reference' as const,
      },
    ],
  },
  {
    label: '音频模型',
    items: [
      // 双人对话播客：内置脚本 + 两个火山音色 ID，逐行 TTS 合成拼接
      { type: 'podcast', label: '播客 TTS（火山）', icon: Podcast },
    ],
  },
]
