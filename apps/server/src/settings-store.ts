import type { ProviderConfig, ProviderId } from '@openflow/shared'
import { db } from './db'

type StoredConfigs = Partial<Record<ProviderId, ProviderConfig>>
type SettingsRow = {
  id: string
  active_provider_id: ProviderId
  configs: string
  default_req_from: string
}

const SINGLETON = 'singleton'

function ensureRow(): SettingsRow {
  let row = db.prepare('SELECT * FROM settings WHERE id = ?').get(SINGLETON) as
    | SettingsRow
    | undefined
  if (!row) {
    db.prepare(
      'INSERT INTO settings (id, active_provider_id, configs, default_req_from) VALUES (?, ?, ?, ?)',
    ).run(SINGLETON, 'openai', '{}', '')
    row = { id: SINGLETON, active_provider_id: 'openai', configs: '{}', default_req_from: '' }
  }
  return row
}

export function readSettings(): {
  activeProviderId: ProviderId
  configs: StoredConfigs
  defaultReqFrom: string
} {
  const row = ensureRow()
  return {
    activeProviderId: row.active_provider_id,
    configs: JSON.parse(row.configs) as StoredConfigs,
    defaultReqFrom: row.default_req_from ?? '',
  }
}

export function writeSettings(
  activeProviderId: ProviderId,
  configs: StoredConfigs,
  defaultReqFrom: string,
): void {
  ensureRow()
  db.prepare(
    'UPDATE settings SET active_provider_id = ?, configs = ?, default_req_from = ? WHERE id = ?',
  ).run(activeProviderId, JSON.stringify(configs), defaultReqFrom, SINGLETON)
}

/** 激活供应商的完整配置（含 key），未配置则 undefined。 */
export function getActiveConfig(): ProviderConfig | undefined {
  const { activeProviderId, configs } = readSettings()
  return configs[activeProviderId]
}
