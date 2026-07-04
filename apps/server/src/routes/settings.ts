import { Hono } from 'hono'
import type { SaveSettingsBody, SettingsDTO } from '@openflow/shared'
import { readSettings, writeSettings } from '../settings-store'

export const settings = new Hono()

// 读取全局署名 + AIGC/上传端点 + Agent 配置。
// agentApiKey 是密钥，不回明文（写入-only）：置空并以 hasAgentApiKey 告知已配置。
settings.get('/', (c) => {
  const s = readSettings()
  return c.json({
    ...s,
    agentApiKey: '',
    hasAgentApiKey: Boolean(s.agentApiKey),
  } satisfies SettingsDTO)
})

// 写入全局设置：defaultReqFrom 必填；端点字段省略则保持原值，空串则回退默认。
settings.put('/', async (c) => {
  const body = await c.req.json<SaveSettingsBody>().catch(() => null)
  if (typeof body?.defaultReqFrom !== 'string') {
    return c.json({ error: '缺少 defaultReqFrom' }, 400)
  }
  const patch: Partial<SettingsDTO> = { defaultReqFrom: body.defaultReqFrom.trim() }
  if (typeof body.aigcEndpoint === 'string') patch.aigcEndpoint = body.aigcEndpoint.trim()
  if (typeof body.uploadEndpoint === 'string') patch.uploadEndpoint = body.uploadEndpoint.trim()
  if (typeof body.uploadMediaEndpoint === 'string')
    patch.uploadMediaEndpoint = body.uploadMediaEndpoint.trim()
  if (typeof body.agentEndpoint === 'string') patch.agentEndpoint = body.agentEndpoint.trim()
  if (typeof body.agentApiKey === 'string') patch.agentApiKey = body.agentApiKey.trim()
  if (typeof body.agentModel === 'string') patch.agentModel = body.agentModel.trim()
  writeSettings(patch)
  return c.json({ ok: true })
})
