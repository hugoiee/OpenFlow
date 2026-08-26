// 脚本分镜节点的纯函数：脚本拆行（对齐 server 侧 parsePodcastScript 语义 + 标题行容错）、
// 按语速切段（seedance 2.0 只支持 4~15s 单段）与 LLM 输出 prompt 的 @ 引用归一。
// 不依赖 React / store。

import {
  STORYBOARD_CHARS_PER_SECOND,
  STORYBOARD_SEG_MAX_SECONDS,
  STORYBOARD_SEG_MIN_SECONDS,
} from './nodeCatalog'
import { escapeTsvField, parseTsvTable } from './tsv'
import type { StoryboardItem } from './types'

/** 拆出的一个说话人回合：整段台词（不含角色名前缀）+ 说话人下标。 */
export type StoryboardTurn = {
  text: string
  roleIndex: number
}

/** 无前缀行短于该长度视作小节标题跳过（长的视作上一句的续行并入）。 */
const HEADING_MAX_CHARS = 20

/**
 * 按「角色名: 台词」拆分脚本为说话人回合（语义对齐 apps/server/src/volc-tts.ts 的
 * parsePodcastScript：中英文冒号均可、角色名按长度降序匹配防「主持人2」被「主持人」抢先）。
 * 标题容错（播客脚本 docx 原文常带大标题/小节标题）：首个说话人行之前的行一律跳过；
 * 文中无前缀的短行（≤20 字）视作小节标题跳过，长行视作续行并入上一句。
 * 整篇没有可识别台词时抛可读错误。
 */
export function splitScriptTurns(
  script: string,
  roleNames: [string, string],
): StoryboardTurn[] {
  const candidates = roleNames
    .map((name, index) => ({ name: name.trim(), index }))
    .filter((r) => r.name)
    .sort((a, b) => b.name.length - a.name.length)
  const turns: StoryboardTurn[] = []
  for (const raw of script.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    let matched = false
    for (const { name, index } of candidates) {
      if (!line.startsWith(name)) continue
      const rest = line.slice(name.length).trimStart()
      if (!rest.startsWith(':') && !rest.startsWith('：')) continue
      const text = rest.slice(1).trim()
      if (text) turns.push({ roleIndex: index, text })
      matched = true
      break
    }
    if (!matched && turns.length > 0) {
      // 短行=小节标题跳过；长行=续行并入上一回合
      if (line.length > HEADING_MAX_CHARS) turns[turns.length - 1].text += `\n${line}`
    }
    // 首个说话人行之前的行（大标题/引言）：直接跳过
  }
  if (turns.length === 0) {
    throw new Error(
      '脚本里没有可识别的台词：每句请以「角色名: 」开头（中英文冒号均可），角色名需与节点里配置的一致',
    )
  }
  return turns
}

/** 数「实际念出的字」：去掉空白与中英文标点后的字符数（语速按念出的字算，标点只是停顿）。 */
export function countSpokenChars(text: string): number {
  return text.replace(/[\s\p{P}\p{S}]/gu, '').length
}

// 句级切分：按句末标点（。！？；…以及英文 .!?;）切开，标点跟随前句
const SENTENCE_RE = /[^。！？；…!?;]*[。！？；…!?;]+|[^。！？；…!?;]+$/g
// 逗号级切分（超长单句的次级切点）：、，以及英文逗号
const CLAUSE_RE = /[^，、,]*[，、,]+|[^，、,]+$/g

/** 单段最多可念的字数（15s × 每秒字数）。语速可调故按需现算。 */
const segMaxChars = (charsPerSecond: number) =>
  STORYBOARD_SEG_MAX_SECONDS * charsPerSecond
/** 低于该字数（4s × 每秒字数）的尾段尽量并回前段，避免「台词几个字、视频好几秒」的发呆段。 */
const segMinChars = (charsPerSecond: number) =>
  STORYBOARD_SEG_MIN_SECONDS * charsPerSecond

