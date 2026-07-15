import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { Hono } from 'hono'
import { generatedFilesDir } from '../db'

export const files = new Hono()

const MIME: Record<string, string> = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
}

// 后端生成文件（播客音频等）的同源服务：GET /api/files/:name。
// 只按文件名取 <数据目录>/files 下的文件，规范化后须仍在目录内（防目录穿越）。
files.get('/files/:name', async (c) => {
  const name = c.req.param('name')
  const root = normalize(generatedFilesDir)
  const abs = normalize(join(root, name))
  if (!abs.startsWith(root + sep)) return c.json({ error: '非法文件名' }, 400)
  try {
    const buf = await readFile(abs)
    const bytes = new Uint8Array(buf.byteLength)
    bytes.set(buf)
    return c.body(bytes, 200, {
      'Content-Type': MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    })
  } catch {
    return c.json({ error: '文件不存在' }, 404)
  }
})
