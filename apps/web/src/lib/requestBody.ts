// 生成请求体的单一来源：图像 / 视频 / 播客节点「点击生成时发送的请求 JSON」都由这里构造。
// 节点组件的 handleRun 与右侧 Inspector 的「请求 JSON 预览」共用，保证预览与实发一致、不漂移。
//
// ⚠️ 不变式（Inspector 的性能优化依赖它，改这里前务必读一遍）：
// 本文件与 graph.ts 的采集函数**只能**依赖 edges 与各节点的 id / type / data，
// **绝不可读取 position / dimensions / measured / selected 这些纯视图态**。
// 因为 Inspector 侧以 useFlowStore 的 graphRev 作 useMemo 依赖来跳过拖动期间的重算，
// 而拖动/框选不会推进 graphRev。一旦这里读了位置类字段，拖完节点后预览就会停在旧值
// （刷新一下又是对的），是那种极难排查的 bug。真要按位置排序，请同时改 onNodesChange 的
// viewOnly 判定（见 useFlowStore.ts）。

import type { GenImageBody, GenPodcastBody, GenVideoBody, VideoShot } from '@openflow/shared'
import {
  IMAGE_INPUT_HANDLE_PREFIX,
  collectUpstreamAudioRefs,
  collectUpstreamImageRefs,
  collectUpstreamPrompt,
  collectUpstreamVideoRefs,
  type UpstreamRef,
} from './graph'
import { applyMentions, collectMentionedRefs } from './mentions'
import {
  IMAGE_SIZE_DEFAULT,
  IMAGE_SIZE_OPTIONS,
  KLING_QUALITY_DEFAULT,
  KLING_SHOT_DURATION_MIN,
  KLING_SHOT_MAX,
  NANO_ASPECT_DEFAULT,
  NANO_IMAGE_SIZE_DEFAULT,
  NANO_VERSION_DEFAULT,
  PODCAST_LINE_GAP_DEFAULT,
  PODCAST_LOUDNESS_DEFAULT,
  PODCAST_PITCH_DEFAULT,
  PODCAST_ROLE_A_DEFAULT,
  PODCAST_ROLE_B_DEFAULT,
  PODCAST_SAMPLE_RATE_DEFAULT,
  PODCAST_SPEECH_RATE_DEFAULT,
  SEEDANCE_RATIO_DEFAULT,
  VIDEO_VARIANT_DEFAULT,
  imageApiModel,
  normalizeVideoDuration,
  normalizeVideoRatio,
  normalizeVideoResolution,
  videoAcceptsRefs,
  videoApiModel,
  videoDefaultVersion,
  videoHasFeature,
  videoModeFor,
  videoModelSpec,
} from './nodeCatalog'
import type {
  GenerationNodeData,
  ImageNode,
  PodcastNode,
  Project,
  PromptMentionRef,
  VideoNode,
} from './types'

