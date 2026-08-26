import { useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Image as ImageIcon } from 'lucide-react'
import {
  ANGLE_ROTATION_MAX,
  ANGLE_ROTATION_MIN,
  ANGLE_STEP,
  ANGLE_TILT_MAX,
  ANGLE_TILT_MIN,
  clampRotation,
  clampTilt,
  zoomLabel,
  type AngleZoom,
} from '@/lib/angle'

/**
 * 摄像头轨道控件（多角度节点 Inspector 用）：线框球 = 相机绕主体的轨道，中心是源图缩略图，
 * 球面上的相机指示物按 (rotation, tilt) 定位。直接拖球面或点四向箭头即可调角度，
 * 与下方滑杆双向同步（纯受控组件，无内部持久状态）。
 * 挂在 Inspector（React Flow 之外），无需 nodrag；缩放（zoom）只影响指示物大小，编辑权在滑杆。
 */

// SVG 画布与球体几何：viewBox 200×200、球心 (100,100)、半径 78。
const C = 100
const R = 78
// 视角倾角：正交投影下不给视点一个小俯角，纬线会塌成直线、球「立不起来」。
const ALPHA = (18 * Math.PI) / 180
// 拖拽灵敏度（°/px）：~200px 的容器拖满幅约 180°。
const DRAG_DEG_PER_PX = 0.9

/** (rotation, tilt) → 球面点绕 X 轴倾 ALPHA 后的正交投影屏幕坐标 + 深度（>0 为前半球）。 */
function project(rotation: number, tilt: number) {
  const th = (rotation * Math.PI) / 180
  const ph = (tilt * Math.PI) / 180
  const x3 = R * Math.sin(th) * Math.cos(ph)
  const y3 = R * Math.sin(ph)
  const z3 = R * Math.cos(th) * Math.cos(ph)
  return {
    x: C + x3,
    y: C - (y3 * Math.cos(ALPHA) - z3 * Math.sin(ALPHA)),
    depth: y3 * Math.sin(ALPHA) + z3 * Math.cos(ALPHA),
  }
}

/** 纬线椭圆参数（纬度 phi 的圆在倾角 ALPHA 视角下的投影）。 */
function latitudeEllipse(phiDeg: number) {
  const phi = (phiDeg * Math.PI) / 180
  const r = R * Math.cos(phi)
  return { cy: C - R * Math.sin(phi) * Math.cos(ALPHA), rx: r, ry: Math.max(r * Math.sin(ALPHA), 1) }
}

