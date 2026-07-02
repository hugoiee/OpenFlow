import { serve } from '@hono/node-server'

export interface StartServerOptions {
  /** 监听端口；0 或省略则由系统分配空闲端口（Electron 生产环境用，避开端口冲突）。 */
  port?: number
  /** SQLite 数据目录；提供则注入 OPENFLOW_DATA_DIR（Electron 传 userData）。 */
  dataDir?: string
  /** 前端静态产物目录；提供则在根路径托管 SPA。 */
  staticDir?: string
}

export interface RunningServer {
  port: number
  close: () => void
}

/**
 * 启动内嵌 Hono 服务。先设好 OPENFLOW_DATA_DIR 再动态 import app，
 * 保证 db 初始化时读到注入的数据目录。
 */
export async function startServer(opts: StartServerOptions = {}): Promise<RunningServer> {
  if (opts.dataDir) process.env.OPENFLOW_DATA_DIR = opts.dataDir

  const { createApp } = await import('./app')
  const app = createApp({ staticDir: opts.staticDir })

  return await new Promise<RunningServer>((resolve, reject) => {
    // 监听失败（如指定端口被占用）时 reject，调用方可回退到 port:0 重试
    const onError = (err: unknown) => reject(err)
    const server = serve(
      { fetch: app.fetch, port: opts.port ?? 0, hostname: '127.0.0.1' },
      (info) => {
        server.off('error', onError)
        resolve({ port: info.port, close: () => server.close() })
      },
    )
    server.on('error', onError)
  })
}
