import { Hono } from 'hono'
import type { GenVideoBody } from '@openflow/shared'
import { runVideoGen } from '../provider'
import { readSettings } from '../settings-store'

export const video = new Hono()

// 经后端代理调 AIGC 视频生成接口（seedance；绕 CORS；接口当前无鉴权）
video.post('/video', async (c) => {
  const body = await c.req.json<GenVideoBody>().catch(() => null)
  if (!body?.model || !body.prompt?.trim()) {
    return c.json({ error: '缺少 model 或 prompt' }, 400)
  }
  try {
    const s = readSettings()
    const videos = await runVideoGen({
      // req_from / 端点取全局设置（前端不再传）；为空时由 provider 回退默认值
      reqFrom: s.defaultReqFrom,
      endpoint: s.aigcEndpoint,
      model: body.model,
      version: typeof body.version === 'string' ? body.version : '',
      mode: typeof body.mode === 'string' ? body.mode : '',
      prompt: body.prompt,
      images: Array.isArray(body.images) ? body.images : [],
      audios: Array.isArray(body.audios) ? body.audios : [],
      resolution: body.resolution || '720p',
      // ratio 可选：省略/非字符串时不传，由 provider 保持旧行为
      ratio: typeof body.ratio === 'string' ? body.ratio : undefined,
      duration: typeof body.duration === 'number' ? body.duration : 6,
    })
    return c.json({ videos })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
})
