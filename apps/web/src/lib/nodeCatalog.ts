// 节点目录：图像/视频生成节点的固定预置模型 + 展示元信息（配色/文案）。
// 侧栏分组与生成节点组件共用此处，保持单一数据源。

/** 图像类可选的具名模型（固定预置，不依赖供应商 /models）。 */
export const IMAGE_MODELS = ['Image 2', 'Nano Banana'] as const

/** 视频类可选的具名模型（固定预置）。 */
export const VIDEO_MODELS = ['Seedance'] as const

/** 视频具名模型（展示名）→ AIGC 接口的 model_name。 */
export const VIDEO_API_MODEL: Record<string, string> = {
  Seedance: 'seedance',
}

/** 取某视频模型对应的 AIGC model_name（无映射时回退展示名）。 */
export function videoApiModel(model: string): string {
  return VIDEO_API_MODEL[model] ?? model
}

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

/**
 * 图像节点可调选项的取值（下拉枚举）。
 * Image 2 受支持的尺寸：1080p / 4k 各两种宽高比（9:16 竖、16:9 横）。
 */
export const IMAGE_SIZE_OPTIONS = [
  '1536x864', // 1k 16:9
  '864x1536', // 1k 9:16
  '2048x1152', // 2k 9:16
  '1152x2048', // 2k 9:16
  '3840x2160', // 4k 16:9
  '2160x3840', // 4k 9:16
] as const

/** 尺寸的人类可读标签（下拉里显示，比裸像素值直观）。 */
export const IMAGE_SIZE_LABELS: Record<string, string> = {
  '1536x864': '1k · 16:9',
  '864x1536': '1k · 9:16',
  '2048x1152': '2k · 16:9',
  '1152x2048': '2k · 9:16',
  '3840x2160': '4K · 16:9',
  '2160x3840': '4K · 9:16',
}

/** 图像节点尺寸默认值（首选项）。 */
export const IMAGE_SIZE_DEFAULT = IMAGE_SIZE_OPTIONS[0]
export const IMAGE_QUALITY_OPTIONS = ['auto', 'low', 'medium', 'high'] as const
export const IMAGE_N_OPTIONS = [1, 2, 3, 4] as const

// ---- Nano Banana(nano-banana) 专用选项 ----

/** Nano Banana 的 version 选项（展示名 → AIGC version 值）。 */
export const NANO_VERSION_OPTIONS = [
  { value: 'gemini-3-pro-image-preview', label: 'banana（Pro）' },
  { value: 'gemini-3.1-flash-image-preview', label: 'banana2（Flash）' },
] as const
export const NANO_VERSION_DEFAULT = NANO_VERSION_OPTIONS[0].value

/** Nano Banana config.aspect_ratio 选项。 */
export const NANO_ASPECT_OPTIONS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '9:16',
  '16:9',
  '21:9',
] as const
export const NANO_ASPECT_DEFAULT = '16:9'

/** Nano Banana config.image_size 选项。 */
export const NANO_IMAGE_SIZE_OPTIONS = ['1K', '2K', '4K'] as const
export const NANO_IMAGE_SIZE_DEFAULT = '2K'

// ---- Seedance(seedance) 视频专用选项 ----

/** Seedance 的 version 选项。 */
export const SEEDANCE_VERSION_OPTIONS = [
  { value: 'nami-seedance-2.0', label: 'nami-seedance-2.0（akool，风控低）' },
  { value: 'seedance-2.0', label: 'seedance-2.0' },
  { value: 'seedance-1.5-pro', label: 'seedance-1.5-pro' },
  { value: 'seedance-1.0-pro', label: 'seedance-1.0-pro' },
  { value: 'seedance-1.0-lite', label: 'seedance-1.0-lite' },
] as const
export const SEEDANCE_VERSION_DEFAULT = 'seedance-2.0'

/**
 * Seedance 视频生成「任务」：前端直观 4 选 1，提交时映射回后端 mode + 有序输入图。
 * 后端只认 first_last_frame / reference_image 两个 mode，且 first_last_frame 下按图片张数
 * 决定文生/首帧/首尾帧——把这层约定拆成 4 个显式任务，避免用户去记「张数=语义」。
 */
export type VideoTask = 'text' | 'first' | 'firstLast' | 'reference'

/**
 * 任务选项（卡片选择器用）。
 * - slots：该任务占用的输入图槽位数（0=不需要图；null=参考图，不限张数）。
 * - slotLabels：槽位的人类可读标签（用于给输入图打「首帧/尾帧」角标 + 空占位提示）。
 */
