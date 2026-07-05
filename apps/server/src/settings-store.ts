import { db } from './db'
import type { SettingsDTO } from '@openflow/shared'

type SettingsRow = {
  id: string
  default_req_from: string
  aigc_endpoint: string
  upload_endpoint: string
  upload_media_endpoint: string
  agent_endpoint: string
  agent_api_key: string
  agent_model: string
  agent_model_list: string
}

const SINGLETON = 'singleton'

/** 把存的 JSON 字符串解析成模型名数组（去空/去重）；损坏或非数组时回退空数组。 */
function parseModelList(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    const out: string[] = []
    for (const item of v) {
      if (typeof item === 'string' && item.trim() && !out.includes(item.trim())) out.push(item.trim())
    }
    return out
  } catch {
    return []
  }
}

function ensureRow(): SettingsRow {
  let row = db
    .prepare(
      'SELECT id, default_req_from, aigc_endpoint, upload_endpoint, upload_media_endpoint, agent_endpoint, agent_api_key, agent_model, agent_model_list FROM settings WHERE id = ?',
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
      agent_endpoint: '',
      agent_api_key: '',
      agent_model: '',
      agent_model_list: '[]',
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
    agentEndpoint: row.agent_endpoint ?? '',
    agentApiKey: row.agent_api_key ?? '',
    agentModel: row.agent_model ?? '',
    agentModelList: parseModelList(row.agent_model_list),
  }
}

/** 合并写入：只覆盖 patch 里出现的字段，其余保持原值。 */
export function writeSettings(patch: Partial<SettingsDTO>): void {
  const cur = readSettings()
  const next = { ...cur, ...patch }
  db.prepare(
    'UPDATE settings SET default_req_from = ?, aigc_endpoint = ?, upload_endpoint = ?, upload_media_endpoint = ?, agent_endpoint = ?, agent_api_key = ?, agent_model = ?, agent_model_list = ? WHERE id = ?',
  ).run(
    next.defaultReqFrom,
    next.aigcEndpoint,
    next.uploadEndpoint,
    next.uploadMediaEndpoint,
    next.agentEndpoint,
    next.agentApiKey,
    next.agentModel,
    JSON.stringify(next.agentModelList ?? []),
    SINGLETON,
  )
}
