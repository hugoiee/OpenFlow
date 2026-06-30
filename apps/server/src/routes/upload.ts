import { Hono } from 'hono'
import { uploadImages } from '../provider'

export const upload = new Hono()

// 经后端代理转发图片上传到上传接口（绕 CORS；接口当前无鉴权）
upload.post('/upload', async (c) => {
  const form = await c.req.formData().catch(() => null)
  if (!form) return c.json({ error: '无效的上传请求' }, 400)
  try {
    const urls = await uploadImages(form)
    return c.json({ urls })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
})
