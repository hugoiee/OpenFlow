import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PodcastRole, SettingsDTO } from '@openflow/shared'
import { generatedFilesDir } from './db'

// 双人对话播客音频合成：火山「单向流式语音合成 HTTP」一次请求只支持一个音色，
// 故按脚本逐行合成（每行用该角色的音色 ID 请求 pcm）→ 行间插短静音 → 拼成单个 WAV 落盘。
// 文件经 GET /api/files/:name 对外服务，任务 result 存相对 URL（同源，<audio> 可直接播）。

const DEFAULT_ENDPOINT = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional'
const RESOURCE_ID = 'seed-tts-2.0'
const SAMPLE_RATE_DEFAULT = 24000
/** 两句台词之间默认的静音间隔（毫秒），拼接时本地插入 PCM 零样本。 */
const LINE_GAP_MS_DEFAULT = 300

/** 每句台词共用的合成选项（音频参数 + additions 文本处理 + 语音指令）。 */
type SynthesisOptions = {
  speechRate: number
  sampleRate: number
  loudnessRate: number
  /** post_process.pitch；0 时不下发。 */
  pitch: number
  /** true → additions.max_length_to_filter_parenthesis=100（过滤括号内内容）。 */
  filterParenthesis: boolean
  disableMarkdownFilter: boolean
  disableEmojiFilter: boolean
  /** 显式朗读语种（如 zh-cn）；空=不下发（自动）。 */
  explicitLanguage: string
  /** 语音指令（context_texts 单条）；空=不下发。 */
  contextText: string
  /** AIGC 生成标识（音频结尾节奏标识）；逐句合成时每句结尾都会有。 */
  aigcWatermark: boolean
  /** meta 隐式水印；enable 时每句改按 wav 请求（pcm 不支持）再解出 PCM。 */
  aigcMetadata: {
    enable: boolean
    contentProducer: string
    produceId: string
    contentPropagator: string
    propagateId: string
  } | null
}

/** 解析出的一句台词：角色下标 + 台词文本（方括号表演指令原样保留）。 */
export type PodcastLine = {
  roleIndex: number
  text: string
}

/** 火山语音配置的运行时解析：设置优先，为空回退 env；均无则抛可读错误。 */
export function resolveVolcTts(settings: SettingsDTO): { endpoint: string; apiKey: string } {
  const apiKey = settings.volcTtsApiKey.trim() || process.env.VOLC_TTS_API_KEY?.trim() || ''
  if (!apiKey) {
    throw new Error('未配置火山语音 API Key，请在设置中填写（火山控制台 > API Key 管理获取）')
  }
  const endpoint = process.env.VOLC_TTS_ENDPOINT?.trim() || DEFAULT_ENDPOINT
  return { endpoint, apiKey }
}

/**
 * 解析对话脚本：每行「角色名: 台词」（中英文冒号均可），行首匹配 roles 里的角色名；
 * 未带角色前缀的非空行并入上一句台词（支持多行台词）。整篇没有可识别的台词时抛错。
 */
export function parsePodcastScript(script: string, roles: PodcastRole[]): PodcastLine[] {
  // 角色名按长度降序匹配，避免「主持人2」被「主持人」抢先命中
  const candidates = roles
    .map((r, i) => ({ name: r.name.trim(), index: i }))
    .filter((r) => r.name)
    .sort((a, b) => b.name.length - a.name.length)
  const lines: PodcastLine[] = []
  for (const raw of script.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    let matched = false
    for (const { name, index } of candidates) {
      if (!line.startsWith(name)) continue
      const rest = line.slice(name.length).trimStart()
      if (!rest.startsWith(':') && !rest.startsWith('：')) continue
      const text = rest.slice(1).trim()
      if (text) lines.push({ roleIndex: index, text })
      matched = true
      break
    }
    if (!matched) {
      if (lines.length === 0) {
        throw new Error(
          `脚本第一句无法识别说话人：「${line.slice(0, 20)}…」。每句台词请以「角色名: 」开头，角色名需与节点里配置的一致`,
        )
      }
      // 续行：并入上一句台词
      lines[lines.length - 1].text += `\n${line}`
    }
  }
  if (lines.length === 0) throw new Error('脚本为空：请按「角色名: 台词」每行一句填写对话脚本')
  return lines
}

/**
 * 从 WAV 容器里取出 data 块的裸 PCM（meta 水印场景每句按 wav 请求，拼接前需去容器）。
 * 不是 RIFF/找不到 data 块时原样返回（当作已是裸 PCM）。
 */
