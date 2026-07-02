import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { Hono } from 'hono'
import './db'
import './task-store'
import { projects } from './routes/projects'
import { settings } from './routes/settings'
import { image } from './routes/image'
import { upload } from './routes/upload'
import { video } from './routes/video'
import { tasks } from './routes/tasks'
import { promptPresets } from './routes/prompt-presets'
import { download } from './routes/download'

export interface CreateAppOptions {
  /** 前端静态产物目录（Electron 生产环境注入）；提供则在根路径托管 SPA。 */
  staticDir?: string
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

/**
 * 在根路径托管前端静态产物。前端用 HashRouter，路由都在 # 后，服务端只会收到 `/`
 * 与静态资源路径，取不到文件时统一回退 index.html（SPA 兜底）。
 */
function mountStatic(app: Hono, staticDir: string) {
  const root = normalize(staticDir)
  const readFromRoot = async (rel: string): Promise<[Uint8Array<ArrayBuffer>, string] | null> => {
    // 防目录穿越：规范化后必须仍在 root 内
    const abs = normalize(join(root, rel))
    if (abs !== root && !abs.startsWith(root + sep)) return null
    try {
      const buf = await readFile(abs)
      // 拷进 ArrayBuffer 背衬的 Uint8Array 以满足 c.body 类型
      const bytes = new Uint8Array(buf.byteLength)
      bytes.set(buf)
      return [bytes, MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream']
    } catch {
      return null
    }
  }
  app.get('/*', async (c, next) => {
    if (c.req.path.startsWith('/api/')) return next()
    const rel = decodeURIComponent(c.req.path)
    const hit =
      (await readFromRoot(rel === '/' ? 'index.html' : rel)) ??
      (await readFromRoot('index.html'))
    if (!hit) return next()
    const [buf, type] = hit
    return c.body(buf, 200, { 'Content-Type': type })
  })
}

/** 构建 Hono 应用（路由挂载 + 可选静态托管）。dev 与 Electron 生产共用。 */
export function createApp(opts: CreateAppOptions = {}): Hono {
  const app = new Hono()

  app.get('/api/health', (c) => c.json({ ok: true }))
  app.route('/api/projects', projects)
  app.route('/api/settings', settings)
  app.route('/api', image)
  app.route('/api', upload)
  app.route('/api', video)
  app.route('/api/tasks', tasks)
  app.route('/api/prompt-presets', promptPresets)
  app.route('/api', download)

  if (opts.staticDir) mountStatic(app, opts.staticDir)

  return app
}
