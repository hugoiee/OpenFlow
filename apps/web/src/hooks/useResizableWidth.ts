import { useCallback, useRef, useState } from 'react'

/**
 * 右侧停靠面板的可调宽度：面板靠右，拖左缘手柄往左拖变宽、往右拖变窄。
 * width 存 localStorage（跨会话保留）；min 为当前设计宽度（下限），max 防拖过头。
 * 性能：pointermove 按 rAF 合帧 setState（一帧最多重渲染一次）；localStorage 是同步 IO，
 * 只在松手时写一次，不随拖动每帧写。
 */
export function useResizableWidth(storageKey: string, min: number, max = 720) {
  const [width, setWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem(storageKey))
    return Number.isFinite(saved) && saved >= min ? Math.min(saved, max) : min
  })
  // 当前宽度的 ref 镜像：让 onPointerDownResize 不依赖 width（回调引用稳定）
  const widthRef = useRef(width)

  const onPointerDownResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startW = widthRef.current
      let next = startW
      let raf = 0
      const onMove = (ev: PointerEvent) => {
        // 面板靠右：指针左移（clientX 变小）→ 变宽
        next = Math.max(min, Math.min(max, startW + (startX - ev.clientX)))
        if (raf) return
        raf = requestAnimationFrame(() => {
          raf = 0
          widthRef.current = next
          setWidth(next)
        })
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        if (raf) cancelAnimationFrame(raf)
        widthRef.current = next
        setWidth(next)
        localStorage.setItem(storageKey, String(next))
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [storageKey, min, max],
  )

  return { width, onPointerDownResize }
}
