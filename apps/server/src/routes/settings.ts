import { Hono } from 'hono'
import type {
  ProviderConfigPublic,
  ProviderId,
  SaveSettingsBody,
  SettingsDTO,
} from '@openflow/shared'
import { readSettings, writeSettings } from '../settings-store'

export const settings = new Hono()

// 读取：不回传 key，只回 hasKey
settings.get('/', (c) => {
  const { activeProviderId, configs } = readSettings()
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
  return c.json({ activeProviderId, configs: publicConfigs } satisfies SettingsDTO)
})

// 写入某供应商配置并设为激活；apiKey 省略/为空时保留原有 key
settings.put('/', async (c) => {
  const body = await c.req.json<SaveSettingsBody>().catch(() => null)
  if (!body?.providerId) return c.json({ error: '缺少 providerId' }, 400)

  const { configs } = readSettings()
  const prev = configs[body.providerId]
  configs[body.providerId] = {
    apiKey: body.apiKey?.trim() ? body.apiKey.trim() : (prev?.apiKey ?? ''),
    baseURL: body.baseURL.trim(),
    selectedModel: body.selectedModel,
    models: body.models,
  }
  writeSettings(body.providerId, configs)
  return c.json({ ok: true })
})
