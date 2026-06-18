import { Hono } from 'hono'
import type { FetchModelsBody, RunModelBody } from '@openflow/shared'
import { fetchModels, runChat } from '../provider'
import { getActiveConfig, readSettings } from '../settings-store'

export const model = new Hono()

// 拉取某供应商可用模型：key 用传入的，否则用已存的
model.post('/models', async (c) => {
  const body = await c.req.json<FetchModelsBody>().catch(() => null)
  if (!body?.providerId || !body.baseURL) {
    return c.json({ error: '缺少 providerId 或 baseURL' }, 400)
  }
  const stored = readSettings().configs[body.providerId]
  const apiKey = body.apiKey?.trim() ? body.apiKey.trim() : (stored?.apiKey ?? '')
  try {
    const models = await fetchModels({ baseURL: body.baseURL, apiKey })
    return c.json({ models })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
})

// 用激活供应商配置 + 已存 key 跑模型
model.post('/run', async (c) => {
  const body = await c.req.json<RunModelBody>().catch(() => null)
  if (!body?.model) return c.json({ error: '缺少 model' }, 400)

  const config = getActiveConfig()
  if (!config?.baseURL || !config.apiKey) {
    return c.json({ error: '激活供应商未配置（缺 baseURL 或 key）' }, 400)
  }
  try {
    const content = await runChat(
      { baseURL: config.baseURL, apiKey: config.apiKey },
      body.model,
      body.prompt,
    )
    return c.json({ content })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
})
