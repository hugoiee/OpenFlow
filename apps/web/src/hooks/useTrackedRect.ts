import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/**
 * 每帧重测一个屏幕矩形（fixed 浮层定位用），取整后签名变化才 setState。
 *
 * 为什么用 rAF 轮询而不是拼事件监听：矩形失效的来源太多——画布平移/缩放、节点拖动、
 * Textarea 内部滚动、窗口 resize、NodeResizer 改尺寸、右侧面板开合引起的布局位移……
 * 逐个监听既容易漏又难维护。这里只对 1 个元素做 getBoundingClientRect，且**只在浮层挂载
 * 期间运行**（@ 菜单 / 悬停预览都是「打开才挂载」），空闲时因签名不变也不触发重渲染。
 * 同 floating-ui 的 autoUpdate({ animationFrame: true }) 思路。
 *
 * clipRef：可选的可视区容器（如 Textarea）。锚点纵向滚出该容器时返回 null，
 * 让调用方隐藏浮层（避免浮层飘在输入框外面指着看不见的字符）。
 */
export function useTrackedRect(
  getRect: () => DOMRect | null,
  clipRef?: RefObject<HTMLElement | null>,
): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null)
  // 每次渲染刷新，避免 rAF 循环里读到过期闭包（调用方常传内联箭头函数）
  const getRef = useRef(getRect)
  useEffect(() => {
    getRef.current = getRect
  })
  const sigRef = useRef('')

  useLayoutEffect(() => {
    let raf = 0
    const measure = () => {
      let next = getRef.current()
      if (next && clipRef?.current) {
        const clip = clipRef.current.getBoundingClientRect()
        const mid = (next.top + next.bottom) / 2
        if (mid < clip.top || mid > clip.bottom) next = null // 锚点滚出可视区
      }
      const sig = next
        ? `${Math.round(next.left)},${Math.round(next.top)},${Math.round(next.width)},${Math.round(next.height)}`
        : ''
      if (sig !== sigRef.current) {
        sigRef.current = sig
        setRect(next)
      }
    }
    // 同步先测一次：React 在同一 commit 里先赋 ref 再跑 layout effect，
    // 故浮层挂载的那一帧就有位置，不会先画在 (0,0) 再跳。
    measure()
    const tick = () => {
      measure()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [clipRef])

  return rect
}
