import { useCallback, useEffect, useRef, useState, type MouseEvent, type RefObject } from 'react'
import { findMentionResource, type MentionResource } from '@/lib/graph'
import type { PromptMentionRef } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'

/** 悬停多久才弹预览（ms）：避免鼠标划过一串 tag 时闪个不停。 */
const OPEN_DELAY = 150

export type MentionHit = {
  mention: PromptMentionRef
  /** 资源快照；源节点已删/结果已清空时为 null（预览层显示「已失效」）。 */
  resource: MentionResource | null
  /** 命中的药丸元素与它的第几条 client rect（跨行 token 有多条）——预览层据此每帧重测。 */
  el: HTMLElement
  rectIndex: number
}

/**
 * Prompt 文本里 @ tag 药丸的悬停命中测试。
 *
 * 药丸画在 Textarea **下方**的高亮层且 pointer-events-none，挂不了 onMouseEnter，
 * 故改为在 Textarea 上听 mousemove，用各药丸的 getClientRects() 做几何命中
 * （高亮层与 Textarea 逐像素对齐，鼠标视口坐标可直接比对）。mousemove 用 rAF 合帧节流。
 */
export function useMentionHover(opts: {
  overlayRef: RefObject<HTMLElement | null>
  mentions: PromptMentionRef[] | undefined
  /** 菜单打开 / IME 组词时禁用，避免两层浮层打架。 */
  enabled: boolean
}) {
  const { overlayRef, mentions, enabled } = opts
  const [hit, setHit] = useState<MentionHit | null>(null)
  const hitRef = useRef<MentionHit | null>(null)
  const rafRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pointRef = useRef<{ x: number; y: number } | null>(null)
  // mentions 用 ref 持有：mousemove 回调不必因它变化而重建（提交阶段同步，不在渲染中写 ref）
  const mentionsRef = useRef(mentions)
  useEffect(() => {
    mentionsRef.current = mentions
  })

  /** 设置命中态并同步镜像 ref（都发生在事件/定时器回调里，非渲染期）。 */
  const applyHit = useCallback((next: MentionHit | null) => {
    hitRef.current = next
    setHit(next) // 相同值（null → null）React 自会跳过重渲染
  }, [])

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    applyHit(null)
  }, [applyHit])

  // 禁用（菜单打开）时取消待弹的定时器；命中态本身在返回值处派生掉，不在 effect 里 setState
  useEffect(() => {
    if (enabled || timerRef.current === null) return
    clearTimeout(timerRef.current)
    timerRef.current = null
  }, [enabled])

  // 卸载时清理 rAF 与定时器
  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    },
    [],
  )

  /** 遍历高亮层里的药丸，逐条 client rect 判包含（软换行会把一个 token 切成多条）。 */
  const hitTest = useCallback(
    (x: number, y: number) => {
      const root = overlayRef.current
      if (!root) return null
      for (const el of root.querySelectorAll<HTMLElement>('[data-mention-name]')) {
        const rects = el.getClientRects()
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i]
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
            return { el, rectIndex: i, name: el.dataset.mentionName ?? '' }
          }
        }
      }
      return null
    },
    [overlayRef],
  )

  const onMouseMove = useCallback(
    (e: MouseEvent<HTMLTextAreaElement>) => {
      if (!enabled || !mentionsRef.current?.length) return
      if (e.buttons !== 0) {
        clear() // 正在拖选文本：不打扰
        return
      }
      pointRef.current = { x: e.clientX, y: e.clientY }
      if (rafRef.current !== null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        const pt = pointRef.current
        if (!pt) return
        const found = hitTest(pt.x, pt.y)
        if (!found) {
          clear()
          return
        }
        const current = hitRef.current
        if (current && current.el === found.el && current.rectIndex === found.rectIndex) return
        // 命中新药丸：延时后再解析身份与资源
        if (timerRef.current !== null) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
          timerRef.current = null
          // 悬停是瞬时态，用 getState() 取快照即可（selector 返回新对象会引发重复渲染）
          const state = useFlowStore.getState()
          const project = state.projects.find((p) => p.id === state.activeProjectId)
          // 同名取首个，与 mentions.ts 的 resolveMention 约定一致
          const mention = mentionsRef.current?.find((m) => m.name === found.name)
          if (!project || !mention) return
          applyHit({
            mention,
            resource: findMentionResource(project, mention),
            el: found.el,
            rectIndex: found.rectIndex,
          })
        }, OPEN_DELAY)
      })
    },
    [enabled, clear, hitTest, applyHit],
  )

  // 禁用时直接派生成 null（预览立即消失），无需在 effect 里改状态
  return { hit: enabled ? hit : null, onMouseMove, onMouseLeave: clear, clear }
}