/** 把可能超长的片段按逗号（仍超则硬切）切成 ≤SEG_MAX_CHARS 的块。 */
function splitOversized(piece: string, SEG_MAX_CHARS: number): string[] {
  if (countSpokenChars(piece) <= SEG_MAX_CHARS) return [piece]
  const out: string[] = []
  let buf = ''
  for (const raw of piece.match(CLAUSE_RE) ?? [piece]) {
    let clause = raw
    if (buf && countSpokenChars(buf + clause) > SEG_MAX_CHARS) {
      out.push(buf)
      buf = ''
    }
    // 单个小句仍超长（几乎不可能的极端脏数据）：按字符硬切兜底
    while (countSpokenChars(clause) > SEG_MAX_CHARS && clause.length > SEG_MAX_CHARS) {
      out.push(clause.slice(0, SEG_MAX_CHARS))
      clause = clause.slice(SEG_MAX_CHARS)
    }
    buf += clause
  }
  if (buf) out.push(buf)
  return out
}

/**
 * 把一个说话人回合切成若干段，每段念出字数 ≤ 15s 语速上限：
 * 先按句末标点切句 → 贪心装箱（装得下就并入当前段）→ 超长单句按逗号再切 →
 * 结尾短尾段（< 4s 字数）能并回前段则并回。返回各段文本（换行合并为空格）。
 * charsPerSecond=切分语速（字/秒，切割节点上可调），省略则按默认 6。
 */
export function splitTurnIntoSegments(
  text: string,
  charsPerSecond: number = STORYBOARD_CHARS_PER_SECOND,
): string[] {
  const SEG_MAX_CHARS = segMaxChars(charsPerSecond)
  const SEG_MIN_CHARS = segMinChars(charsPerSecond)
  const flat = text.replaceAll('\n', ' ').trim()
  if (!flat) return []
  const pieces = (flat.match(SENTENCE_RE) ?? [flat]).map((s) => s.trim()).filter(Boolean)
  const segments: string[] = []
  let buf = ''
  for (const piece of pieces) {
    for (const chunk of splitOversized(piece, SEG_MAX_CHARS)) {
      if (buf && countSpokenChars(buf + chunk) > SEG_MAX_CHARS) {
        segments.push(buf)
        buf = ''
      }
      buf += chunk
    }
  }
  if (buf) segments.push(buf)
  // 尾段太短且并回前段不超限 → 并回，避免超短段
  if (segments.length >= 2) {
    const last = segments[segments.length - 1]
    const prev = segments[segments.length - 2]
    if (
      countSpokenChars(last) < SEG_MIN_CHARS &&
      countSpokenChars(prev + last) <= SEG_MAX_CHARS
    ) {
      segments.splice(segments.length - 2, 2, prev + last)
    }
  }
  return segments
}

/**
 * 段文本 → 估算视频时长（秒）：念出字数/语速，四舍五入后夹到 4~15。
 * charsPerSecond 省略则按默认 6（分镜节点的行内重估/Excel 导入走默认，只有切割节点传值）。
 */
export function estimateSegmentDuration(
  text: string,
  charsPerSecond: number = STORYBOARD_CHARS_PER_SECOND,
): number {
  const seconds = Math.round(countSpokenChars(text) / charsPerSecond)
  return Math.min(
    STORYBOARD_SEG_MAX_SECONDS,
    Math.max(STORYBOARD_SEG_MIN_SECONDS, seconds),
  )
}

/**
 * 用脚本原文重建分镜表格行：拆说话人回合 → 每回合按语速切段 → 每段估算时长；
 * 全部置 idle、清空 prompt/error。text 不含角色名前缀（表格 A 列是说话人、B 列是段文本）。
 * 切割节点与分镜节点的「切分脚本」双入口共用；charsPerSecond=切分语速（省略按默认 6，
 * 只有切割节点会传自己配置的档位）。
 */
