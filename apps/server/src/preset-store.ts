import { db } from './db'
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
