// 脚本分镜节点的纯函数：脚本拆行（对齐 server 侧 parsePodcastScript 语义）与
// LLM 输出 prompt 的 @ 引用归一。不依赖 React / store。

import type { StoryboardItem } from './types'

/** 拆出的一行台词：行原文（含「角色名: 」前缀，喂给 {{line}}）+ 说话人下标。 */
export type StoryboardLine = {
  line: string
  roleIndex: number
}

/**
 * 按「角色名: 台词」拆分脚本（语义对齐 apps/server/src/volc-tts.ts 的 parsePodcastScript：
 * 中英文冒号均可、角色名按长度降序匹配防「主持人2」被「主持人」抢先、
 * 无角色前缀的非空行并入上一句、首行无法识别抛可读错误）。
 * 差异：这里保留行原文（含角色名前缀）——分镜模板的 {{line}} 要的是整行，不是纯台词。
 */
export function splitScriptLines(script: string, roleNames: [string, string]): StoryboardLine[] {
  const candidates = roleNames
    .map((name, index) => ({ name: name.trim(), index }))
    .filter((r) => r.name)
    .sort((a, b) => b.name.length - a.name.length)
  const lines: StoryboardLine[] = []
  for (const raw of script.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    let matched = false
    for (const { name, index } of candidates) {
      if (!line.startsWith(name)) continue
      const rest = line.slice(name.length).trimStart()
      if (!rest.startsWith(':') && !rest.startsWith('：')) continue
      if (rest.slice(1).trim()) lines.push({ roleIndex: index, line })
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
      lines[lines.length - 1].line += `\n${line}`
    }
  }
  if (lines.length === 0) throw new Error('脚本为空：请按「角色名: 台词」每行一句填写对话脚本')
  return lines
}

/** 用当前脚本重建逐行条目：全部置 idle、清空 prompt/error（点「生成」时调用）。 */
export function buildItems(script: string, roleNames: [string, string]): StoryboardItem[] {
  return splitScriptLines(script, roleNames).map(({ line, roleIndex }) => ({
    line,
    roleIndex,
    status: 'idle' as const,
  }))
}

/**
 * 落成节点前归一 LLM 输出的资源引用：@ImageN → <<<image_N>>>、@AudioN → <<<audio_N>>>
 * （大小写不敏感）。模板范例里用 @Image1/@Audio1 引用人像参考图与该行 TTS 音频，
 * 画布实发的占位符约定是 <<<kind_N>>>（见 lib/mentions.ts applyMentions）——每个视频节点
 * 恰好连 1 图 1 音、Prompt 无注册 @ token 时全发连线资源，序号正好对上。
 */
export function normalizeShotPrompt(prompt: string): string {
  return prompt
    .replace(/@image(\d+)/gi, (_m, n: string) => `<<<image_${n}>>>`)
    .replace(/@audio(\d+)/gi, (_m, n: string) => `<<<audio_${n}>>>`)
    .replace(/@video(\d+)/gi, (_m, n: string) => `<<<video_${n}>>>`)
}
