import { db } from './db'

type SettingsRow = { id: string; default_req_from: string }

const SINGLETON = 'singleton'

function ensureRow(): SettingsRow {
  let row = db.prepare('SELECT id, default_req_from FROM settings WHERE id = ?').get(SINGLETON) as
    | SettingsRow
    | undefined
  if (!row) {
    db.prepare('INSERT INTO settings (id, default_req_from) VALUES (?, ?)').run(SINGLETON, '')
    row = { id: SINGLETON, default_req_from: '' }
  }
  return row
}

export function readSettings(): { defaultReqFrom: string } {
  const row = ensureRow()
  return { defaultReqFrom: row.default_req_from ?? '' }
}

export function writeSettings(defaultReqFrom: string): void {
  ensureRow()
  db.prepare('UPDATE settings SET default_req_from = ? WHERE id = ?').run(defaultReqFrom, SINGLETON)
}
