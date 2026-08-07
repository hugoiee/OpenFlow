// 「锚在某个屏幕矩形旁的 fixed 浮层」定位计算：首选方向放不下就翻转，水平方向防溢出。
// 纯函数不碰 DOM（视口尺寸可注入），供 @ 引用菜单与 tag 悬停预览共用。

export type FloatingSide = 'top' | 'bottom'

/** 锚点矩形（视口坐标，取自 getBoundingClientRect / getClientRects）。 */
export type AnchorRect = { top: number; bottom: number; left: number; right: number }

export type FloatingPosition = {
  left: number
  /** side='bottom' 时给出（距视口顶）。 */
  top?: number
  /** side='top' 时给出（距视口底）——用 bottom 而非 top，内容比 maxHeight 矮时才不会与锚点脱开。 */
  bottom?: number
  /** 按该方向可用空间收窄后的最大高度（浮层内部自行滚动）。 */
  maxHeight: number
  side: FloatingSide
}

/** 首选方向可用空间低于此值就考虑翻转（约 2~3 个菜单项）。 */
const MIN_USABLE = 120
/** 翻转后也放不下时的兜底高度（仍可内部滚动）。 */
const MIN_HEIGHT = 64

/**
 * 按锚点矩形与浮层尺寸算出视口内的 fixed 定位。
 * 首选方向（默认下方）空间够用就不翻；不够且另一侧更宽裕才翻转；两侧都不足时取较大一侧并压缩 maxHeight。
 */
export function placeFloating(
  anchor: AnchorRect,
  opts: {
    width: number
    maxHeight: number
    /** 首选展开方向，默认 'bottom'。 */
    side?: FloatingSide
    /** 水平对齐：'start' 左对齐锚点 / 'center' 居中于锚点，默认 'start'。 */
    align?: 'start' | 'center'
    /** 与锚点的间距，默认 4。 */
    gap?: number
    /** 与视口边缘的最小留白，默认 8。 */
    margin?: number
    viewport?: { width: number; height: number }
  },
): FloatingPosition {
  const { width, maxHeight, side = 'bottom', align = 'start', gap = 4, margin = 8 } = opts
  const vw = opts.viewport?.width ?? window.innerWidth
  const vh = opts.viewport?.height ?? window.innerHeight

  const spaceOf = (s: FloatingSide) =>
    s === 'bottom' ? vh - anchor.bottom - gap - margin : anchor.top - gap - margin
  const other: FloatingSide = side === 'bottom' ? 'top' : 'bottom'
  // 首选方向够用（或本来就不比另一侧差）就不翻
  const use =
    spaceOf(side) >= Math.min(maxHeight, MIN_USABLE) || spaceOf(side) >= spaceOf(other) ? side : other
  const height = Math.max(MIN_HEIGHT, Math.min(maxHeight, spaceOf(use)))

  const rawLeft =
    align === 'center' ? anchor.left + (anchor.right - anchor.left) / 2 - width / 2 : anchor.left
  const left = Math.min(Math.max(margin, rawLeft), Math.max(margin, vw - width - margin))

  return use === 'bottom'
    ? { left, top: anchor.bottom + gap, maxHeight: height, side: 'bottom' }
    : { left, bottom: vh - anchor.top + gap, maxHeight: height, side: 'top' }
}
