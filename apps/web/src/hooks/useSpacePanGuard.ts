import { useEffect, useRef } from 'react'

/** 认为「还在打字」的时间窗：上次输入这么久之内的空格一律当正常打字，不抢。 */
const TYPING_IDLE_MS = 700

function isEditable(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false
  return el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable
}

/**
 * 空格平移与节点内输入框抢按键的守卫。
 *
 * 问题：在 Prompt 等节点的输入框里打完字后，焦点仍留在该输入框；此时把鼠标移到画布空白处
 * 按住空格想平移，空格会被输入框吃掉（连打一串空格），而 React Flow 的 useKeyPress 又因
 * `isInputDOMNode` 判定「焦点在输入框」而**不激活平移** —— 于是只进空格、画布不动。
 *
 * 处理：只在「用户明显是想平移」时把这次空格从输入框手里抢过来 —— 需同时满足
 *   1. 焦点在画布节点内的输入框（Inspector / 弹窗里的输入框不管）；
 *   2. 指针停在画布空白处（不在任何节点上）——指针还在节点上就说明人在这儿打字；
 *   3. 已停止输入超过 TYPING_IDLE_MS，或这是长按的重复按键（e.repeat）。
 * 命中则吞掉这次空格 + 让输入框失焦，并补发一个「不在输入框里」的空格 keydown，
 * 使 React Flow 立刻进入平移态（否则要等系统按键重复才生效，短按秒拖会变成框选）。
 *
 * 中文组词中的空格是选字，直接放行；带修饰键的组合键也不拦。
 */
export function useSpacePanGuard() {
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const lastInputAt = useRef(0)

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY }
    }
    const onInput = () => {
      lastInputAt.current = Date.now()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
      if (e.isComposing || e.keyCode === 229) return // 输入法组词中，空格是选字

      const el = document.activeElement
      if (!isEditable(el) || !el.closest('.react-flow__node')) return

      const p = pointer.current
      if (!p) return
      const under = document.elementFromPoint(p.x, p.y)
      if (!under?.closest('.react-flow')) return // 指针不在画布上
      if (under.closest('.react-flow__node')) return // 指针停在节点上 → 就是在打字

      const typing = !e.repeat && Date.now() - lastInputAt.current < TYPING_IDLE_MS
      if (typing) return

      e.preventDefault()
      el.blur()
      // 补一次「目标不是输入框」的空格按下，让 React Flow 的 panActivationKeyCode 立即生效
      document.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }),
      )
    }

    document.addEventListener('pointermove', onPointerMove, true)
    document.addEventListener('input', onInput, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointermove', onPointerMove, true)
      document.removeEventListener('input', onInput, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [])
}
