import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const here = dirname(fileURLToPath(import.meta.url))
// apps/server/data/openflow.db
const dataDir = join(here, '..', 'data')
mkdirSync(dataDir, { recursive: true })

export const db = new Database(join(dataDir, 'openflow.db'))
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    nodes TEXT NOT NULL DEFAULT '[]',
    edges TEXT NOT NULL DEFAULT '[]',
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    default_req_from TEXT NOT NULL DEFAULT ''
  );
`)

// 旧库迁移：settings 表补 default_req_from 列（早期版本无此列；旧的供应商列若存在则留存不读）
const settingsCols = db.prepare('PRAGMA table_info(settings)').all() as { name: string }[]
if (!settingsCols.some((col) => col.name === 'default_req_from')) {
  db.exec("ALTER TABLE settings ADD COLUMN default_req_from TEXT NOT NULL DEFAULT ''")
}
