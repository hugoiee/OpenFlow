import { Hono } from 'hono'
import type {
  ProviderConfigPublic,
  ProviderId,
  SaveSettingsBody,
  SettingsDTO,
} from '@openflow/shared'
import { readSettings, writeSettings } from '../settings-store'

export const settings = new Hono()

// 读取：不回传 key，只回 hasKey；附全局 req_from 署名
settings.get('/', (c) => {
  const { activeProviderId, configs, defaultReqFrom } = readSettings()
  const publicConfigs: SettingsDTO['configs'] = {}
  for (const [id, cfg] of Object.entries(configs)) {
    if (!cfg) continue
    publicConfigs[id as ProviderId] = {
      baseURL: cfg.baseURL,
      selectedModel: cfg.selectedModel,
      models: cfg.models,
      hasKey: Boolean(cfg.apiKey),
    } satisfies ProviderConfigPublic
  }
  return c.json({
    activeProviderId,
    configs: publicConfigs,
    defaultReqFrom,
  } satisfies SettingsDTO)
})

// 写入某供应商配置并设为激活；apiKey 省略/为空时保留原有 key；defaultReqFrom 提供时一并更新
settings.put('/', async (c) => {
  const body = await c.req.json<SaveSettingsBody>().catch(() => null)
  if (!body?.providerId) return c.json({ error: '缺少 providerId' }, 400)

  const current = readSettings()
  const configs = current.configs
  const prev = configs[body.providerId]
  configs[body.providerId] = {
    apiKey: body.apiKey?.trim() ? body.apiKey.trim() : (prev?.apiKey ?? ''),
    baseURL: body.baseURL.trim(),
    selectedModel: body.selectedModel,
    models: body.models,
  }
  // defaultReqFrom 未提供时保留原值（全局署名，独立于供应商）
  const defaultReqFrom =
    typeof body.defaultReqFrom === 'string' ? body.defaultReqFrom.trim() : current.defaultReqFrom
  writeSettings(body.providerId, configs, defaultReqFrom)
  return c.json({ ok: true })
})
