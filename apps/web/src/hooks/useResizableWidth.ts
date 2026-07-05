import { useCallback, useEffect, useState } from 'react'

/**
 * 右侧停靠面板的可调宽度：面板靠右，拖左缘手柄往左拖变宽、往右拖变窄。
 * width 存 localStorage（跨会话保留）；min 为当前设计宽度（下限），max 防拖过头。
 */
export function useResizableWidth(storageKey: string, min: number, max = 720) {
  const [width, setWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem(storageKey))
    return Number.isFinite(saved) && saved >= min ? Math.min(saved, max) : min
  })

  useEffect(() => {
    localStorage.setItem(storageKey, String(width))
  }, [storageKey, width])

  const onPointerDownResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startW = width
      const onMove = (ev: PointerEvent) => {
        // 面板靠右：指针左移（clientX 变小）→ 变宽
        setWidth(Math.max(min, Math.min(max, startW + (startX - ev.clientX))))
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [width, min, max],
  )

  return { width, onPointerDownResize }
}
