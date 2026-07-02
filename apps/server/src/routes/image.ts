import { Hono } from 'hono'
import type { GenImageBody } from '@openflow/shared'
import { runImageGen } from '../provider'
import { readSettings } from '../settings-store'

export const image = new Hono()

// 经后端代理调 AIGC 图像生成接口（绕 CORS；接口当前无鉴权）
image.post('/aigc', async (c) => {
  const body = await c.req.json<GenImageBody>().catch(() => null)
  if (!body?.model || !body.prompt?.trim()) {
    return c.json({ error: '缺少 model 或 prompt' }, 400)
  }
  try {
    const s = readSettings()
    if (!s.defaultReqFrom.trim()) {
      return c.json({ error: '缺少调用方署名 req_from，请先在设置中填写' }, 400)
    }
    const images = await runImageGen({
      // req_from / 端点取全局设置（前端不再传）；req_from 为空已在上面拦截
      reqFrom: s.defaultReqFrom,
      endpoint: s.aigcEndpoint,
      model: body.model,
      prompt: body.prompt,
      images: Array.isArray(body.images) ? body.images : [],
      size: body.size || 'auto',
      n: typeof body.n === 'number' ? body.n : 1,
      quality: body.quality || 'auto',
      version: typeof body.version === 'string' ? body.version : '',
      aspectRatio: typeof body.aspectRatio === 'string' ? body.aspectRatio : '',
      imageSize: typeof body.imageSize === 'string' ? body.imageSize : '',
    })
    return c.json({ images })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
})
