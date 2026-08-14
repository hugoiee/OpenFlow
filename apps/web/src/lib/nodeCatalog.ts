// 节点目录：图像/视频生成节点的固定预置模型 + 展示元信息（配色/文案）。
// 侧栏分组与生成节点组件共用此处，保持单一数据源。

/** 图像类可选的具名模型（固定预置，不依赖供应商 /models）。 */
export const IMAGE_MODELS = ['Image 2', 'Nano Banana'] as const

/** 视频类可选的具名模型（固定预置）。 */
export const VIDEO_MODELS = ['Seedance', 'Kling', 'MiniMax'] as const

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
  Kling: 'kling',
  MiniMax: 'MiniMax-H3',
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
 * Image 2 受支持的全量尺寸：auto + 1K/2K/4K 各档的常用宽高比。
 * 次序即下拉顺序：auto 打头，其后按 1K → 2K → 4K 分档，档内横竖成对。
 */
export const IMAGE_SIZE_OPTIONS = [
  'auto',
  // 1K
  '1024x1024',
  '1536x864',
  '864x1536',
  '1536x1152',
  '1152x1536',
  '1536x1024',
  '1024x1536',
  // 2K
  '2048x2048',
  '2048x1152',
  '1152x2048',
  '2048x1536',
  '1536x2048',
  // 4K
  '3840x2160',
  '2160x3840',
  '3840x2880',
  '2880x3840',
  '3840x2560',
  '2560x3840',
] as const

/** 尺寸的人类可读标签（下拉里显示，比裸像素值直观）。 */
export const IMAGE_SIZE_LABELS: Record<string, string> = {
  auto: '自动',
  '1024x1024': '1K · 1:1',
  '1536x864': '1K · 16:9',
  '864x1536': '1K · 9:16',
  '1536x1152': '1K · 4:3',
  '1152x1536': '1K · 3:4',
  '1536x1024': '1K · 3:2',
  '1024x1536': '1K · 2:3',
  '2048x2048': '2K · 1:1',
  '2048x1152': '2K · 16:9',
  '1152x2048': '2K · 9:16',
  '2048x1536': '2K · 4:3',
  '1536x2048': '2K · 3:4',
  '3840x2160': '4K · 16:9',
  '2160x3840': '4K · 9:16',
  '3840x2880': '4K · 4:3',
  '2880x3840': '4K · 3:4',
  '3840x2560': '4K · 3:2',
  '2560x3840': '4K · 2:3',
}

/**
 * 图像节点尺寸默认值。
 * 写死 '1536x864' 而非取 OPTIONS[0]（现在是 auto）——新建节点的默认出图尺寸不该
 * 因为「给下拉补了个 auto 选项」而悄悄变掉。
 */
export const IMAGE_SIZE_DEFAULT = '1536x864'
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

/** Seedance 2.5 的 version 值：能力与 2.0 差异较大（分辨率/时长/生成音频），单独常量供能力表分支。 */
export const SEEDANCE_VERSION_25 = 'doubao-seedance-2-5-260628'

