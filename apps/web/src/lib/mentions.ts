// Prompt 节点「@ 引用资源」的 token 纯函数：解析/净化/消歧/构建期占位符替换。
// 文本中的 token 形如 `@[人物图.jpg]`（方括号定边界，内容为插入时的显示名快照），
// 身份存 PromptNodeData.mentions；构建请求时按身份找到 URL、替换为 <<<kind_N>>> 占位符，
// 任一环节解析不到（改名/断线/删节点/列表被裁）则 token 原样保留（当普通文本发出）。

import type { UpstreamRef } from './graph'
import type { MentionKind, PromptMentionRef } from './types'

/** 匹配文本中的 @[显示名] token（显示名不含 ] 与换行）。 */
export const MENTION_TOKEN_RE = /@\[([^\]\n]+)\]/g

/** 显示名 → 文本 token。 */
export function mentionToken(name: string): string {
  return `@[${name}]`
}

/** 净化显示名：剔除方括号、控制字符（含换行）折叠成空格（保证 token 边界安全），空则回退「资源」。 */
export function sanitizeMentionName(raw: string): string {
  const cleaned = raw
    .replace(/[[\]]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || '资源'
}

/** 消歧：base 已被占用则依次尝试 `base (2)`、`base (3)`…。 */
export function uniqueMentionName(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})`
    if (!taken.has(candidate)) return candidate
  }
}

/** 按显示名解析一个 token 到具体上游资源：mentions 查身份（同名取首个）→ refs 按身份匹配。 */
function resolveMention(
  name: string,
  mentions: PromptMentionRef[],
  refs: UpstreamRef[],
): UpstreamRef | undefined {
  // 同名 mention 取首个（跨 prompt 节点同名不同身份的碰撞概率极低，取首个无实际危害）
  const m = mentions.find((x) => x.name === name)
  if (!m) return undefined
  return refs.find(
    (r) =>
      r.nodeId === m.nodeId && r.kind === m.kind && (r.resultIndex ?? -1) === (m.resultIndex ?? -1),
  )
}

/**
 * 按 @ 在 prompt 中的出现顺序收集「被 @ 到且当前仍连线」的资源（身份去重，分资源类型返回）。
 * 供「只发被 @ 的资源」筛选语义：某类返回非空 → 该类实发列表 = 这些资源（@ 序）；
 * 返回空（没 @ 或全悬空）→ 该类退化为全发连线资源。悬空引用不计入。
 */
export function collectMentionedRefs(
  prompt: string,
  mentions: PromptMentionRef[],
  refs: UpstreamRef[],
): Record<MentionKind, UpstreamRef[]> {
  const out: Record<MentionKind, UpstreamRef[]> = { image: [], audio: [], video: [] }
  if (!mentions.length || !prompt.includes('@[')) return out
  const seen = new Set<string>()
  for (const match of prompt.matchAll(MENTION_TOKEN_RE)) {
    const ref = resolveMention(match[1], mentions, refs)
    if (!ref) continue
    const key = `${ref.nodeId}#${ref.kind}#${ref.resultIndex ?? -1}`
    if (seen.has(key)) continue
    seen.add(key)
    out[ref.kind].push(ref)
  }
  return out
}

/**
 * 把拼接完成的 prompt 中可解析的 @[name] 替换为 <<<kind_N>>> 占位符。
 * N = 该引用对应资源 URL 在「实发列表 lists[kind]」中的 1 基首次出现位置
 * （重复 URL 取首个；不在实发列表中——被 frames 裁掉 / 被 @ 筛选掉——则原样保留）。
 */
export function applyMentions(
  prompt: string,
  mentions: PromptMentionRef[],
  refs: UpstreamRef[],
  lists: Record<MentionKind, string[]>,
): string {
  if (!mentions.length || !prompt.includes('@[')) return prompt
  return prompt.replace(MENTION_TOKEN_RE, (raw, name: string) => {
    const ref = resolveMention(name, mentions, refs)
    if (!ref) return raw
    const idx = lists[ref.kind].indexOf(ref.url)
    return idx < 0 ? raw : `<<<${ref.kind}_${idx + 1}>>>`
  })
}

/**
 * 提交文本时的映射表清理：只清「token 已从文本中消失」的 mention（防垃圾堆积）；
 * 悬空（身份解析不到）但 token 仍在文本里的保留——重新连线即恢复可替换。
 */
export function pruneMentions(
  text: string,
  mentions: PromptMentionRef[] | undefined,
): PromptMentionRef[] {
  const list = mentions ?? []
  if (!list.length) return list
  const present = new Set<string>()
  for (const match of text.matchAll(MENTION_TOKEN_RE)) present.add(match[1])
  return list.filter((m) => present.has(m.name))
}
