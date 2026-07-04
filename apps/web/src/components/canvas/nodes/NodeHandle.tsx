import { type CSSProperties } from 'react'
import { Handle, Position, type HandleType } from '@xyflow/react'
import { type HandleTone, toneColor } from '@/lib/handleTypes'
import { handleTop } from './handleLayout'

/**
 * 统一的节点端点：环形连接点 + 端点外侧标签（默认隐藏，节点悬停/选中时才显示——见 index.css）。
 * - type：target（左侧输入）/ source（右侧输出）。
 * - index：同侧从上往下的槽位（0 起）；省略则用 React Flow 默认竖向居中。
 * - tone：prompt=粉 / image=绿 / default=灰（端点环与标签同色）。
 * - label：端点名（如 Prompt / System Prompt / Image 1 / Text / Image）。required 追加 `*`。
 */
export function NodeHandle({
  type,
  id,
  index,
  tone = 'default',
  label,
  required,
  title,
}: {
  type: HandleType
  id?: string
  index?: number
  tone?: HandleTone
  label?: string
  required?: boolean
  title?: string
}) {
  const isLeft = type === 'target'
  const color = toneColor(tone)
  const style: CSSProperties = {}
  if (index != null) style.top = handleTop(index)
  // 端点环颜色经 CSS 变量下发（见 index.css .react-flow__handle 用 var(--handle-color)）
  if (color) (style as Record<string, string>)['--handle-color'] = color

  return (
    <Handle
      type={type}
      id={id}
      position={isLeft ? Position.Left : Position.Right}
      style={style}
      title={title}
      // 必填端点用实心（填充）表示，其余为环形
      className={required ? 'node-handle--solid' : undefined}
    >
      {label && (
        <span
          className={`node-handle-label ${isLeft ? 'node-handle-label--left' : 'node-handle-label--right'}`}
          style={color ? { color } : undefined}
        >
          {label}
          {required ? <span className="text-current">*</span> : null}
        </span>
      )}
    </Handle>
  )
}
