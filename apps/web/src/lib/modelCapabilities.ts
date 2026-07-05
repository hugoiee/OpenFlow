// 按模型名推断其多模态/推理能力（思考 / 图像理解 / 音频理解 / 视频理解）。
// 模型现在是动态获取 / 手填的纯名称（/models 不返回能力信息），故用启发式正则匹配常见家族。
// 这份规则是**近似**的、易维护：新增家族在下面加一条规则即可；未知模型全部返回 false（下拉不亮图标）。

export type ModelCapability = 'thinking' | 'image' | 'audio' | 'video'

export type ModelCapabilities = Record<ModelCapability, boolean>

/** 展示顺序 + 中文名（图标在组件里绑定，这里只放纯数据）。 */
export const MODEL_CAPABILITY_LABELS: Record<ModelCapability, string> = {
  thinking: '思考模式',
  image: '图像理解',
  audio: '音频理解',
  video: '视频理解',
}

export const MODEL_CAPABILITY_ORDER: ModelCapability[] = ['thinking', 'image', 'audio', 'video']

/**
 * 名称 → 能力的启发式规则（按小写模型名匹配）。命中即把对应能力置真（可叠加）。
 * 规则从宽，宁可多标常见家族；真正未知的自定义模型不命中任何规则、全 false。
 */
const RULES: { re: RegExp; caps: ModelCapability[] }[] = [
  // —— 推理 / 思考 ——（OpenAI o 系列、DeepSeek R1/Reasoner、QwQ、Gemini 2.x thinking、GLM-Z1 等）
  {
    re: /\bo[1-4]\b|(?:^|[^a-z])o[1-4]-|reasoner|reasoning|deepseek-r1|\br1\b|qwq|thinking|gemini-2\.5|glm-z1|-think/,
    caps: ['thinking'],
  },
  // —— 图像理解（视觉）——
  {
    re: /gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-4v|chatgpt-4o|o1\b|o3|o4|gemini|claude-3|claude-.*-4|claude-(?:sonnet|opus|haiku)-4|vl\b|-vl-|-vl$|vision|llava|glm-4v|glm-4\.1v|internvl|minicpm-v|yi-vision|step-1v|pixtral|llama-3\.2.*vision|grok-.*vision|doubao.*vision|doubao-1\.5-vision|-omni/,
    caps: ['image'],
  },
  // —— 音频理解 ——（gpt-4o-audio、Qwen-Audio/Omni、Gemini、GLM-4-Voice、Step-Audio 等）
  {
    re: /audio|-omni|omni-|gemini-1\.5|gemini-2|glm-4-voice|step-audio|qwen.*audio/,
    caps: ['audio'],
  },
  // —— 视频理解 ——（Gemini 1.5/2.x、Qwen2.5-VL/Omni、Qwen-VL-Max、Doubao-Vision 等）
  {
    re: /gemini-1\.5|gemini-2|qwen2?\.?5?-?vl|qwen.*omni|-omni|qwen-vl-max|video|glm-4v-plus|minicpm-v-2[._]6|doubao.*vision/,
    caps: ['video'],
  },
]

/** 推断某模型名支持的能力集合。空名 / 未命中任何规则 → 全 false。 */
export function modelCapabilities(model: string): ModelCapabilities {
  const caps: ModelCapabilities = { thinking: false, image: false, audio: false, video: false }
  const name = (model ?? '').trim().toLowerCase()
  if (!name) return caps
  for (const { re, caps: cs } of RULES) {
    if (re.test(name)) for (const c of cs) caps[c] = true
  }
  return caps
}

/** 是否至少命中一种能力（下拉据此决定要不要渲染图标列）。 */
export function hasAnyCapability(model: string): boolean {
  const c = modelCapabilities(model)
  return c.thinking || c.image || c.audio || c.video
}
