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

// ---- 英文相机指令模板 ----
// 指令为英文：nano-banana（Gemini 系）的指令遵循以英文最强，three-quarter/profile/nadir 等
// 摄影术语在训练分布里有强先验；此前的中文模板实测两类漂移（左右镜像、90° 俯拍只到 ~80°）。
// 设计原则（改措辞前务必读）：
// ① 终态优先——编辑模型不模拟相机运动、只生成终态图，对度数只能量化到几个吸引子
//    （正面/三分/侧面/背面），故每档给一个强命名视角，精确度数降级为档内微调信号；
// ② 单一侧向词系防镜像——「帧缘锚」（原先最靠近画面 {dir} 缘的那一面转向相机）与
//    orbit {dir} 用同一个侧向词、出现两次互相强化；且视点无关（不预设主体正对相机，
//    人/车/建筑/风景通用），1°~179° 全区间几何为真；
// ③ 动词纪律——orbit/move/raise/lower/pull；禁用裸 rotate/pan（字面义是原地摇摄，主体会出画）；
// ④ 句号分句不用分号（分号把多条指令粘成一个权重单元）；每句一职责。

/** 恒定开头：same scene + new viewpoint 的对比框架（兼防「主体转、背景冻」的转台式失败）。 */
const INSTRUCTION_HEAD = 'Render the exact same scene from a new camera viewpoint.'

/** 防镜像负句：专拦「输出 2D 左右翻转冒充 3D 换位」的捷径失败（与帧缘锚分管两类错误）。 */
const NO_MIRROR = 'Do not mirror the image.'

/**
 * 恒定收尾：保主体身份/风格 + 「重建许可」+ 不加物。
 * - 光照措辞刻意是「与场景一致」而非「方向不变」：轨道旋转下相机相对光向必然变化，
 *   冻结类措辞紧贴大幅变换是欠转的隐性推手；
 * - 「重建许可」句必留：没有它模型会为避免无中生有而回拉源像素，同样导致转不到位；
 * - "unrequested"：给拼在后面的用户附加要求（如「加一顶帽子」）让路，不与之打架。
 */
const INSTRUCTION_TAIL =
  "Preserve the subject's exact identity, appearance details, style and colors, and keep the " +
  'lighting consistent with the scene. Plausibly reconstruct whatever was hidden or out of frame ' +
  'in the original image. Do not add unrequested objects or text.'

/**
 * 旋转子句：无缝分档（边界=相邻规范角 45/90/135/180 的中点取整），180 特化无方向词。
 * v3 重设计（实测 v2 失败模式=转台式 + 幅度不够）：胜句（wide shot/nadir/high-angle）全都有
 * 「终态画面内容陈述」而败句全无——旧帧缘锚是「过去时 + 运动」描述，要求模型记忆源图空间
 * 关系，编辑语料无此监督形态，大概率整句被当噪声丢弃。每档骨架改为：
 * 命名句 → 可见部件句 → 正面朝向状态锚（现在时）→ newly-revealed 重建许可句 → 防镜像负句；
 * orbit 主句不带方向词（方向完全由终态承载），全句单一侧向词。
 *
 * ⚠️ 侧向词映射：side = 可见侧 = 正面朝向的画面缘（r>0 相机右绕 → 看到主体左侧、正面转向
 * 画面左缘），与 v2 的 dir（相机运动向）**相反**——写反=全档系统性镜像。
 * 承重方向信号是帧相对的 front-toward-{side}-edge 状态句（对任意主体无歧义）；
 * possessive 的「its {side} side」对人像/车辆是 caption 完美措辞，对无左右手性物体最坏被忽略。
 */
function rotationClause(r: number): string {
  const n = Math.abs(r)
  const side = r > 0 ? 'left' : 'right'
  // newly-revealed 许可句一身三职：具体化 TAIL 的重建许可（点名要新画的部位）、侧向词第 3-4 次
  // 出现互证词系、正向防镜像（镜像翻转不产生任何 newly revealed 内容）
  const reveal = (parts: string) =>
    `Render the newly revealed ${parts} consistent with the subject's appearance in the original image.`
  if (n === 180) {
    // ±180 等价必须同串；「正面完全不可见」负空间锚防高频失败「又画一张正面」。
    // 不接 NO_MIRROR：镜像一张正面仍是正面，该守卫在此档无效
    return (
      'Orbit the camera 180° around the subject to directly behind it — a full back view. ' +
      'The subject is seen squarely from behind, its front completely hidden from view. ' +
      reveal('back')
    )
  }
  let body: string
  if (n >= 158) {
    body =
      `Orbit the camera ${n}° around the subject to almost directly behind it — a near-back view. ` +
      `The subject is seen mostly from behind, with only a narrow sliver of its ${side} side visible. ` +
      reveal(`back and ${side} side`)
  } else if (n >= 113) {
    body =
      `Orbit the camera ${n}° around the subject into a rear three-quarter view, seen mostly from behind. ` +
      `Mostly its back and its ${side} side are visible. ` +
      `Its front is turned away from the camera, angled toward the ${side} edge of the frame. ` +
      reveal(`back and ${side} side`)
  } else if (n >= 68) {
    body =
      `Orbit the camera ${n}° around the subject into a full profile view of its ${side} side. ` +
      `Its ${side} side directly faces the camera. ` +
      `Its front now points at the ${side} edge of the frame. ` +
      reveal(`${side} side`)
  } else if (n >= 23) {
    body =
      `Orbit the camera ${n}° around the subject into a three-quarter view, seen from its ${side} side. ` +
      `Both its front and its ${side} side are now clearly visible. ` +
      `Its front is angled toward the ${side} edge of the frame. ` +
      reveal(`${side} side`)
  } else {
    // subtle 档风险方向相反：不是欠转而是被 three-quarter 吸引子过转，补「小」的下压锚
    body =
      `Orbit the camera ${n}° around the subject — a subtle shift of viewpoint, still close to the original angle. ` +
      `The subject's front now angles slightly toward the ${side} edge of the frame, ` +
      `bringing a little more of its ${side} side into view.`
  }
  return `${body} ${NO_MIRROR}`
}

