import { Hono } from 'hono'
import { resolveReqFrom, uploadImages } from '../provider'
import { readSettings } from '../settings-store'

export const upload = new Hono()

// 经后端代理转发图片上传到上传接口（绕 CORS；接口当前无鉴权）
upload.post('/upload', async (c) => {
  const form = await c.req.formData().catch(() => null)
  if (!form) return c.json({ error: '无效的上传请求' }, 400)
  // req_from 取全局设置注入（前端不再传），与图像/视频生成署名一致
  form.set('req_from', resolveReqFrom(readSettings().defaultReqFrom))
  try {
    const urls = await uploadImages(form)
    return c.json({ urls })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
})
