import type { CSSProperties } from 'react'

// 端点(handle)竖向布局：不再垂直居中，改为从节点标题下方开始、同一侧多个端点按顺序向下排列。
// 标题占 node 顶部约 12–34px（py-3 + 一行标题），START 让首个端点落在标题正下方一点。
const HANDLE_TOP_START = 48
// 端点竖向间距（同侧上下两端点的距离）
const HANDLE_GAP = 32

/** 同一侧从上往下第 `index` 个端点（从 0 起）的竖向像素位置（供 Handle 定位 + 端点旁标签对齐共用）。 */
export function handleTop(index = 0): number {
  return HANDLE_TOP_START + index * HANDLE_GAP
}

/**
 * 同一侧（左/右）从上往下第 `index` 个端点（从 0 起）的竖向定位样式，直接铺给 `<Handle style>`。
 * 覆盖 React Flow 默认的 `top: 50%` 垂直居中；水平贴边与居中平移仍由 handle-left/-right 类负责。
 */
export function handleStyle(index = 0): CSSProperties {
  return { top: handleTop(index) }
}
