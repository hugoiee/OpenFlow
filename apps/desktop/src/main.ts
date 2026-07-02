import path from 'node:path'
import { app, BrowserWindow, dialog, nativeTheme } from 'electron'
import { startServer, type RunningServer } from '@openflow/server/server'

// 打包为 CJS，运行时用原生 __dirname 指向 dist-electron（import.meta.url 在 CJS 产物里为空）
declare const __dirname: string
const moduleDir = __dirname
// 开发：指向 Vite dev server（HMR）；生产：由内嵌服务器托管构建产物。
const DEV_URL = process.env.VITE_DEV_SERVER_URL

let server: RunningServer | null = null
let mainWindow: BrowserWindow | null = null

// 生产环境优先用的固定端口：localStorage 按「协议+主机+端口」隔离，
// 端口每次启动漂移会让主题（openflow-theme）/homeView 等 UI 偏好永远读不回来。
const PROD_PORT = 42617

/** 启动内嵌 Hono 服务（仅一次）：数据落 userData，生产环境同时托管前端产物。 */
async function ensureServer(): Promise<RunningServer> {
  if (server) return server
  const dataDir = process.env.OPENFLOW_DATA_DIR || app.getPath('userData')
  if (DEV_URL) {
    // 开发固定 8787（与 Vite 代理一致，仅提供 /api）
    server = await startServer({ port: 8787, dataDir })
    return server
  }
  const staticDir = path.join(moduleDir, 'web')
  try {
    server = await startServer({ port: PROD_PORT, dataDir, staticDir })
  } catch {
    // 固定端口被占用：回退系统分配（本次会话 localStorage 偏好读不回，但应用可用）
    server = await startServer({ port: 0, dataDir, staticDir })
  }
  return server
}

function createWindow() {
  const url = DEV_URL ?? `http://localhost:${server!.port}/`
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    // 原生窗面颜色跟随系统明暗：页面内的防白闪脚本管不到「窗口创建 → 渲染器首帧」
    // 这段原生绘制，写死白色会让暗色用户每次启动白闪。深色值对齐前端 .dark 的
    // --background（oklch(0.145 0 0) ≈ #0a0a0a）。
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a0a0a' : '#ffffff',
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
    try {
      await ensureServer()
      createWindow()
    } catch (err) {
      // 内嵌服务启动失败（最常见：原生模块 better-sqlite3 的 ABI/平台不匹配）。
      // 若不处理，主进程会静默存活但无窗口（任务管理器有进程、界面不出现）——此处显式弹错并退出。
      dialog.showErrorBox(
        'OpenFlow 启动失败',
        '内嵌服务启动失败，应用无法打开。\n\n' +
          '常见原因：当前系统缺少匹配的原生数据库模块（better-sqlite3）。\n\n' +
          String(err instanceof Error ? (err.stack ?? err.message) : err),
      )
      app.quit()
    }
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