export const VIDEO_TASK_OPTIONS: {
  value: VideoTask
  label: string
  desc: string
  slots: number | null
  slotLabels?: string[]
}[] = [
  { value: 'text', label: '文生视频', desc: '仅凭文字提示生成，无需输入图', slots: 0 },
  {
    value: 'first',
    label: '首帧',
    desc: '以一张图作为起始画面',
    slots: 1,
    slotLabels: ['首帧'],
  },
  {
    value: 'firstLast',
    label: '首尾帧',
    desc: '指定起始与结束画面，在两帧间过渡',
    slots: 2,
    slotLabels: ['首帧', '尾帧'],
  },
  { value: 'reference', label: '参考图', desc: '多张图作为风格 / 内容参考', slots: null },
] as const

export const VIDEO_TASK_DEFAULT: VideoTask = 'text'

/** 任务 → 后端 mode（参考图走 reference_image，其余都走 first_last_frame）。 */
export function videoTaskMode(task: VideoTask): string {
  return task === 'reference' ? 'reference_image' : 'first_last_frame'
}

/** 任务对应的输入图槽位数（null=不限，作参考图；找不到任务回退 0）。 */
export function videoTaskSlots(task: VideoTask): number | null {
  // 注意：不能用 `?? 0`——会把「参考图」的 null（不限张数）误塌成 0，导致一张图都不提交
  const option = VIDEO_TASK_OPTIONS.find((o) => o.value === task)
  return option ? option.slots : 0
}

/** 任务对应的槽位标签（无槽位 / 参考图则为 undefined → 走数字角标的画廊态）。 */
export function videoTaskSlotLabels(task: VideoTask): string[] | undefined {
  return VIDEO_TASK_OPTIONS.find((o) => o.value === task)?.slotLabels
}

/** 按任务从有序输入图里取真正提交的图：文生=空 / 首帧=前1 / 首尾帧=前2 / 参考=全部。 */
export function videoTaskImages(task: VideoTask, images: string[]): string[] {
  const slots = videoTaskSlots(task)
  return slots === null ? images : images.slice(0, slots)
}

/** 旧数据兼容：缺 videoTask 时，从 legacy mode + 输入图张数推断任务。 */
export function deriveVideoTask(
  videoTask: VideoTask | undefined,
  legacyMode: string | undefined,
  imageCount: number,
): VideoTask {
  if (videoTask) return videoTask
  if (legacyMode === 'reference_image') return 'reference'
  // legacy first_last_frame（或未设）：按当时的图片张数还原文生/首帧/首尾帧
  if (imageCount >= 2) return 'firstLast'
  if (imageCount === 1) return 'first'
  return 'text'
}

/** Seedance config.resolution 选项。 */
export const SEEDANCE_RESOLUTION_OPTIONS = ['480p', '720p', '1080p'] as const
export const SEEDANCE_RESOLUTION_DEFAULT = '720p'

/**
 * Seedance config.ratio（宽高比）选项。
 * adaptive=自适应（跟随输入图/由接口决定），其余为固定宽高比。
 */
export const SEEDANCE_RATIO_OPTIONS = [
  '16:9',
  '4:3',
  '1:1',
  '3:4',
  '9:16',
  '21:9',
  'adaptive',
] as const

/** 宽高比的人类可读标签（下拉里显示；adaptive 用中文更直观）。 */
export const SEEDANCE_RATIO_LABELS: Record<string, string> = {
  adaptive: '自适应',
}

/** 视频节点宽高比默认值（自适应：不改变现有「跟随输入图」的行为）。 */
export const SEEDANCE_RATIO_DEFAULT = 'adaptive'

/** Seedance config.duration（秒）范围（滑块 4–15s，步长 1）。 */
export const SEEDANCE_DURATION_MIN = 4
export const SEEDANCE_DURATION_MAX = 15
export const SEEDANCE_DURATION_DEFAULT = 6

/** 生成类节点（image/video）的展示元信息（连接点配色）。 */
export const GEN_NODE_META: Record<'image' | 'video', { label: string; handle: string }> = {
  image: {
    label: '图像',
    handle: '!bg-amber-500 dark:!bg-amber-400',
  },
  video: {
    label: '视频',
    handle: '!bg-rose-500 dark:!bg-rose-400',
  },
}

/** 素材节点（image/audio）的展示元信息（标题回退文案 + 连接点配色，按种类区分）。 */
export const ASSET_NODE_META: Record<'image' | 'audio', { label: string; handle: string }> = {
  image: {
    label: '图像素材',
    handle: '!bg-amber-500 dark:!bg-amber-400',
  },
  audio: {
    label: '音频素材',
    handle: '!bg-sky-500 dark:!bg-sky-400',
  },
}