/** 每行一个 URL 的文本框 → 去空的 URL 列表。 */
function linesToUrls(text: string | undefined): string[] {
  return (text ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 图像生成节点：POST /api/aigc 的请求体（按模型 Image 2 / Nano Banana 取舍参数）。 */
/** @ 筛选：该类有被 @ 到的资源 → 只发这些（@ 序）；一个都没有 → 全发连线资源（连线序）。 */
function pickRefs(mentioned: UpstreamRef[], all: UpstreamRef[]): string[] {
  return (mentioned.length ? mentioned : all).map((r) => r.url)
}

export function buildImageRequest(project: Project, node: ImageNode): GenImageBody {
  const id = node.id
  const d = node.data
  const imageRefs = collectUpstreamImageRefs(project, id)
  const mentions: PromptMentionRef[] = []
  const rawPrompt = collectUpstreamPrompt(project, id, { handle: 'user', mentionsOut: mentions })
  // 统一资源端点 + @ 调用：prompt 里 @ 到图像 → 只发被 @ 的（@ 序）；没 @ → 全发（连线序）。
  // 手动填/传的旧 URL（无身份，不可被 @）始终追加在后。
  const mentioned = collectMentionedRefs(rawPrompt, mentions, imageRefs)
  const images = [...pickRefs(mentioned.image, imageRefs), ...linesToUrls(d.imagesText)]
  const base = {
    projectId: project.id,
    nodeId: id,
    model: imageApiModel(d.model),
    prompt: applyMentions(rawPrompt, mentions, imageRefs, { image: images, audio: [], video: [] }),
    images,
  }
  if (imageApiModel(d.model) === 'nano-banana') {
    return {
      ...base,
      version: d.version ?? NANO_VERSION_DEFAULT,
      aspectRatio: d.aspectRatio ?? NANO_ASPECT_DEFAULT,
      imageSize: d.imageSize ?? NANO_IMAGE_SIZE_DEFAULT,
      size: '',
      n: 1,
      quality: '',
    }
  }
  const storedSize = d.size ?? IMAGE_SIZE_DEFAULT
  const size = (IMAGE_SIZE_OPTIONS as readonly string[]).includes(storedSize)
    ? storedSize
    : IMAGE_SIZE_DEFAULT
  return { ...base, size, n: d.n ?? 1, quality: d.quality ?? 'auto' }
}

/**
 * 可灵分镜列表归一化：截到上限段数、时长取 ≥1 的整数（空 prompt 留着，由后端过滤，
 * 免得 Inspector 里正在敲一半的段从预览里凭空消失）。
 */
function normalizeShots(shots: GenerationNodeData['shots']): VideoShot[] {
  return (shots ?? []).slice(0, KLING_SHOT_MAX).map((s) => ({
    prompt: s.prompt ?? '',
    duration: Math.max(KLING_SHOT_DURATION_MIN, Math.round(s.duration) || KLING_SHOT_DURATION_MIN),
  }))
}

/** 视频生成节点（seedance / kling / MiniMax-H3）：POST /api/video 的请求体。 */
export function buildVideoRequest(project: Project, node: VideoNode): GenVideoBody {
  const id = node.id
  const d = node.data
  const variant = d.videoVariant ?? (d.videoTask === 'reference' ? 'reference' : VIDEO_VARIANT_DEFAULT)
  // 能力表按「模型 + version」定可选范围：面板存下的旧值超出范围时在这里统一回退，
  // 避免换了模型/版本后还把上游必拒的参数发出去。
  const version = d.version ?? videoDefaultVersion(d.model)
  const spec = videoModelSpec(d.model, version)
  const accepts = videoAcceptsRefs(d.model, variant)

  const imageRefs = collectUpstreamImageRefs(project, id)
  // 该模型/变体不吃的资源直接不采集：连了也不发（如可灵只吃图、MiniMax 首尾帧只吃图）
  const audioRefs = accepts.audio ? collectUpstreamAudioRefs(project, id) : []
  const videoRefs = accepts.video ? collectUpstreamVideoRefs(project, id) : []
  const allRefs = [...imageRefs, ...audioRefs, ...videoRefs]
  const mentions: PromptMentionRef[] = []
  const rawPrompt = collectUpstreamPrompt(project, id, { handle: 'user', mentionsOut: mentions })
  // 统一资源端点 + @ 调用：各类资源分别看——被 @ 到 → 只发被 @ 的（@ 序）；没 @ → 全发（连线序）
  const mentioned = collectMentionedRefs(rawPrompt, mentions, allRefs)
  const audios = accepts.audio
    ? [...pickRefs(mentioned.audio, audioRefs), ...linesToUrls(d.audiosText)]
    : []
  // 变体 → 上游 mode + 有序输入图；两变体都在无图（只连 Prompt）时退化为文生视频。
  //   参考侧有图 → reference_image / reference_frame + 统一端点图（@ 筛选后）；
  //   首尾帧 → first_last_frame + First/Last 专用端点（image-0/1）前 2 张，**不受 @ 筛选**（图序即端点语义）。
  let mode: string
  let images: string[]
  if (variant === 'frames') {
    const framesRefs = imageRefs.filter(
      (r) => typeof r.handle === 'string' && r.handle.startsWith(IMAGE_INPUT_HANDLE_PREFIX),
    )
    mode = videoModeFor(d.model, 'frames')
    images = [...framesRefs.map((r) => r.url), ...linesToUrls(d.imagesText)].slice(0, 2)
  } else {
    const combined = [...pickRefs(mentioned.image, imageRefs), ...linesToUrls(d.imagesText)]
    mode = videoModeFor(d.model, combined.length > 0 ? 'reference' : 'frames')
    images = combined
  }
  const ratio = normalizeVideoRatio(spec, d.ratio, variant)
  const pickedVideos = pickRefs(mentioned.video, videoRefs)
  const sentVideos = pickedVideos.length > 0 ? pickedVideos : undefined
  // @ 引用 → <<<image_N>>>/<<<audio_N>>>/<<<video_N>>> 占位符：N 按「最终实发」列表算
  // （被 @ 筛选掉 / frames 裁掉 / 该模型不收的资源 → 引用悬空原样保留）
  const prompt = applyMentions(rawPrompt, mentions, allRefs, {
    image: images,
    audio: audios,
    video: sentVideos ?? [],
  })
  return {
    projectId: project.id,
    nodeId: id,
    model: videoApiModel(d.model),
    version,
    mode,
    prompt,
    images,
    audios,
    videos: sentVideos,
    resolution: normalizeVideoResolution(spec, d.resolution),
    // seedance 沿用旧约定：adaptive（自适应）=不约束宽高比，故不传；
    // 可灵 / MiniMax 的 aspect_ratio / ratio 是必填项（其 adaptive 也要显式给），一律下发。
    ratio:
      videoApiModel(d.model) === 'seedance' && ratio === SEEDANCE_RATIO_DEFAULT ? undefined : ratio,
    duration: normalizeVideoDuration(spec, d.duration),
    // 模型特有可调项：该模型没有这项能力就不下发（后端据「是否为 undefined」取舍）
    generateAudio: videoHasFeature(spec, 'generateAudio') ? (d.generateAudio ?? true) : undefined,
    sound: videoHasFeature(spec, 'sound') ? (d.sound ?? true) : undefined,
    qualityMode: videoHasFeature(spec, 'qualityMode')
      ? d.qualityMode || KLING_QUALITY_DEFAULT
      : undefined,
    multiShot: videoHasFeature(spec, 'multiShot') ? Boolean(d.multiShot) : undefined,
    shots: videoHasFeature(spec, 'multiShot') && d.multiShot ? normalizeShots(d.shots) : undefined,
    watermark: videoHasFeature(spec, 'watermark') ? Boolean(d.watermark) : undefined,
  }
}

/** 播客音频节点：POST /api/podcast 的请求体（脚本与角色都在节点自身，不走连线）。 */
export function buildPodcastRequest(project: Project, node: PodcastNode): GenPodcastBody {
  const d = node.data
  return {
    projectId: project.id,
    nodeId: node.id,
    script: d.script ?? '',
    roles: [
      { name: (d.roleAName ?? '').trim() || PODCAST_ROLE_A_DEFAULT, voiceId: (d.roleAVoice ?? '').trim() },
      { name: (d.roleBName ?? '').trim() || PODCAST_ROLE_B_DEFAULT, voiceId: (d.roleBVoice ?? '').trim() },
    ],
    speechRate: d.speechRate ?? PODCAST_SPEECH_RATE_DEFAULT,
    sampleRate: d.sampleRate ?? PODCAST_SAMPLE_RATE_DEFAULT,
    loudnessRate: d.loudnessRate ?? PODCAST_LOUDNESS_DEFAULT,
    pitch: d.pitch ?? PODCAST_PITCH_DEFAULT,
    lineGapMs: d.lineGapMs ?? PODCAST_LINE_GAP_DEFAULT,
    filterParenthesis: d.filterParenthesis ?? false,
    disableMarkdownFilter: d.disableMarkdownFilter ?? false,
    disableEmojiFilter: d.disableEmojiFilter ?? false,
    explicitLanguage: (d.explicitLanguage ?? '').trim() || undefined,
    contextText: (d.contextText ?? '').trim() || undefined,
    aigcWatermark: d.aigcWatermark || undefined,
    aigcMetadata: d.aigcMetaEnable
      ? {
          enable: true,
          contentProducer: (d.aigcMetaContentProducer ?? '').trim() || undefined,
          produceId: (d.aigcMetaProduceId ?? '').trim() || undefined,
          contentPropagator: (d.aigcMetaContentPropagator ?? '').trim() || undefined,
          propagateId: (d.aigcMetaPropagateId ?? '').trim() || undefined,
        }
      : undefined,
  }
}

// ---- 上游实发请求体（右侧 Inspector「请求预览」用）----
// 下面几个把「点击生成时发给后端 /api/* 的 GenXxxBody」再转成「后端实际打到上游网关的请求体」：
//   图像 / 视频镜像 apps/server/src/provider.ts 的 runImageGen / runVideoGen（内网 AIGC 网关，
//     字段为 req_from / model_name / version / config…，req_from 由全局署名注入）；
// 复用上面的 build*Request 收集上游输入，故预览与实发链路同源、不漂移；改后端构造逻辑时同步这里。

/** 图像：内网 AIGC 网关的 POST body（镜像 provider.ts runImageGen）。 */
export function buildImageUpstream(project: Project, node: ImageNode, reqFrom: string) {
  const body = buildImageRequest(project, node)
  const isNano = body.model === 'nano-banana'
  return {
    req_from: reqFrom,
    model_name: body.model,
    // Nano Banana 用 version（缺省回退默认）；Image 2 的 version 即 model_name
    version: isNano ? body.version?.trim() || NANO_VERSION_DEFAULT : body.model,
    prompt: body.prompt,
    image_list: body.images,
    // config 按模型两套，互不污染
    config: isNano
      ? { aspect_ratio: body.aspectRatio, image_size: body.imageSize }
      : { size: body.size, n: body.n, quality: body.quality },
  }
}

/**
 * 视频：内网 AIGC 网关的 POST body（**逐字镜像 provider.ts buildVideoPayload 的三个分支**）。
 * 改后端那份时务必同步这里，否则 Inspector 的「请求预览」就不再等于实发。
 */
export function buildVideoUpstream(project: Project, node: VideoNode, reqFrom: string) {
  const body = buildVideoRequest(project, node)
  const base = {
    req_from: reqFrom,
    model_name: body.model,
    version: body.version,
    mode: body.mode,
  }
  if (body.model === 'kling') {
    const shots = (body.shots ?? []).filter((s) => s.prompt.trim())
    const multiShot = Boolean(body.multiShot) && shots.length > 0
    return {
      ...base,
      ...(multiShot ? {} : { prompt: body.prompt }),
      image_list: body.images,
      config: {
        duration: String(body.duration),
        sound: body.sound === false ? 'off' : 'on',
        mode: body.qualityMode?.trim() || KLING_QUALITY_DEFAULT,
        aspect_ratio: body.ratio?.trim() || '16:9',
        multi_shot: multiShot,
        ...(multiShot ? { shot_type: 'customize' } : {}),
      },
      ...(multiShot
        ? {
            multi_prompt: shots.map((s, i) => ({
              index: i + 1,
              prompt: s.prompt,
              duration: String(s.duration),
            })),
          }
        : {}),
    }
  }
  if (body.model === 'MiniMax-H3') {
    const videos = body.videos ?? []
    const audios = body.audios ?? []
    return {
      ...base,
      prompt: body.prompt,
      image_list: body.images,
      ...(videos.length ? { video_list: videos } : {}),
      ...(audios.length ? { audio_list: audios } : {}),
      config: {
        resolution: body.resolution,
        ratio: body.ratio?.trim() || 'adaptive',
        duration: body.duration,
        'aigc-watermark': Boolean(body.watermark),
      },
    }
  }
  return {
    ...base,
    prompt: body.prompt,
    image_list: body.images,
    video_list: body.videos ?? [],
    audio_list: body.audios ?? [],
    // ratio 省略（自适应）时不塞进 config，与后端保持一致
    config: {
      resolution: body.resolution,
      duration: body.duration,
      ...(body.ratio?.trim() ? { ratio: body.ratio } : {}),
      ...(typeof body.generateAudio === 'boolean' ? { generate_audio: body.generateAudio } : {}),
    },
  }
}

/**
 * 播客音频：火山单向流式 TTS 的请求概要（镜像 volc-tts.ts runPodcastGen）。
 * 后端按脚本逐行发多个请求（每句一个，speaker=该角色音色），此处汇总成一份预览：
 * 角色 → 音色映射 + 每句共用的 req_params 形态 + 原始脚本。
 */
export function buildPodcastUpstream(project: Project, node: PodcastNode) {
  const body = buildPodcastRequest(project, node)
  // additions 镜像 volc-tts.ts synthesizeLine：只在有非默认项时下发（实发为 JSON 字符串）
  const additions: Record<string, unknown> = {}
  if (body.filterParenthesis) additions.max_length_to_filter_parenthesis = 100
  if (body.disableMarkdownFilter) additions.disable_markdown_filter = true
  if (body.disableEmojiFilter) additions.disable_emoji_filter = true
  if (body.explicitLanguage) additions.explicit_language = body.explicitLanguage
  if (body.aigcWatermark) additions.aigc_watermark = true
  const meta = body.aigcMetadata
  if (meta?.enable) {
    additions.aigc_metadata = {
      enable: true,
      ...(meta.contentProducer ? { content_producer: meta.contentProducer } : {}),
      ...(meta.produceId ? { produce_id: meta.produceId } : {}),
      ...(meta.contentPropagator ? { content_propagator: meta.contentPropagator } : {}),
      ...(meta.propagateId ? { propagate_id: meta.propagateId } : {}),
    }
  }
  return {
    'X-Api-Resource-Id': 'seed-tts-2.0',
    roles: Object.fromEntries(body.roles.map((r) => [r.name, r.voiceId || '（未填音色 ID）'])),
    req_params_per_line: {
      speaker: '按行匹配角色名 → 对应音色 ID',
      audio_params: {
        // meta 水印不支持 pcm：开启时每句按 wav 请求、拼接前解出 PCM
        format: meta?.enable ? 'wav' : 'pcm',
        sample_rate: body.sampleRate,
        speech_rate: body.speechRate,
        loudness_rate: body.loudnessRate,
      },
      ...(Object.keys(additions).length ? { additions } : {}),
      ...(body.pitch ? { post_process: { pitch: body.pitch } } : {}),
      ...(body.contextText ? { context_texts: [body.contextText] } : {}),
    },
    line_gap_ms: body.lineGapMs,
    script: body.script,
  }
}
