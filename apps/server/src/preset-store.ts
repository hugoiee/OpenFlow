import { db } from './db'
import { DEFAULT_PROMPT_PRESETS, type DefaultPreset } from './default-presets'
import type { PromptPresetDTO, SavePromptPresetBody } from '@openflow/shared'

type PresetRow = {
  id: string
  title: string
  content: string
  created_at: number
  updated_at: number
}

function rowToDTO(row: PresetRow): PromptPresetDTO {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function newId(): string {
  return `pp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** 列出所有预设（最近更新在前）。 */
export function listPresets(): PromptPresetDTO[] {
  const rows = db
    .prepare('SELECT * FROM prompt_presets ORDER BY updated_at DESC')
    .all() as PresetRow[]
  return rows.map(rowToDTO)
}

function getPreset(id: string): PromptPresetDTO | undefined {
  const row = db.prepare('SELECT * FROM prompt_presets WHERE id = ?').get(id) as
    | PresetRow
    | undefined
  return row ? rowToDTO(row) : undefined
}

/** 新建一条预设。 */
export function createPreset(body: SavePromptPresetBody): PromptPresetDTO {
  const now = Date.now()
  const preset: PromptPresetDTO = {
    id: newId(),
    title: body.title,
    content: body.content,
    createdAt: now,
    updatedAt: now,
  }
  db.prepare(
    'INSERT INTO prompt_presets (id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).run(preset.id, preset.title, preset.content, now, now)
  return preset
}

/** 更新一条预设（不存在返回 undefined）。 */
export function updatePreset(
  id: string,
  body: SavePromptPresetBody,
): PromptPresetDTO | undefined {
  const existing = getPreset(id)
  if (!existing) return undefined
  const now = Date.now()
  db.prepare(
    'UPDATE prompt_presets SET title = ?, content = ?, updated_at = ? WHERE id = ?',
  ).run(body.title, body.content, now, id)
  return { ...existing, title: body.title, content: body.content, updatedAt: now }
}

/** 删除一条预设（不存在也视为成功）。 */
export function deletePreset(id: string): void {
  db.prepare('DELETE FROM prompt_presets WHERE id = ?').run(id)
}

/**
 * 首次启动播种分发预设：仅当 prompt_presets 表为空时，把 DEFAULT_PROMPT_PRESETS 一次性灌入。
 * 桌面端每个用户是全新 userData 库 → 首次打开即自带预设；一旦表里有数据（包括用户自建或
 * 已播种过）就不再触碰，故用户的增删改不会被覆盖、也不会重复播种。
 */
export function seedDefaultPresets(): void {
  if (DEFAULT_PROMPT_PRESETS.length === 0) return
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM prompt_presets').get() as { n: number }
  if (n > 0) return
  const now = Date.now()
  const insert = db.prepare(
    'INSERT INTO prompt_presets (id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  )
  const seed = db.transaction((items: DefaultPreset[]) => {
    items.forEach((p, i) => {
      // 递减时间戳：数组首个拿最大 updated_at，配合 listPresets 的 DESC 排序 → 数组顺序即列表顺序
      const ts = now + (items.length - 1 - i)
      insert.run(newId(), p.title, p.content, ts, ts)
    })
  })
  seed(DEFAULT_PROMPT_PRESETS)
}

// 模块加载即尝试播种（app.ts 启动时经 import './preset-store' 触发，db 表已在 './db' 建好）
seedDefaultPresets()
