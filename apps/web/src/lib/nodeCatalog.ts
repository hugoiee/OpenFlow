// 节点目录：图像/视频生成节点的固定预置模型 + 展示元信息（配色/文案）。
// 侧栏分组与生成节点组件共用此处，保持单一数据源。

/** 图像类可选的具名模型（固定预置，不依赖供应商 /models）。 */
export const IMAGE_MODELS = ['Image 2', 'Nano Banana'] as const

/** 视频类可选的具名模型（固定预置）。 */
export const VIDEO_MODELS = ['Seedance 2.0'] as const

/**
 * 图像具名模型（展示名）→ AIGC 接口的 model_name。
 * 目前只接入 Image 2（gpt-image-2）；Nano Banana 的 model_name 待确认。
 */
export const IMAGE_API_MODEL: Record<string, string> = {
  'Image 2': 'gpt-image-2',
  'Nano Banana': 'nano-banana',
}

/** 取某图像模型对应的 AIGC model_name（无映射时回退展示名）。 */
export function imageApiModel(model: string): string {
  return IMAGE_API_MODEL[model] ?? model
}

/** 图像节点可调选项的取值（下拉枚举）。 */
export const IMAGE_SIZE_OPTIONS = ['1024x1024', '1024x1536', '1536x1024', 'auto'] as const
export const IMAGE_QUALITY_OPTIONS = ['auto', 'low', 'medium', 'high'] as const
export const IMAGE_N_OPTIONS = [1, 2, 3, 4] as const

/** 生成类节点（image/video）的展示元信息。 */
export const GEN_NODE_META: Record<
  'image' | 'video',
  { label: string; dot: string; handle: string }
> = {
  image: { label: '图像', dot: 'bg-amber-500', handle: '!bg-amber-500' },
  video: { label: '视频', dot: 'bg-rose-500', handle: '!bg-rose-500' },
}
