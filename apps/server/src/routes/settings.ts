import { Hono } from 'hono'
import type { SaveSettingsBody, SettingsDTO } from '@openflow/shared'
import { readSettings, writeSettings } from '../settings-store'

export const settings = new Hono()

// 读取全局 req_from 署名
settings.get('/', (c) => {
  const { defaultReqFrom } = readSettings()
  return c.json({ defaultReqFrom } satisfies SettingsDTO)
})

// 写入全局 req_from 署名
settings.put('/', async (c) => {
  const body = await c.req.json<SaveSettingsBody>().catch(() => null)
  if (typeof body?.defaultReqFrom !== 'string') {
    return c.json({ error: '缺少 defaultReqFrom' }, 400)
  }
  writeSettings(body.defaultReqFrom.trim())
  return c.json({ ok: true })
})