function wavToPcm(buf: Buffer): Buffer {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF') return buf
  let off = 12
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    const size = buf.readUInt32LE(off + 4)
    if (id === 'data') return buf.subarray(off + 8, Math.min(off + 8 + size, buf.length))
    off += 8 + size + (size % 2) // RIFF 块按 2 字节对齐
  }
  return buf
}

/** 从累积的响应文本里取出第一个完整 JSON 对象（括号平衡、忽略字符串内的花括号）；不完整返回 null。 */
function extractJsonObject(buf: string): { json: string; rest: string } | null {
  const start = buf.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < buf.length; i++) {
    const ch = buf[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return { json: buf.slice(start, i + 1), rest: buf.slice(i + 1) }
    }
  }
  return null
}

/**
 * 合成一句台词：调火山单向流式 HTTP，收齐流式返回的 base64 音频块，
 * 返回原始 PCM Buffer + 本句计费字数（结束包 usage.text_words）。
 * meta 水印开启时按 wav 请求（pcm 不支持 aigc_metadata），拼接前解出 data 块。
 */
async function synthesizeLine(input: {
  endpoint: string
  apiKey: string
  text: string
  voiceId: string
  options: SynthesisOptions
}): Promise<{ pcm: Buffer; textWords: number }> {
  const o = input.options
  const metaEnabled = o.aigcMetadata?.enable === true
  // additions 按文档是 JSON 字符串；只在有非默认项时下发
  const additions: Record<string, unknown> = {}
  if (o.filterParenthesis) additions.max_length_to_filter_parenthesis = 100
  if (o.disableMarkdownFilter) additions.disable_markdown_filter = true
  if (o.disableEmojiFilter) additions.disable_emoji_filter = true
  if (o.explicitLanguage) additions.explicit_language = o.explicitLanguage
  if (o.aigcWatermark) additions.aigc_watermark = true
  if (metaEnabled && o.aigcMetadata) {
    additions.aigc_metadata = {
      enable: true,
      ...(o.aigcMetadata.contentProducer ? { content_producer: o.aigcMetadata.contentProducer } : {}),
      ...(o.aigcMetadata.produceId ? { produce_id: o.aigcMetadata.produceId } : {}),
      ...(o.aigcMetadata.contentPropagator
        ? { content_propagator: o.aigcMetadata.contentPropagator }
        : {}),
      ...(o.aigcMetadata.propagateId ? { propagate_id: o.aigcMetadata.propagateId } : {}),
    }
  }
  let res: Response
  try {
    res = await fetch(input.endpoint, {
      method: 'POST',
      headers: {
        'X-Api-Key': input.apiKey,
        'X-Api-Resource-Id': RESOURCE_ID,
        'X-Api-Request-Id': randomUUID(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        req_params: {
          text: input.text,
          speaker: input.voiceId,
          audio_params: {
            format: metaEnabled ? 'wav' : 'pcm',
            sample_rate: o.sampleRate,
            speech_rate: o.speechRate,
            loudness_rate: o.loudnessRate,
          },
          ...(Object.keys(additions).length ? { additions: JSON.stringify(additions) } : {}),
          ...(o.pitch !== 0 ? { post_process: { pitch: o.pitch } } : {}),
          ...(o.contextText ? { context_texts: [o.contextText] } : {}),
        },
      }),
      signal: AbortSignal.timeout(120_000),
    })
  } catch (e) {
    throw new Error(
      `火山语音接口请求失败（${input.endpoint}）：${e instanceof Error ? e.message : String(e)}`,
    )
  }
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    throw new Error(`火山语音接口返回 HTTP ${res.status}：${detail.slice(0, 300) || '无响应体'}`)
  }
  // 响应是 HTTP chunked 的连续 JSON 对象流：{code, message, data(base64 音频), usage?}
  const chunks: Buffer[] = []
  let textWords = 0
  let textBuf = ''
  const decoder = new TextDecoder()
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (value) textBuf += decoder.decode(value, { stream: true })
    for (;;) {
      const hit = extractJsonObject(textBuf)
      if (!hit) break
      textBuf = hit.rest
      let packet: {
        code?: number
        message?: string
        data?: string
        usage?: { text_words?: number }
      }
      try {
        packet = JSON.parse(hit.json) as typeof packet
      } catch {
        continue
      }
      if (typeof packet.usage?.text_words === 'number') textWords += packet.usage.text_words
      // code 0 = 正常数据包；20000000 = 流结束包（message 仍为 "OK"，成功语义）——其余才是错误
      if (typeof packet.code === 'number' && packet.code !== 0 && packet.code !== 20000000) {
        throw new Error(`火山语音合成失败（code ${packet.code}）：${packet.message || '未知错误'}`)
      }
      if (typeof packet.data === 'string' && packet.data) {
        chunks.push(Buffer.from(packet.data, 'base64'))
      }
    }
    if (done) break
  }
  if (chunks.length === 0) throw new Error('火山语音接口未返回音频数据（请检查音色 ID 是否有效）')
  const audio = Buffer.concat(chunks)
  return { pcm: metaEnabled ? wavToPcm(audio) : audio, textWords }
}

