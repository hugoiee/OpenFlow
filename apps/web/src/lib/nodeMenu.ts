import { Type, Image as ImageIcon, Banana, Clapperboard, Images, ListVideo, Podcast, type LucideIcon } from 'lucide-react'
import { IMAGE_MODELS, VIDEO_MODELS, videoVariantLabel, type VideoVariant } from '@/lib/nodeCatalog'
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
// 建节点只有两个入口——画布空白右键新建、端点拉线松开在空白处建节点+连线——共用同一份清单。
export const NODE_GROUPS: { label: string; items: NodeMenuItem[] }[] = [
  {
    label: '文本',
    items: [
      { type: 'prompt', label: 'Prompt 节点', icon: Type },
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
    // 每个视频模型都拆成两个变体节点：首尾帧 / 参考侧（各家叫法不同，见 videoVariantLabel）。
    // 两个变体都在只连 Prompt（无图）时退化为文生视频。
    items: VIDEO_MODELS.flatMap((m) => [
      {
        type: 'video' as const,
        label: `${m} ${videoVariantLabel(m, 'frames')}`,
        icon: Clapperboard,
        model: m,
        videoVariant: 'frames' as const,
      },
      {
        type: 'video' as const,
        label: `${m} ${videoVariantLabel(m, 'reference')}`,
        icon: Images,
        model: m,
        videoVariant: 'reference' as const,
      },
    ]),
  },
  {
    label: '音频模型',
    items: [
      // 双人对话播客：内置脚本 + 两个火山音色 ID，逐行 TTS 合成拼接
      { type: 'podcast', label: '播客 TTS（火山）', icon: Podcast },
    ],
  },
  {
    label: '工具',
    items: [
      // 脚本分镜：播客脚本逐行经 LLM 生成 Seedance 口播 prompt，再批量落成 Prompt→视频 节点对
      { type: 'storyboard', label: '脚本分镜', icon: ListVideo },
    ],
  },
]
