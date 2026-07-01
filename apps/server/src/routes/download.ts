import { Hono } from 'hono'

export const download = new Hono()

// Content-Type（去参数、小写后）→ 扩展名。识别不出再退 URL 后缀 / kind 兜底。
const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
}

// 已知媒体扩展名（用于从 URL 路径兜底识别；避免把随机 query 当扩展名）
const KNOWN_EXT = new Set(Object.values(EXT_BY_MIME))

/** 从 URL 路径末尾抽取已知媒体扩展名（无则空）；jpeg 归一为 jpg。 */
function extFromUrl(raw: string): string {
  try {
    const path = new URL(raw).pathname
    const m = /\.([a-z0-9]{1,5})$/i.exec(path)
    const found = m?.[1]?.toLowerCase()
    if (!found) return ''
    const ext = found === 'jpeg' ? 'jpg' : found
    return KNOWN_EXT.has(ext) ? ext : ''
  } catch {
    return ''
  }
}

/** 解析最终扩展名：Content-Type 优先 → URL 后缀 → kind 兜底（image=png / video=mp4）。 */
function resolveExt(contentType: string | null, url: string, kind: string): string {
  const mime = (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
  return EXT_BY_MIME[mime] || extFromUrl(url) || (kind === 'video' ? 'mp4' : 'png')
}

// 文件名里要剔除的路径分隔符 / 系统保留字符（空格、连字符等合法字符保留）
const RESERVED_NAME = /[\\/:*?"<>|]/g

/** 清洗用户文件名：去掉路径/保留字符与控制字符及首尾空白，空则回退 download。 */
function safeBaseName(name: string | undefined): string {
  const cleaned = (name ?? '')
    .replace(RESERVED_NAME, '')
    .replace(/\p{Cc}/gu, '')
    .trim()
  return cleaned || 'download'
}

/**
 * 下载代理：把跨域的生成结果 URL 经后端流式回传，带 Content-Disposition 触发浏览器下载。
 * 前端 <a download> 对跨域资源无效，故必须走同源代理；顺带按响应类型补正确扩展名。
 */
download.get('/download', async (c) => {
  const url = c.req.query('url') ?? ''
  const kind = c.req.query('kind') === 'video' ? 'video' : 'image'
  if (!/^https?:\/\//i.test(url)) {
    return c.json({ error: '无效的下载地址' }, 400)
  }

  let res: Response
  try {
    res = await fetch(url)
  } catch (e) {
    return c.json({ error: `拉取源文件失败：${e instanceof Error ? e.message : String(e)}` }, 502)
  }
  if (!res.ok || !res.body) {
    return c.json({ error: `源文件不可用：HTTP ${res.status}` }, 502)
  }

  const ext = resolveExt(res.headers.get('content-type'), url, kind)
  const filename = `${safeBaseName(c.req.query('name'))}.${ext}`
  // 非 ASCII（如中文）文件名走 RFC 5987 filename*，另给 ASCII 兜底名兼容老浏览器
  const asciiName = filename.replace(/[^ -~]/g, '_')

  const headers: Record<string, string> = {
    'Content-Type': res.headers.get('content-type') || 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(
      filename,
    )}`,
  }
  const len = res.headers.get('content-length')
  if (len) headers['Content-Length'] = len

  return c.body(res.body, 200, headers)
})
