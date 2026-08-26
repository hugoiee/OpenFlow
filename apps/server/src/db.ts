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

/** 后端生成文件（如播客音频）的落盘目录：<数据目录>/files，经 GET /api/files/:name 对外服务。 */
export const generatedFilesDir = join(dataDir, 'files')
mkdirSync(generatedFilesDir, { recursive: true })

export const db = new Database(join(dataDir, 'openflow.db'))
db.pragma('journal_mode = WAL')

db.exec(`
  -- type: 'canvas'(节点式画布，数据在 nodes/edges) | 'evaluation'(评估项目，表格在 data)
  -- data: 评估项目的表格 JSON（画布项目恒为 '{}'）；与 nodes/edges 同为不透明 JSON，后端不理解其内容
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'canvas',
    nodes TEXT NOT NULL DEFAULT '[]',
    edges TEXT NOT NULL DEFAULT '[]',
    data TEXT NOT NULL DEFAULT '{}',
    pinned INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    default_req_from TEXT NOT NULL DEFAULT '',
    aigc_endpoint TEXT NOT NULL DEFAULT '',
    upload_endpoint TEXT NOT NULL DEFAULT '',
    upload_media_endpoint TEXT NOT NULL DEFAULT '',
    aigc_history_endpoint TEXT NOT NULL DEFAULT '',
    agent_endpoint TEXT NOT NULL DEFAULT '',
    agent_api_style TEXT NOT NULL DEFAULT '',
    agent_api_key TEXT NOT NULL DEFAULT '',
    agent_model TEXT NOT NULL DEFAULT '',
    agent_model_list TEXT NOT NULL DEFAULT '[]',
    volc_tts_api_key TEXT NOT NULL DEFAULT ''
  );

  -- 异步生成任务：点「生成」后后端建行并后台跑 AIGC，前端凭 taskId 轮询/刷新重连。
  -- params 存请求体 JSON（不含 req_from/端点，运行时从 settings 解析）；result 存结果 URL 列表 JSON。
  -- upstream_id / raw_response 用于「同步响应没带回 URL」时去 AIGC 历史接口找回结果（见 aigc-history.ts）。
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    kind TEXT NOT NULL,                     -- 'image' | 'video'
    status TEXT NOT NULL DEFAULT 'pending', -- pending | running | succeeded | failed
    params TEXT NOT NULL DEFAULT '{}',
    result TEXT NOT NULL DEFAULT '[]',
    error TEXT NOT NULL DEFAULT '',
    upstream_id TEXT NOT NULL DEFAULT '',   -- 上游 request_id / 历史记录 id（认领结果的钥匙兼防抢占锁）
    raw_response TEXT NOT NULL DEFAULT '',  -- 上游最近一次原始响应（截断），失败现场
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_node ON tasks (project_id, node_id, created_at DESC);

  -- 全局 Prompt 预设：Prompt 节点可下拉选用 / 一键存为预设（跨项目共享）。
  -- category 分「常用 Prompt(common)」/「System Prompt(system)」两组。
  CREATE TABLE IF NOT EXISTS prompt_presets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'common',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`)

// 旧库迁移：projects 早期无 pinned / type / data 列，补上
// （已有项目默认不置顶；评估项目是后加的形态，故旧项目一律是画布项目、表格数据为空对象）
const projectCols = db.prepare('PRAGMA table_info(projects)').all() as { name: string }[]
const projectColNames = new Set(projectCols.map((col) => col.name))
if (!projectColNames.has('pinned')) {
  db.exec(`ALTER TABLE projects ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`)
}
if (!projectColNames.has('type')) {
  db.exec(`ALTER TABLE projects ADD COLUMN type TEXT NOT NULL DEFAULT 'canvas'`)
}
if (!projectColNames.has('data')) {
  db.exec(`ALTER TABLE projects ADD COLUMN data TEXT NOT NULL DEFAULT '{}'`)
}

// 旧库迁移：settings 表按需补列（早期版本可能缺；旧的供应商列若存在则留存不读）
const settingsCols = db.prepare('PRAGMA table_info(settings)').all() as { name: string }[]
const settingsColNames = new Set(settingsCols.map((col) => col.name))
for (const col of [
  'default_req_from',
  'aigc_endpoint',
  'upload_endpoint',
  'upload_media_endpoint',
  'aigc_history_endpoint',
  'agent_endpoint',
  // 接口协议（'responses' | 'chat'）：空串=未选择，由 llm.ts 归一到默认值
  'agent_api_style',
  'agent_api_key',
  'agent_model',
  'volc_tts_api_key',
]) {
  if (!settingsColNames.has(col)) {
    db.exec(`ALTER TABLE settings ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`)
  }
}
// 手动模型候选列表列（JSON 数组字符串，默认 '[]'，单独补——默认值与上面的 '' 不同）
if (!settingsColNames.has('agent_model_list')) {
  db.exec(`ALTER TABLE settings ADD COLUMN agent_model_list TEXT NOT NULL DEFAULT '[]'`)
}

// 旧库迁移：tasks 早期无 upstream_id / raw_response 列，补上（历史任务无从追溯，默认空串）
const taskCols = db.prepare('PRAGMA table_info(tasks)').all() as { name: string }[]
const taskColNames = new Set(taskCols.map((col) => col.name))
for (const col of ['upstream_id', 'raw_response']) {
  if (!taskColNames.has(col)) {
    db.exec(`ALTER TABLE tasks ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`)
  }
}

// 旧库迁移：prompt_presets 早期无 category 列，补上（已有预设默认归入常用 Prompt）
const presetCols = db.prepare('PRAGMA table_info(prompt_presets)').all() as { name: string }[]
if (!presetCols.some((col) => col.name === 'category')) {
  db.exec(`ALTER TABLE prompt_presets ADD COLUMN category TEXT NOT NULL DEFAULT 'common'`)
}
