import { useCallback, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { collectMentionCandidates, type MentionCandidate } from '@/lib/graph'
import { mentionToken, sanitizeMentionName, uniqueMentionName } from '@/lib/mentions'
import type { PromptMentionRef } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'

/**
 * Prompt 节点 @ 引用菜单的状态与交互逻辑（展示组件见 components/canvas/nodes/MentionMenu.tsx）。
 * 触发：非组词态输入 `@`（且前一字符非字母/数字，避免 email 误触）→ 打开菜单并记 anchor，
 * 此刻从 store 一次性计算下游候选；继续输入按显示名过滤；↑↓/Enter/Tab/Esc 键盘操作。
 * 选中后把 `@[显示名]` token 插入文本、身份写进节点 mentions（同身份复用已有映射，同名不同身份消歧）。
 */
export function useMentionMenu(opts: {
  nodeId: string
  textareaRef: RefObject<HTMLTextAreaElement | null>
  isComposing: () => boolean
  onInsert: (nextText: string, nextMentions: PromptMentionRef[], caretPos: number) => void
}) {
  const { nodeId, textareaRef, isComposing, onInsert } = opts
  const [open, setOpen] = useState(false)
  const [candidates, setCandidates] = useState<MentionCandidate[]>([])
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  // @ 字符在文本中的下标（token 替换起点）；用 ref 存避免 handleChange 闭包过期
  const anchorRef = useRef(0)

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setActiveIndex(0)
  }, [])

  const items = candidates.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))

  /** 由 PromptNode 的 onChange 包装调用（先走 field.onChange 再调这里）。 */
  const handleChange = useCallback(
    (value: string, caret: number) => {
      if (isComposing()) return // 中文组词期间不触发/不更新
      if (open) {
        const anchor = anchorRef.current
        // anchor 失效（@ 被删/光标移到 @ 前）或查询串跨行 → 关闭
        if (caret <= anchor || value[anchor] !== '@') {
          close()
          return
        }
        const q = value.slice(anchor + 1, caret)
        if (q.includes('\n') || q.length > 30) {
          close()
          return
        }
        setQuery(q)
        setActiveIndex(0)
        return
      }
      // 触发判定：光标前一字符恰为 @，且再前一字符是行首/非字母数字（避免 email 等场景误触）
      if (caret < 1 || value[caret - 1] !== '@') return
      const before = caret >= 2 ? value[caret - 2] : ''
      if (before && /[A-Za-z0-9]/.test(before)) return
      const state = useFlowStore.getState()
      const project = state.projects.find((p) => p.id === state.activeProjectId)
      if (!project) return
      anchorRef.current = caret - 1
      setCandidates(collectMentionCandidates(project, nodeId))
      setQuery('')
      setActiveIndex(0)
      setOpen(true)
    },
    [open, close, isComposing, nodeId],
  )

  const select = useCallback(
    (item: MentionCandidate) => {
      const ta = textareaRef.current
      if (!ta) return
      const state = useFlowStore.getState()
      const project = state.projects.find((p) => p.id === state.activeProjectId)
      const node = project?.nodes.find((n) => n.id === nodeId)
      const existing = node?.type === 'prompt' ? (node.data.mentions ?? []) : []
      // 同身份复用已有映射（同一资源多次 @ 得同一 token）；新身份则对已占用名消歧后追加
      const reuse = existing.find(
        (m) =>
          m.nodeId === item.nodeId &&
          m.kind === item.kind &&
          (m.resultIndex ?? -1) === (item.resultIndex ?? -1),
      )
      let name: string
      let nextMentions: PromptMentionRef[]
      if (reuse) {
        name = reuse.name
        nextMentions = existing
      } else {
        const taken = new Set(existing.map((m) => m.name))
        name = uniqueMentionName(sanitizeMentionName(item.name), taken)
        nextMentions = [
          ...existing,
          { name, nodeId: item.nodeId, kind: item.kind, resultIndex: item.resultIndex },
        ]
      }
      const token = mentionToken(name)
      const value = ta.value
      const caret = ta.selectionStart ?? value.length
      const anchor = anchorRef.current
      const nextText = `${value.slice(0, anchor)}${token} ${value.slice(caret)}`
      close()
      onInsert(nextText, nextMentions, anchor + token.length + 1)
    },
    [close, nodeId, onInsert, textareaRef],
  )

  /** 叠加到 Textarea 的 onKeyDown（仅菜单打开时拦截导航键）。 */
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!open) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => (items.length ? (i + 1) % items.length : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => (items.length ? (i - 1 + items.length) % items.length : 0))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (items[activeIndex]) {
          e.preventDefault()
          select(items[activeIndex])
        } else {
          close() // 无匹配时 Enter 回落为普通换行
        }
      } else if (e.key === 'Escape') {
        // 阻断冒泡：不让 React Flow 把 Esc 当成取消选中节点
        e.preventDefault()
        e.stopPropagation()
        close()
      }
    },
    [open, items, activeIndex, select, close],
  )

  return { open, items, activeIndex, setActiveIndex, close, select, handleChange, onKeyDown }
}