export function CameraOrbit({
  rotation,
  tilt,
  zoom,
  imageUrl,
  onChange,
}: {
  rotation: number
  tilt: number
  zoom: AngleZoom
  /** 源图 URL（画在球心；未连图时显示占位图标）。 */
  imageUrl?: string
  /** 拖拽/箭头改角度时回调（两个值一起给，一次 move 至多一次）。 */
  onChange: (next: { rotation: number; tilt: number }) => void
}) {
  const [dragging, setDragging] = useState(false)
  // 拖拽起点快照 + 上次回调值：move 取整后与上次相同就不回调，把 store 写频压到「每变 1° 一次」
  const dragRef = useRef<{ startX: number; startY: number; rotation: number; tilt: number } | null>(
    null,
  )
  const lastSent = useRef<{ r: number; t: number } | null>(null)

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, rotation, tilt }
    lastSent.current = { r: rotation, t: tilt }
    setDragging(true)
  }
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const nextR = clampRotation(drag.rotation + (e.clientX - drag.startX) * DRAG_DEG_PER_PX)
    // 上拖 = 相机升高（tilt 增大），故 y 取反
    const nextT = clampTilt(drag.tilt + (drag.startY - e.clientY) * DRAG_DEG_PER_PX)
    if (lastSent.current?.r === nextR && lastSent.current?.t === nextT) return
    lastSent.current = { r: nextR, t: nextT }
    onChange({ rotation: nextR, tilt: nextT })
  }
  const endDrag = () => {
    dragRef.current = null
    lastSent.current = null
    setDragging(false)
  }

  const nudge = (dr: number, dt: number) =>
    onChange({ rotation: clampRotation(rotation + dr), tilt: clampTilt(tilt + dt) })

  const cam = project(rotation, tilt)
  const behind = cam.depth < 0
  // 指示物大小：深度线索（后半球略小）× 缩放三档（近大远小）
  const depthScale = 0.85 + (0.15 * (cam.depth / R + 1)) / 2
  const zoomScale = zoom === 'close' ? 1.25 : zoom === 'far' ? 0.8 : 1
  const camScale = depthScale * zoomScale

  const arrowBtn =
    'nodrag absolute z-10 flex size-6 items-center justify-center rounded-md text-muted-foreground ' +
    'hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent'

  return (
    <div className="relative aspect-square w-full select-none overflow-hidden rounded-md border bg-muted/30">
      <svg
        viewBox="0 0 200 200"
        className={`h-full w-full touch-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* 线框球：外轮廓 + 三条纬线 + 两条装饰经线 */}
        <circle cx={C} cy={C} r={R} className="fill-none stroke-muted-foreground/35" />
        {[-45, 0, 45].map((phi) => {
          const el = latitudeEllipse(phi)
          return (
            <ellipse
              key={phi}
              cx={C}
              cy={el.cy}
              rx={el.rx}
              ry={el.ry}
              className="fill-none stroke-muted-foreground/25"
            />
          )
        })}
        {[0.35, 0.7].map((k) => (
          <ellipse
            key={k}
            cx={C}
            cy={C}
            rx={R * k}
            ry={R}
            className="fill-none stroke-muted-foreground/25"
          />
        ))}
        {/* 球心 → 相机的视线（后半球时更淡） */}
        <line
          x1={C}
          y1={C}
          x2={cam.x}
          y2={cam.y}
          strokeDasharray="3 3"
          className={`stroke-primary ${behind ? 'opacity-25' : 'opacity-50'}`}
        />
        {/* 相机指示物：圆底 + 简化相机形（朝向不旋转，保持可读） */}
        <g
          transform={`translate(${cam.x} ${cam.y}) scale(${camScale})`}
          className={behind ? 'opacity-45' : undefined}
        >
          <circle r={9} className="fill-primary" />
          <rect x={-4.5} y={-3} width={9} height={6} rx={1.2} className="fill-primary-foreground" />
          <circle r={1.6} className="fill-primary" />
        </g>
      </svg>

      {/* 中心源图缩略图（不挡拖拽）：未连图时给类型图标占位 */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 size-11 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-md border bg-background shadow-sm">
        {imageUrl ? (
          <img src={imageUrl} alt="源图" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/60">
            <ImageIcon className="size-4" />
          </div>
        )}
      </div>

      {/* 四向箭头：±15° 步进，到界禁用 */}
      <button
        type="button"
        title={`向左旋转 ${ANGLE_STEP}°`}
        disabled={rotation <= ANGLE_ROTATION_MIN}
        onClick={() => nudge(-ANGLE_STEP, 0)}
        className={`${arrowBtn} left-1 top-1/2 -translate-y-1/2`}
      >
        <ChevronLeft className="size-4" />
      </button>
      <button
        type="button"
        title={`向右旋转 ${ANGLE_STEP}°`}
        disabled={rotation >= ANGLE_ROTATION_MAX}
        onClick={() => nudge(ANGLE_STEP, 0)}
        className={`${arrowBtn} right-1 top-1/2 -translate-y-1/2`}
      >
        <ChevronRight className="size-4" />
      </button>
      <button
        type="button"
        title={`相机升高 ${ANGLE_STEP}°`}
        disabled={tilt >= ANGLE_TILT_MAX}
        onClick={() => nudge(0, ANGLE_STEP)}
        className={`${arrowBtn} left-1/2 top-1 -translate-x-1/2`}
      >
        <ChevronUp className="size-4" />
      </button>
      <button
        type="button"
        title={`相机降低 ${ANGLE_STEP}°`}
        disabled={tilt <= ANGLE_TILT_MIN}
        onClick={() => nudge(0, -ANGLE_STEP)}
        className={`${arrowBtn} bottom-1 left-1/2 -translate-x-1/2`}
      >
        <ChevronDown className="size-4" />
      </button>

      {/* 当前读数 */}
      <span className="pointer-events-none absolute bottom-1.5 left-2 text-[10px] text-muted-foreground">
        {rotation}° · {tilt}° · {zoomLabel(zoom)}
      </span>
    </div>
  )
}
