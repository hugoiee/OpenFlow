/**
 * 打包分发用的「常用 Prompt」预设默认内容。
 *
 * 首次启动、且 prompt_presets 表为空时，由 seedDefaultPresets()（见 preset-store.ts）
 * 一次性灌入。桌面端每个用户都是全新的 userData 数据库 → 首次打开即自带这些预设；
 * 之后用户自己新增 / 修改 / 删除都不会被覆盖（表非空就不再播种）。
 *
 * ⚠️ 想改分发预设，改这个数组即可（标题 + 内容）。数组顺序 = 列表里的先后顺序（首个排最前）。
 */
export type DefaultPreset = { title: string; content: string }

export const DEFAULT_PROMPT_PRESETS: DefaultPreset[] = [
  {
    title: '人物三视图+特写',
    content:
      '超写实摄影，纯白色背景\n生成人物的三视图全身照。正面侧面背面在画面左侧2/3区域，右侧1/3部分是人物的正面大头照、左侧面大头照和右侧面大头照\n人物形象：{{写人物形象描述}}',
  },
  {
    title: '人像写真',
    content: '半身人像，85mm 定焦，背景浅景深虚化，柔和伦勃朗光，自然真实肤质，胶片质感',
  },
]