/** Seedance 的 version 选项。 */
export const SEEDANCE_VERSION_OPTIONS = [
  { value: SEEDANCE_VERSION_25, label: 'seedance-2.5（480p/720p，最长 30s，可生成音频）' },
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

/** 宽高比的人类可读标签（三家模型的宽高比下拉共用；adaptive 用中文更直观）。 */
export const VIDEO_RATIO_LABELS: Record<string, string> = {
  adaptive: '自适应',
}

/** 视频节点宽高比默认值（自适应：不改变现有「跟随输入图」的行为）。 */
export const SEEDANCE_RATIO_DEFAULT = 'adaptive'

/** Seedance config.duration（秒）范围（滑块 4–15s，步长 1）。 */
export const SEEDANCE_DURATION_MIN = 4
export const SEEDANCE_DURATION_MAX = 15
export const SEEDANCE_DURATION_DEFAULT = 6

// ---- 可灵(kling) / MiniMax-H3 视频专用选项 ----

/** 可灵的 version 选项。 */
export const KLING_VERSION_OPTIONS = [{ value: 'kling-v3-omni-global', label: 'kling-v3-omni' }] as const
export const KLING_VERSION_DEFAULT = KLING_VERSION_OPTIONS[0].value

/**
 * 可灵 config.aspect_ratio 选项。
 * 注意：适配文档只给了示例值 16:9，未列举全集；这里按可灵官方支持的三种常用比例实现，
 * 若上游放开更多比例，补进这个数组即可（其余逻辑按能力表自动生效）。
 */
export const KLING_RATIO_OPTIONS = ['16:9', '9:16', '1:1'] as const

/** 可灵 config.mode（生成质量档）：标准 720P / 专家 1080P。 */
export const KLING_QUALITY_OPTIONS = [
  { value: 'std', label: '标准（std · 720P，性价比高）' },
  { value: 'pro', label: '专家（pro · 1080P，高品质）' },
] as const
export const KLING_QUALITY_DEFAULT = 'pro'

/** 可灵多镜头分镜上限（config.multi_shot=true 时的 multi_prompt 段数）。 */
export const KLING_SHOT_MAX = 6
/** 单段分镜的最短时长（秒）；各段之和须等于任务总时长。 */
export const KLING_SHOT_DURATION_MIN = 1

/** MiniMax-H3 的 version 选项。 */
export const MINIMAX_VERSION_OPTIONS = [{ value: 'MiniMax-H3', label: 'MiniMax-H3' }] as const
export const MINIMAX_VERSION_DEFAULT = MINIMAX_VERSION_OPTIONS[0].value

/** MiniMax-H3 config.resolution 选项。 */
export const MINIMAX_RESOLUTION_OPTIONS = ['768P', '2K'] as const

/** MiniMax-H3 config.ratio 选项。 */
export const MINIMAX_RATIO_OPTIONS = [
  'adaptive',
  '21:9',
  '16:9',
  '4:3',
  '1:1',
  '3:4',
  '9:16',
] as const

// ---- 视频模型能力表：按「模型 + version」收窄可选项 ----
// 三个模型的 config 形状与取值范围差异很大（2.5 只到 720p 但时长可 30s、可灵没有 resolution 只有
// std/pro 档、MiniMax 是 768P/2K），把差异集中收在这张表里：Inspector 据它渲染控件、
// requestBody 据它归一化取值，避免「面板能选但上游必拒」的组合。

/** 模型特有的可调项（出现在 Inspector 且下发到各自 config 字段）。 */
export type VideoModelFeature =
  /** seedance 2.5：config.generate_audio */
  | 'generateAudio'
  /** kling：config.sound（on/off） */
  | 'sound'
  /** kling：config.mode（std/pro） */
  | 'qualityMode'
  /** kling：config.multi_shot + 顶层 multi_prompt 分镜 */
  | 'multiShot'
  /** MiniMax：config['aigc-watermark'] */
  | 'watermark'

export type VideoModelSpec = {
  /** 可选分辨率（空数组=该模型不发 resolution，如可灵用 std/pro 档代替）。 */
  resolutions: readonly string[]
  resolutionDefault: string
  /** 可选宽高比。 */
  ratios: readonly string[]
  ratioDefault: string
  /** 首尾帧变体下被强制的宽高比（如 seedance 2.5 固定 adaptive）；undefined=不强制。 */
  framesRatio?: string
  /** 时长范围（秒，步长 1）。 */
  durationMin: number
  durationMax: number
  durationDefault: number
  /** 是否支持「自动时长」（下发 duration=-1）。 */
  durationAuto: boolean
  /** 该模型特有的可调项。 */
  features: readonly VideoModelFeature[]
}

/** 「自动时长」下发给上游的 duration 值。 */
export const VIDEO_DURATION_AUTO = -1

const SEEDANCE_SPEC_LEGACY: VideoModelSpec = {
  resolutions: SEEDANCE_RESOLUTION_OPTIONS,
  resolutionDefault: SEEDANCE_RESOLUTION_DEFAULT,
  ratios: SEEDANCE_RATIO_OPTIONS,
  ratioDefault: SEEDANCE_RATIO_DEFAULT,
  durationMin: SEEDANCE_DURATION_MIN,
  durationMax: SEEDANCE_DURATION_MAX,
  durationDefault: SEEDANCE_DURATION_DEFAULT,
  durationAuto: false,
  features: [],
}

const SEEDANCE_SPEC_25: VideoModelSpec = {
  resolutions: ['480p', '720p'],
  resolutionDefault: '720p',
  ratios: SEEDANCE_RATIO_OPTIONS,
  ratioDefault: SEEDANCE_RATIO_DEFAULT,
  // 首帧 / 首尾帧生视频只支持 adaptive，输出宽高比跟随首帧图片
  framesRatio: 'adaptive',
  durationMin: 4,
  durationMax: 30,
  durationDefault: 5,
  durationAuto: true,
  features: ['generateAudio'],
}

const KLING_SPEC: VideoModelSpec = {
  resolutions: [],
  resolutionDefault: '',
  ratios: KLING_RATIO_OPTIONS,
  ratioDefault: '16:9',
  durationMin: 3,
  durationMax: 15,
  durationDefault: 5,
  durationAuto: false,
  features: ['sound', 'qualityMode', 'multiShot'],
}

const MINIMAX_SPEC: VideoModelSpec = {
  resolutions: MINIMAX_RESOLUTION_OPTIONS,
  resolutionDefault: '768P',
  ratios: MINIMAX_RATIO_OPTIONS,
  ratioDefault: 'adaptive',
  durationMin: 4,
  durationMax: 15,
  durationDefault: 5,
  durationAuto: false,
  features: ['watermark'],
}

/** 各模型的 version 下拉选项（展示名 → 选项列表）。 */
export function videoVersionOptions(model: string): readonly { value: string; label: string }[] {
  switch (videoApiModel(model)) {
    case 'kling':
      return KLING_VERSION_OPTIONS
    case 'MiniMax-H3':
      return MINIMAX_VERSION_OPTIONS
    default:
      return SEEDANCE_VERSION_OPTIONS
  }
}

/** 某模型的默认 version。 */
export function videoDefaultVersion(model: string): string {
  switch (videoApiModel(model)) {
    case 'kling':
      return KLING_VERSION_DEFAULT
    case 'MiniMax-H3':
      return MINIMAX_VERSION_DEFAULT
    default:
      return SEEDANCE_VERSION_DEFAULT
  }
}

/** 取「模型 + version」对应的能力表（version 省略/未知时按该模型的默认 version）。 */
export function videoModelSpec(model: string, version?: string): VideoModelSpec {
  switch (videoApiModel(model)) {
    case 'kling':
      return KLING_SPEC
    case 'MiniMax-H3':
      return MINIMAX_SPEC
    default:
      return (version ?? SEEDANCE_VERSION_DEFAULT) === SEEDANCE_VERSION_25
        ? SEEDANCE_SPEC_25
        : SEEDANCE_SPEC_LEGACY
  }
}

/** 该能力表是否含某个可调项。 */
export function videoHasFeature(spec: VideoModelSpec, feature: VideoModelFeature): boolean {
  return spec.features.includes(feature)
}

/**
 * 变体 → 上游 mode。
 * 三家的「首尾帧」都叫 first_last_frame；「参考」这一侧 MiniMax 用 reference_frame，
 * seedance / 可灵用 reference_image。
 */
export function videoModeFor(model: string, variant: VideoVariant): string {
  if (variant === 'frames') return 'first_last_frame'
  return videoApiModel(model) === 'MiniMax-H3' ? 'reference_frame' : 'reference_image'
}

/** 变体在该模型下的中文叫法（节点副标题 / 菜单项用）。 */
export function videoVariantLabel(model: string, variant: VideoVariant): string {
  if (variant === 'frames') return '首尾帧'
  switch (videoApiModel(model)) {
    case 'kling':
      return '关键帧'
    case 'MiniMax-H3':
      return '参考帧'
    default:
      return '参考图'
  }
}

/**
 * 该「模型 + 变体」是否接受参考音频 / 参考视频。
 * 可灵只吃图；MiniMax 只有参考帧模式支持音视频，首尾帧模式仅支持图片。
 * 不接受的一律在构造请求时丢弃，免得发出去必被上游拒。
 */
export function videoAcceptsRefs(
  model: string,
  variant: VideoVariant,
): { audio: boolean; video: boolean } {
  switch (videoApiModel(model)) {
    case 'kling':
      return { audio: false, video: false }
    case 'MiniMax-H3':
      return variant === 'reference' ? { audio: true, video: true } : { audio: false, video: false }
    default:
      // seedance：音频两种变体都收；参考视频沿用既有约定，只在参考图变体下发
      return { audio: true, video: variant === 'reference' }
  }
}

/** 分辨率归一化：不在该 spec 支持列表里的旧值回退到默认（spec 无分辨率则返回空串）。 */
export function normalizeVideoResolution(spec: VideoModelSpec, value: string | undefined): string {
  if (spec.resolutions.length === 0) return ''
  return value && spec.resolutions.includes(value) ? value : spec.resolutionDefault
}

/** 宽高比归一化：首尾帧被强制的 spec 直接取强制值；否则不在列表里的旧值回退默认。 */
export function normalizeVideoRatio(
  spec: VideoModelSpec,
  value: string | undefined,
  variant: VideoVariant,
): string {
  if (variant === 'frames' && spec.framesRatio) return spec.framesRatio
  return value && spec.ratios.includes(value) ? value : spec.ratioDefault
}

/** 时长归一化：自动(-1) 仅在支持时保留；否则夹到 [min,max] 整数，无值取默认。 */
export function normalizeVideoDuration(spec: VideoModelSpec, value: number | undefined): number {
  if (value === VIDEO_DURATION_AUTO) return spec.durationAuto ? VIDEO_DURATION_AUTO : spec.durationDefault
  if (typeof value !== 'number' || !Number.isFinite(value)) return spec.durationDefault
  return Math.min(spec.durationMax, Math.max(spec.durationMin, Math.round(value)))
}

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

// ---- 脚本分镜节点（播客脚本 → 逐行 LLM 生成 Seedance 口播 prompt）----

/** 脚本分镜节点的展示元信息。 */
export const STORYBOARD_NODE_META = {
  label: '脚本分镜',
} as const

/** 脚本切割节点的展示元信息。 */
export const SPLITTER_NODE_META = {
  label: '脚本切割',
} as const

/** 逐行调 LLM 的前端并发上限（单行一次请求，失败可单行重试）。 */
export const STORYBOARD_CONCURRENCY = 3

/** 口播语速估算的默认值：每秒约念出的字数（只数实际念出的字，标点/空白不计）。 */
export const STORYBOARD_CHARS_PER_SECOND = 6

/**
 * 脚本切割节点可选的语速档位（字/秒）：中文口播常见 4~8，配音越快同样时长塞得下越多字。
 * 只在切割节点上可调（分镜节点只接收切好的段落，其行内重估仍按默认值）。
 */
export const STORYBOARD_SPEED_OPTIONS = [
  { value: 4, label: '4 字/秒（很慢）' },
  { value: 5, label: '5 字/秒（偏慢）' },
  { value: 6, label: '6 字/秒（标准）' },
  { value: 7, label: '7 字/秒（偏快）' },
  { value: 8, label: '8 字/秒（很快）' },
] as const

/** 语速归一：非法/旧数据（undefined）或不在档位内的值回退默认 6 字/秒。 */
export function normalizeSplitSpeed(value: number | undefined): number {
  return STORYBOARD_SPEED_OPTIONS.some((o) => o.value === value)
    ? (value as number)
    : STORYBOARD_CHARS_PER_SECOND
}

/** 单段视频时长范围（秒）：seedance 2.0 只支持 4~15s，切段与时长估算都按此夹取。 */
export const STORYBOARD_SEG_MIN_SECONDS = 4
export const STORYBOARD_SEG_MAX_SECONDS = 15

/** 分镜脚本占位提示（格式同播客节点：每行「角色名: 台词」）。 */
export const STORYBOARD_SCRIPT_PLACEHOLDER = `每行「角色名: 台词」，如：
主持人: 狂揽 130 亿美金！2026 世界杯成为最赚钱的一届赛事。
嘉宾: 这个数字确实夸张，我们拆开看看钱从哪来。`

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
