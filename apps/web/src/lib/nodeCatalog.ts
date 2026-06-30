// 节点目录：图像/视频生成节点的固定预置模型 + 展示元信息（配色/文案）。
// 侧栏分组与生成节点组件共用此处，保持单一数据源。

/** 图像类可选的具名模型（固定预置，不依赖供应商 /models）。 */
export const IMAGE_MODELS = ['Image 2', 'Nano Banana'] as const

/** 视频类可选的具名模型（固定预置）。 */
export const VIDEO_MODELS = ['Seedance 2.0'] as const

/** 生成类节点（image/video）的展示元信息。 */
export const GEN_NODE_META: Record<
  'image' | 'video',
  { label: string; dot: string; handle: string; models: readonly string[] }
> = {
  image: { label: '图像', dot: 'bg-amber-500', handle: '!bg-amber-500', models: IMAGE_MODELS },
  video: { label: '视频', dot: 'bg-rose-500', handle: '!bg-rose-500', models: VIDEO_MODELS },
}
