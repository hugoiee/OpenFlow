import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

// 数据目录：桌面端(Electron)注入 OPENFLOW_DATA_DIR=app.getPath('userData')；
// 否则回退源码相对目录 apps/server/data（pnpm dev:all 场景）。
// 回退分支延迟到函数里求值：esbuild 打成 CJS 时 import.meta.url 为空，
// 桌面端始终注入 OPENFLOW_DATA_DIR，故此分支不会执行到，避免 fileURLToPath 崩。
function sourceRelativeDataDir(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  return join(here, '..', 'data')
}
const dataDir = process.env.OPENFLOW_DATA_DIR?.trim() || sourceRelativeDataDir()
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
    default_req_from TEXT NOT NULL DEFAULT '',
    aigc_endpoint TEXT NOT NULL DEFAULT '',
    upload_endpoint TEXT NOT NULL DEFAULT '',
    upload_media_endpoint TEXT NOT NULL DEFAULT ''
  );

  -- 异步生成任务：点「生成」后后端建行并后台跑 AIGC，前端凭 taskId 轮询/刷新重连。
  -- params 存请求体 JSON（不含 req_from/端点，运行时从 settings 解析）；result 存结果 URL 列表 JSON。
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    kind TEXT NOT NULL,                     -- 'image' | 'video'
    status TEXT NOT NULL DEFAULT 'pending', -- pending | running | succeeded | failed
    params TEXT NOT NULL DEFAULT '{}',
    result TEXT NOT NULL DEFAULT '[]',
    error TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_node ON tasks (project_id, node_id, created_at DESC);

  -- 全局「常用 Prompt」预设：Prompt 节点可下拉选用 / 一键存为预设（跨项目共享）。
  CREATE TABLE IF NOT EXISTS prompt_presets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`)

// 旧库迁移：settings 表按需补列（早期版本可能缺；旧的供应商列若存在则留存不读）
const settingsCols = db.prepare('PRAGMA table_info(settings)').all() as { name: string }[]
const settingsColNames = new Set(settingsCols.map((col) => col.name))
for (const col of [
  'default_req_from',
  'aigc_endpoint',
  'upload_endpoint',
  'upload_media_endpoint',
]) {
  if (!settingsColNames.has(col)) {
    db.exec(`ALTER TABLE settings ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`)
  }
}
