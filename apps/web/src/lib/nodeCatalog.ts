// 节点目录：图像/视频生成节点的固定预置模型 + 展示元信息（配色/文案）。
// 侧栏分组与生成节点组件共用此处，保持单一数据源。

/** 图像类可选的具名模型（固定预置，不依赖供应商 /models）。 */
export const IMAGE_MODELS = ['Image 2', 'Nano Banana'] as const

/** 视频类可选的具名模型（固定预置）。 */
export const VIDEO_MODELS = ['Seedance'] as const

/**
 * 合并「手动维护列表 + 端点动态获取列表」为 Model 下拉候选：去空 / 去重 / 排序，
 * 并保证当前已选模型可选（不在并集里则置顶保留，不静默丢弃）。
 * 供设置面板的 Agent 模型名下拉使用。
 */
export function mergeModelOptions(
  manual: readonly string[],
  fetched: readonly string[],
  current?: string,
): string[] {
  const merged: string[] = []
  for (const m of [...manual, ...fetched]) {
    const t = m.trim()
    if (t && !merged.includes(t)) merged.push(t)
  }
  merged.sort((a, b) => a.localeCompare(b))
  const cur = current?.trim()
  return cur && !merged.includes(cur) ? [cur, ...merged] : merged
}

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
 * 视频节点变体（Seedance 拆成两种节点）：
 * - 'frames'：首尾帧——最多两个图像端点（First Frame / Last Frame），走 first_last_frame；
 * - 'reference'：参考图——可加多个编号图像端点，有图走 reference_image。
 * 两者都：只连 Prompt（无图）时退化为文生视频；音频走编号音频端点。
 */
export type VideoVariant = 'frames' | 'reference'
export const VIDEO_VARIANT_DEFAULT: VideoVariant = 'frames'

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
  { value: 'reference', label: '参考图', desc: '多张图作为风格 / 内容参考', slots: null },
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
] as const

export const VIDEO_TASK_DEFAULT: VideoTask = 'reference'

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
export const SEEDANCE_RESOLUTION_DEFAULT = '1080p'

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

// ---- 播客音频（火山 TTS，seed-tts-2.0）专用选项 ----

/** 播客节点默认角色名（脚本行首按此匹配；可在 Inspector 改）。 */
export const PODCAST_ROLE_A_DEFAULT = '主持人'
export const PODCAST_ROLE_B_DEFAULT = '嘉宾'

/** 播客语速 speech_rate 范围（火山：100=2 倍速，-50=0.5 倍速）。 */
export const PODCAST_SPEECH_RATE_MIN = -50
export const PODCAST_SPEECH_RATE_MAX = 100
export const PODCAST_SPEECH_RATE_DEFAULT = 0

/** 播客音量 loudness_rate 范围（火山：100=2 倍音量，-50=0.5 倍）。 */
export const PODCAST_LOUDNESS_MIN = -50
export const PODCAST_LOUDNESS_MAX = 100
export const PODCAST_LOUDNESS_DEFAULT = 0

/** 播客音调 post_process.pitch 范围。 */
export const PODCAST_PITCH_MIN = -12
export const PODCAST_PITCH_MAX = 12
export const PODCAST_PITCH_DEFAULT = 0

/** 播客采样率选项 audio_params.sample_rate（Hz）。 */
export const PODCAST_SAMPLE_RATE_OPTIONS = [8000, 16000, 22050, 24000, 32000, 44100, 48000] as const
export const PODCAST_SAMPLE_RATE_DEFAULT = 24000

/** 播客句间停顿（本地拼接插入的静音毫秒，非火山参数）。 */
export const PODCAST_LINE_GAP_MIN = 0
export const PODCAST_LINE_GAP_MAX = 2000
export const PODCAST_LINE_GAP_DEFAULT = 300

/** 播客显式朗读语种选项（additions.explicit_language；空值=自动检测）。 */
export const PODCAST_LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '自动检测' },
  { value: 'zh-cn', label: '中文（可中英混读）' },
  { value: 'en', label: '英语' },
  { value: 'ja', label: '日语' },
  { value: 'ko', label: '韩语' },
  { value: 'es-mx', label: '西班牙语（墨西哥）' },
  { value: 'pt-br', label: '葡萄牙语（巴西）' },
  { value: 'pt', label: '葡萄牙语' },
  { value: 'id', label: '印度尼西亚语' },
  { value: 'it', label: '意大利语' },
  { value: 'de', label: '德语' },
  { value: 'fr', label: '法语' },
  { value: 'th', label: '泰语' },
  { value: 'vi', label: '越南语' },
  { value: 'ru', label: '俄语' },
  { value: 'fil', label: '菲律宾语' },
  { value: 'ms', label: '马来语' },
  { value: 'ar', label: '阿拉伯语' },
  { value: 'pl', label: '波兰语' },
  { value: 'tr', label: '土耳其语' },
  { value: 'sv', label: '瑞典语' },
]

/** 播客节点脚本占位提示（含格式约定与方括号表演指令示例）。 */
export const PODCAST_SCRIPT_PLACEHOLDER = `每行「角色名: 台词」，如：
主持人: 大家好 [轻笑] 欢迎收听本期节目。
嘉宾: 谢谢主持人，很高兴来到这里。
（[轻笑] 等方括号表演指令会原样交给豆包 TTS 2.0）`

/** 播客节点的展示元信息。 */
export const PODCAST_NODE_META = {
  label: '播客 TTS',
  model: '火山 seed-tts-2.0',
} as const

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

/** 素材节点（image/audio/video）的展示元信息（标题回退文案 + 连接点配色，按种类区分）。 */
export const ASSET_NODE_META: Record<'image' | 'audio' | 'video', { label: string; handle: string }> =
  {
    image: {
      label: '图像素材',
      handle: '!bg-amber-500 dark:!bg-amber-400',
    },
    audio: {
      label: '音频素材',
      handle: '!bg-sky-500 dark:!bg-sky-400',
    },
    video: {
      label: '视频素材',
      handle: '!bg-rose-500 dark:!bg-rose-400',
    },
  }
