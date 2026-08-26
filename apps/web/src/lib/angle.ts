// 多角度节点的领域纯函数：三参数（旋转/倾斜/缩放）的取值范围、归一化与「角度 → 相机指令」合成。
// 轨道控件与滑杆（AngleParams/CameraOrbit）、请求构造（buildAngleRequest）、createNode 默认值
// 三处共用这一套归一，杜绝「面板显示一个值、实发另一个值」。刻意不依赖 React/store。

/** 缩放（相机距离）三档：近景 / 中景 / 远景。 */
export type AngleZoom = 'close' | 'medium' | 'far'

/** 旋转（方位角，°）：负=向左、正=向右，±180 同为背面视角（clamp 夹住不回绕）。 */
export const ANGLE_ROTATION_MIN = -180
export const ANGLE_ROTATION_MAX = 180
export const ANGLE_ROTATION_DEFAULT = 0

/** 倾斜（俯仰角，°）：正=相机升高俯视、负=相机降低仰视。 */
export const ANGLE_TILT_MIN = -90
export const ANGLE_TILT_MAX = 90
export const ANGLE_TILT_DEFAULT = 0

export const ANGLE_ZOOM_DEFAULT: AngleZoom = 'medium'

/** 缩放三档（滑杆三停 + 指令措辞的数据源，序即滑杆方向：近 → 远）。 */
export const ANGLE_ZOOM_OPTIONS = [
  { value: 'close', label: '近景' },
  { value: 'medium', label: '中景' },
  { value: 'far', label: '远景' },
] as const

/** 轨道控件四向箭头的单次步进角度（°）。 */
export const ANGLE_STEP = 15

function clampAngle(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  return Math.min(max, Math.max(min, Math.round(v)))
}

/** 旋转归一：非数/NaN 回退默认 0，取整并夹进 [-180, 180]。 */
export function clampRotation(v: unknown): number {
  return clampAngle(v, ANGLE_ROTATION_MIN, ANGLE_ROTATION_MAX, ANGLE_ROTATION_DEFAULT)
}

/** 倾斜归一：非数/NaN 回退默认 0，取整并夹进 [-90, 90]。 */
export function clampTilt(v: unknown): number {
  return clampAngle(v, ANGLE_TILT_MIN, ANGLE_TILT_MAX, ANGLE_TILT_DEFAULT)
}

/** 缩放归一：脏值/旧数据回退默认中景。 */
export function normalizeZoom(v: unknown): AngleZoom {
  return ANGLE_ZOOM_OPTIONS.some((o) => o.value === v) ? (v as AngleZoom) : ANGLE_ZOOM_DEFAULT
}

/** 缩放档位的中文名（控件读数与滑杆值显示共用）。 */
export function zoomLabel(zoom: AngleZoom): string {
  return ANGLE_ZOOM_OPTIONS.find((o) => o.value === zoom)?.label ?? '中景'
}

/** 恒定收尾：保主体稳态 + 新视角补全约束（措辞不预设主体是人物，产品/场景图同样适用）。 */
const INSTRUCTION_TAIL =
  '保持主体不变：身份、外观细节、材质与光照方向都与原图一致，画风与色调不变；' +
  '按新视角合理补全原图中被遮挡或看不到的部分，不要添加原图中不存在的物体或文字。'

/**
 * 三参数 → 中文相机指令（发给图像编辑模型的 prompt 主体）。
 * 结构 = 变换头 + 动作子句（分号连接，默认值维度整句省略）+ 恒定收尾；
 * 三值全默认时输出「保持视角重新生成」兜底——指令恒非空，后端 prompt.trim() 校验天然通过。
 */
export function composeAngleInstruction(rotation: number, tilt: number, zoom: AngleZoom): string {
  const r = clampRotation(rotation)
  const t = clampTilt(tilt)
  const z = normalizeZoom(zoom)
  const clauses: string[] = []
  if (r !== 0) {
    clauses.push(
      // ±180 等价且「向左/右转 180」有歧义，特化成背面视角
      Math.abs(r) === 180
        ? '将相机水平旋转180°，转到主体正后方（背面视角）'
        : `将相机围绕主体向${r > 0 ? '右' : '左'}水平旋转${Math.abs(r)}°`,
    )
  }
  if (t === ANGLE_TILT_MAX) clauses.push('将相机移到主体正上方，垂直俯拍（顶视角）')
  else if (t === ANGLE_TILT_MIN) clauses.push('将相机移到主体正下方，垂直仰拍（底视角）')
  else if (t > 0) clauses.push(`将相机升高，以俯视${t}°的高角度拍摄`)
  else if (t < 0) clauses.push(`将相机降低，以仰视${-t}°的低角度拍摄`)
  if (z === 'close') clauses.push('将相机推近主体，改为近景景别（主体更大，占据画面主要部分）')
  else if (z === 'far') clauses.push('将相机拉远，改为远景景别（主体变小，纳入更多周围环境）')

  if (clauses.length === 0) return `保持与原图相同的相机视角与景别，重新生成这张图。${INSTRUCTION_TAIL}`
  return `基于输入图做相机视角变换：${clauses.join('；')}。${INSTRUCTION_TAIL}`
}