/** 倾斜子句：±90 硬约束特化 + 70°+ steep 档（防 85° 塌到 65° 的同族欠转）。 */
function tiltClause(t: number): string {
  const n = Math.abs(t)
  if (t === ANGLE_TILT_MAX) {
    // 90° 俯拍是唯一值得七重锚定的分支：nadir/straight down/perpendicular/ground-fills-frame/
    // no-horizon 全是「真垂直」强先验。刻意不用 bird's-eye——其语料先验大量是 60~80° 斜俯拍，
    // 正是把 90 往 80 拉的元凶；flat-lay/floor-plan/knolling 绑定主体类型或会改内容，均不用。
    return (
      'Move the camera directly overhead, looking straight down at the subject — a true 90° ' +
      'top-down nadir view, camera axis exactly perpendicular to the ground, so that the ground ' +
      'plane fills the frame and no horizon is visible.'
    )
  }
  if (t === ANGLE_TILT_MIN) {
    // -90 有物理可实现性天花板（「相机在地下」的照片语料不存在），追加两句对称于俯视 90 的
    // 胜句锚（underside 即内容 / sky-or-ceiling fills the frame），把模型拉向贴地仰拍体裁
    return (
      "Move the camera directly below the subject, looking straight up at it — a true 90° " +
      "worm's-eye view from directly underneath, camera axis exactly vertical, with no horizon visible. " +
      "The subject's underside faces the camera directly. " +
      'Nothing but the sky or the ceiling fills the frame behind it.'
    )
  }
  if (t >= 70) {
    return `Raise the camera very high, looking down at the subject from ${n}° above the horizontal — a steep high-angle view, almost directly overhead.`
  }
  if (t > 0) {
    return `Raise the camera, looking down at the subject from ${n}° above the horizontal — a high-angle shot.`
  }
  // 仰视 v3：v2 各档只有角度数字、没有任何终态画面陈述，实测「几乎没变化」。补环境锚三级
  // 梯度（more of → mostly → nothing but sky/ceiling，量词本身携带角度信息）+ towering/
  // foreshortening 先验词（仰拍在影视语料里的定义性描述）；worm's-eye 只留 -90 独占
  // （用在 -75 会复刻 bird's-eye 把 90 拉到 80 的老 bug）；underside 只出现在 steep 与 -90
  // （浅角度下底面几乎不露，对人像措辞也别扭）。
  if (t <= -70) {
    return (
      `Lower the camera to ground level, almost directly beneath the subject, looking steeply up at it from ${n}° below the horizontal — an extreme low-angle view. ` +
      'The subject looms high above the camera, with dramatic foreshortening from below. ' +
      'Much of its underside comes into view. ' +
      'Behind it, mostly the sky or the ceiling is visible.'
    )
  }
  return (
    `Lower the camera well below the subject, looking up at it from ${n}° below the horizontal — a low-angle shot. ` +
    'From this low angle the subject appears taller and more imposing, towering over the viewer. ' +
    'More of the sky or the ceiling above comes into view behind it.'
  )
}

/**
 * 三参数 → 英文相机指令（发给图像编辑模型的 prompt 主体）。
 * 结构 = HEAD + [旋转句] + [倾斜句] + [缩放句] + TAIL（完整句子空格连接，默认值维度整句省略）；
 * 三值全默认时输出「同视角重渲染」兜底——指令恒非空，后端 prompt.trim() 校验天然通过。
 */
export function composeAngleInstruction(rotation: number, tilt: number, zoom: AngleZoom): string {
  const r = clampRotation(rotation)
  const t = clampTilt(tilt)
  const z = normalizeZoom(zoom)
  const clauses: string[] = []
  if (r !== 0) clauses.push(rotationClause(r))
  if (t !== 0) clauses.push(tiltClause(t))
  if (z === 'close') {
    clauses.push('Move the camera much closer for a close-up, so that the subject fills most of the frame.')
  } else if (z === 'far') {
    clauses.push(
      'Pull the camera much farther back for a wide shot, so that the subject appears smaller and much more of the surrounding environment comes into view.',
    )
  }

  if (clauses.length === 0) {
    // 兜底只锁相机与构图、动词用 re-render 保住生成性——绝不出现 "identical image" 类措辞，
    // 免得压制拼在后面的用户附加要求（如「改成夜晚」）。
    return `Re-render this image from the same camera position and angle, keeping the original framing and composition. ${INSTRUCTION_TAIL}`
  }
  return `${INSTRUCTION_HEAD} ${clauses.join(' ')} ${INSTRUCTION_TAIL}`
}
