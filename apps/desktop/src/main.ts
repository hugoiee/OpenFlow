import path from 'node:path'
import { app, BrowserWindow } from 'electron'
import { startServer, type RunningServer } from '@openflow/server/server'

// 打包为 CJS，运行时用原生 __dirname 指向 dist-electron（import.meta.url 在 CJS 产物里为空）
declare const __dirname: string
const moduleDir = __dirname
// 开发：指向 Vite dev server（HMR）；生产：由内嵌服务器托管构建产物。
const DEV_URL = process.env.VITE_DEV_SERVER_URL

let server: RunningServer | null = null
let mainWindow: BrowserWindow | null = null

/** 启动内嵌 Hono 服务（仅一次）：数据落 userData，生产环境同时托管前端产物。 */
async function ensureServer(): Promise<RunningServer> {
  if (server) return server
  const dataDir = process.env.OPENFLOW_DATA_DIR || app.getPath('userData')
  server = await startServer({
    // 开发固定 8787（与 Vite 代理一致，仅提供 /api）；生产随机端口 + 托管 SPA。
    port: DEV_URL ? 8787 : 0,
    dataDir,
    staticDir: DEV_URL ? undefined : path.join(moduleDir, 'web'),
  })
  return server
}

function createWindow() {
  const url = DEV_URL ?? `http://localhost:${server!.port}/`
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(moduleDir, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  void mainWindow.loadURL(url)
  if (DEV_URL) mainWindow.webContents.openDevTools({ mode: 'detach' })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/** 无界面自检：验证 Electron 运行时下 better-sqlite3(原生模块) + 内嵌服务 + DB 读写全通。 */
async function runSelfTest() {
  try {
    const s = await ensureServer()
    const base = `http://localhost:${s.port}`
    const j = async (r: Response) => r.json()
    const health = await j(await fetch(`${base}/api/health`))
    const before = (await j(await fetch(`${base}/api/projects`))) as unknown[]
    const created = (await j(
      await fetch(`${base}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'selftest' }),
      }),
    )) as { id: string }
    const after = (await j(await fetch(`${base}/api/projects`))) as unknown[]
    await fetch(`${base}/api/projects/${created.id}`, { method: 'DELETE' })
    // 设置(含新端点字段)的 schema/迁移 + 合并写在打包库里是否可用
    await fetch(`${base}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultReqFrom: 'selftest', aigcEndpoint: 'http://x/aigc' }),
    })
    const settings = (await j(await fetch(`${base}/api/settings`))) as {
      defaultReqFrom: string
      aigcEndpoint: string
    }
    console.log(
      '[selftest] OK ' +
        JSON.stringify({
          health,
          port: s.port,
          beforeCount: before.length,
          createdId: created.id,
          afterCount: after.length,
          settings,
        }),
    )
    process.exitCode = 0
  } catch (e) {
    console.error('[selftest] FAIL', e)
    process.exitCode = 1
  } finally {
    server?.close()
    app.quit()
  }
}

if (process.env.OPENFLOW_SELFTEST) {
  app.whenReady().then(runSelfTest)
} else {
  app.whenReady().then(async () => {
    await ensureServer()
    createWindow()
  })
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('quit', () => {
    server?.close()
    server = null
  })
}
