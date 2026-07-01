import { db } from './db'
import type { SettingsDTO } from '@openflow/shared'

type SettingsRow = {
  id: string
  default_req_from: string
  aigc_endpoint: string
  upload_endpoint: string
  upload_media_endpoint: string
}

const SINGLETON = 'singleton'

function ensureRow(): SettingsRow {
  let row = db
    .prepare(
      'SELECT id, default_req_from, aigc_endpoint, upload_endpoint, upload_media_endpoint FROM settings WHERE id = ?',
    )
    .get(SINGLETON) as SettingsRow | undefined
  if (!row) {
    db.prepare('INSERT INTO settings (id) VALUES (?)').run(SINGLETON)
    row = {
      id: SINGLETON,
      default_req_from: '',
      aigc_endpoint: '',
      upload_endpoint: '',
      upload_media_endpoint: '',
    }
  }
  return row
}

export function readSettings(): SettingsDTO {
  const row = ensureRow()
  return {
    defaultReqFrom: row.default_req_from ?? '',
    aigcEndpoint: row.aigc_endpoint ?? '',
    uploadEndpoint: row.upload_endpoint ?? '',
    uploadMediaEndpoint: row.upload_media_endpoint ?? '',
  }
}

/** 合并写入：只覆盖 patch 里出现的字段，其余保持原值。 */
export function writeSettings(patch: Partial<SettingsDTO>): void {
  const cur = readSettings()
  const next = { ...cur, ...patch }
  db.prepare(
    'UPDATE settings SET default_req_from = ?, aigc_endpoint = ?, upload_endpoint = ?, upload_media_endpoint = ? WHERE id = ?',
  ).run(
    next.defaultReqFrom,
    next.aigcEndpoint,
    next.uploadEndpoint,
    next.uploadMediaEndpoint,
    SINGLETON,
  )
}