export function buildItems(
  script: string,
  roleNames: [string, string],
  charsPerSecond: number = STORYBOARD_CHARS_PER_SECOND,
): StoryboardItem[] {
  const items: StoryboardItem[] = []
  for (const turn of splitScriptTurns(script, roleNames)) {
    for (const segment of splitTurnIntoSegments(turn.text, charsPerSecond)) {
      items.push({
        text: segment,
        roleIndex: turn.roleIndex,
        duration: estimateSegmentDuration(segment, charsPerSecond),
        status: 'idle' as const,
      })
    }
  }
  if (items.length === 0) {
    throw new Error('脚本为空：请按「角色名: 台词」每行一句填写对话脚本')
  }
  return items
}

// ---- Excel（TSV）双向互通 ----
// 转义/解析的通用原语在 lib/tsv.ts（评估项目表格共用），这里只放分镜表的列语义。

/** 分镜表 → TSV（含表头：序号/发言人/脚本/时长(秒)/prompt），供「复制表格」粘进 Excel。 */
export function itemsToTsv(items: StoryboardItem[], roleNames: [string, string]): string {
  const roleName = (i: number) => roleNames[i]?.trim() || (i === 0 ? '角色A' : '角色B')
  const rows = items.map((it, i) =>
    [
      String(i + 1),
      roleName(it.roleIndex),
      escapeTsvField(it.text),
      String(it.duration ?? ''),
      escapeTsvField(it.prompt ?? ''),
    ].join('\t'),
  )
  return ['序号\t发言人\t脚本\t时长(秒)\tprompt', ...rows].join('\n')
}

/**
 * 从 Excel 粘贴的行导入分镜表。列约定（\t 分隔）：[序号,] 发言人, 脚本 [, 时长]——
 * 首列纯数字视作序号丢弃，表头行（含「发言人/脚本/时长/说话人」字样）自动跳过；
 * 时长缺省按语速估算，超范围夹到 4~15；prompt 列不导入（那是 LLM 的产出）。
 * 发言人去重后最多 2 个：与节点已配角色名对得上则沿用其 A/B 映射，否则按出现序作 A/B。
 */
/**
 * 表头列名 → 字段的识别词。**别处生成的表列序往往和本节点的导出格式不一样**，
 * 故有表头时一律按列名认列；认不出表头才回退到固定列序。
 */
const HEADER_ALIASES: {
  key: 'speaker' | 'text' | 'duration' | 'prompt'
  words: string[]
}[] = [
  { key: 'speaker', words: ['发言人', '说话人', '角色'] },
  { key: 'text', words: ['脚本', '台词', '文本', '内容'] },
  { key: 'duration', words: ['时长', '秒数', 'duration'] },
  { key: 'prompt', words: ['prompt', '提示词', '画面描述', '分镜描述'] },
]

/** 首行像表头就解析成 字段→列下标 的映射；认不出任何一列则返回 null（按列序走）。 */
function parseHeaderRow(cells: string[]): Partial<Record<string, number>> | null {
  const map: Partial<Record<string, number>> = {}
  cells.forEach((raw, i) => {
    const cell = raw.trim().toLowerCase()
    if (!cell) return
    for (const { key, words } of HEADER_ALIASES) {
      // 已认过的字段不被后面的列覆盖（表里出现两个「脚本…」时以第一个为准）
      if (map[key] === undefined && words.some((w) => cell.includes(w))) {
        map[key] = i
        return
      }
    }
  })
  // 发言人与脚本是必需列：认不全就不算表头，回退列序解析
  return map.speaker !== undefined && map.text !== undefined ? map : null
}