/** 把 16bit 单声道 PCM 段列表（段间插静音）封装成单个 WAV Buffer。 */
function pcmToWav(segments: Buffer[], sampleRate: number, gapMs: number): Buffer {
  const gap = Buffer.alloc(Math.round((sampleRate * gapMs) / 1000) * 2)
  const pieces: Buffer[] = []
  segments.forEach((seg, i) => {
    if (i > 0) pieces.push(gap)
    pieces.push(seg)
  })
  const pcm = Buffer.concat(pieces)
  const header = Buffer.alloc(44)
  const byteRate = sampleRate * 2 // 单声道 16bit
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // fmt 块长度
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // 单声道
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(2, 32) // block align
  header.writeUInt16LE(16, 34) // 位深
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

/**
 * 生成整期播客：解析脚本 → 逐行（串行，避免并发打满火山 QPS）合成 PCM → 拼 WAV 落盘，
 * 返回同源相对 URL（/api/files/xxx.wav）+ 计费字数合计（各句 usage.text_words 之和）。
 * 供 task-store 的 podcast 分支调用。
 */
export async function runPodcastGen(input: {
  script: string
  roles: PodcastRole[]
  /** 合成选项（部分省略走默认，metadata 子字段可省略）；lineGapMs 为本地拼接的句间静音。 */
  options?: Partial<Omit<SynthesisOptions, 'aigcMetadata'>> & {
    aigcMetadata?: {
      enable: boolean
      contentProducer?: string
      produceId?: string
      contentPropagator?: string
      propagateId?: string
    } | null
  }
  lineGapMs?: number
  settings: SettingsDTO
}): Promise<{ url: string; textWords: number }> {
  const { endpoint, apiKey } = resolveVolcTts(input.settings)
  const options: SynthesisOptions = {
    speechRate: input.options?.speechRate ?? 0,
    sampleRate: input.options?.sampleRate ?? SAMPLE_RATE_DEFAULT,
    loudnessRate: input.options?.loudnessRate ?? 0,
    pitch: input.options?.pitch ?? 0,
    filterParenthesis: input.options?.filterParenthesis ?? false,
    disableMarkdownFilter: input.options?.disableMarkdownFilter ?? false,
    disableEmojiFilter: input.options?.disableEmojiFilter ?? false,
    explicitLanguage: input.options?.explicitLanguage?.trim() ?? '',
    contextText: input.options?.contextText?.trim() ?? '',
    aigcWatermark: input.options?.aigcWatermark ?? false,
    aigcMetadata: input.options?.aigcMetadata?.enable
      ? {
          enable: true,
          contentProducer: input.options.aigcMetadata.contentProducer?.trim() ?? '',
          produceId: input.options.aigcMetadata.produceId?.trim() ?? '',
          contentPropagator: input.options.aigcMetadata.contentPropagator?.trim() ?? '',
          propagateId: input.options.aigcMetadata.propagateId?.trim() ?? '',
        }
      : null,
  }
  const lineGapMs = Math.max(0, input.lineGapMs ?? LINE_GAP_MS_DEFAULT)
  const roles = input.roles
  if (roles.length !== 2 || roles.some((r) => !r.name.trim() || !r.voiceId.trim())) {
    throw new Error('请配置两个角色（角色名 + 火山音色 ID 均不能为空）')
  }
  const lines = parsePodcastScript(input.script, roles)
  const segments: Buffer[] = []
  let totalTextWords = 0
  for (const [i, line] of lines.entries()) {
    const role = roles[line.roleIndex]
    try {
      const { pcm, textWords } = await synthesizeLine({
        endpoint,
        apiKey,
        text: line.text,
        voiceId: role.voiceId.trim(),
        options,
      })
      segments.push(pcm)
      totalTextWords += textWords
    } catch (e) {
      throw new Error(
        `第 ${i + 1} 句（${role.name.trim()}）合成失败：${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }
  const wav = pcmToWav(segments, options.sampleRate, lineGapMs)
  const fileName = `podcast_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}.wav`
  await writeFile(join(generatedFilesDir, fileName), wav)
  return { url: `/api/files/${fileName}`, textWords: totalTextWords }
}
