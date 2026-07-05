import { Hono } from 'hono'
import { resolveReqFrom, uploadFiles } from '../provider'
import { readSettings } from '../settings-store'

export const upload = new Hono()

// 经后端代理转发文件上传到上传接口（绕 CORS；接口当前无鉴权）
// kind 决定上游端点：audio / video → /api/upload-media（媒体），其余 → /api/upload（图片）
upload.post('/upload', async (c) => {
  const form = await c.req.formData().catch(() => null)
  if (!form) return c.json({ error: '无效的上传请求' }, 400)
  const q = c.req.query('kind')
  const kind = q === 'audio' || q === 'video' ? q : 'image'
  const s = readSettings()
  if (!s.defaultReqFrom.trim()) {
    return c.json({ error: '缺少调用方署名 req_from，请先在设置中填写' }, 400)
  }
  // req_from 取全局设置注入（前端不再传），与图像/视频生成署名一致
  form.set('req_from', resolveReqFrom(s.defaultReqFrom))
  const endpoint = kind === 'image' ? s.uploadEndpoint : s.uploadMediaEndpoint
  try {
    const urls = await uploadFiles(form, kind, endpoint)
    return c.json({ urls })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
})