export function parseItemsTsv(
  text: string,
  currentRoles: [string, string],
): { items: StoryboardItem[]; roleAName: string; roleBName: string } {
  let rows = parseTsvTable(text)
  const headerWords = ['发言人', '说话人', '脚本', '时长', '序号', 'prompt']
  let columns: Partial<Record<string, number>> | null = null
  if (
    rows.length > 0 &&
    rows[0].some((c) => headerWords.some((w) => c.trim().includes(w)))
  ) {
    columns = parseHeaderRow(rows[0])
    rows = rows.slice(1)
  }
  const parsed: { speaker: string; text: string; duration?: number; prompt?: string }[] =
    []
  for (const raw of rows) {
    let cells = raw.map((c) => c.trim())
    let speaker: string | undefined
    let segText: string | undefined
    let durText: string | undefined
    let promptText: string | undefined
    if (columns) {
      // 有表头：按列名定位，列序随便排、少一列多一列都不影响
      speaker = cells[columns.speaker!]
      segText = cells[columns.text!]
      durText = columns.duration === undefined ? undefined : cells[columns.duration]
      promptText = columns.prompt === undefined ? undefined : cells[columns.prompt]
    } else {
      // 无表头：沿用固定列序 [序号,] 发言人, 脚本 [, 时长 [, prompt]]
      // 首列纯数字 = Excel 里的序号列，丢弃
      if (cells.length >= 3 && /^\d+$/.test(cells[0])) cells = cells.slice(1)
      ;[speaker, segText, durText, promptText] = cells
    }
    if (!speaker || !segText?.trim()) continue
    const dur = Number(durText)
    parsed.push({
      speaker,
      text: segText.trim(),
      duration: Number.isFinite(dur) && durText ? dur : undefined,
      prompt: promptText?.trim() || undefined,
    })
  }
  if (parsed.length === 0) {
    throw new Error('没有可导入的行：每行至少要有「发言人」和「脚本」两列（Tab 分隔）')
  }
  const speakers = [...new Set(parsed.map((r) => r.speaker))]
  if (speakers.length > 2) {
    throw new Error(`发言人超过 2 个（${speakers.join('、')}）：分镜节点只支持双人对话`)
  }
  // 与已配角色名对得上（不论顺序）则沿用既有 A/B 映射，否则按出现序作 A/B
  const [curA, curB] = [currentRoles[0].trim(), currentRoles[1].trim()]
  let roleAName: string
  let roleBName: string
  if (speakers.every((s) => s === curA || s === curB) && curA && curB) {
    roleAName = curA
    roleBName = curB
  } else {
    roleAName = speakers[0]
    roleBName = speakers[1] ?? curB
  }
  const roleIndexOf = (s: string) => (s === roleAName ? 0 : 1)
  const clamp = (n: number) =>
    Math.min(
      STORYBOARD_SEG_MAX_SECONDS,
      Math.max(STORYBOARD_SEG_MIN_SECONDS, Math.round(n)),
    )
  const items: StoryboardItem[] = parsed.map((r) => ({
    text: r.text,
    roleIndex: roleIndexOf(r.speaker),
    duration: r.duration != null ? clamp(r.duration) : estimateSegmentDuration(r.text),
    // 带着 prompt 进来的行直接算已完成：可以跳过「生成」直接落成节点
    ...(r.prompt
      ? { prompt: r.prompt, status: 'done' as const }
      : { status: 'idle' as const }),
  }))
  return { items, roleAName, roleBName }
}

/**
 * 落成节点前归一 LLM 输出的资源引用：@ImageN → <<<image_N>>>、@AudioN → <<<audio_N>>>
 * （大小写不敏感）。模板范例里用 @Image1/@Audio1 引用人像参考图与角色音色参考，
 * 画布实发的占位符约定是 <<<kind_N>>>（见 lib/mentions.ts applyMentions）——每个视频节点
 * 恰好连 1 图 1 音、Prompt 无注册 @ token 时全发连线资源，序号正好对上。
 */
export function normalizeShotPrompt(prompt: string): string {
  return prompt
    .replace(/@image(\d+)/gi, (_m, n: string) => `<<<image_${n}>>>`)
    .replace(/@audio(\d+)/gi, (_m, n: string) => `<<<audio_${n}>>>`)
    .replace(/@video(\d+)/gi, (_m, n: string) => `<<<video_${n}>>>`)
}
