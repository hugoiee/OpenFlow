import path from 'node:path'
import { app, BrowserWindow, dialog, nativeTheme, shell } from 'electron'
import { startServer, type RunningServer } from '@openflow/server/server'
import { classifyLink } from './external-links'

// —— GPU 硬件加速 ——
// Windows 上 Electron 内置的 Chromium 常把本可用的 GPU 误列入黑名单、退回软件合成，
// 画布平移/缩放要在 CPU 上逐帧重绘（阴影 / 点阵背景 / 图片视频）→ 明显卡顿；
// 同一台机器的 Chrome 却流畅——因为 Chrome 的 GPU 黑名单更新更快、没拉黑这块卡。
// 放开黑名单 + 打开 GPU 光栅化，让 Electron 吃到与 Chrome 同样的硬件加速。
// ⚠️ 命令行开关必须在 app 就绪前设置才对 GPU 进程生效。
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('enable-gpu-rasterization')
// 零拷贝纹理上传：配合 GPU 光栅化进一步提升合成性能。
app.commandLine.appendSwitch('enable-zero-copy')
// 注：曾试过 disable-frame-rate-limit（解 vsync 限帧），但去掉 vsync 会让帧节奏不均、
// 缩放反而「不跟手」（Mac 上纯 20 节点画布实测更差），已移除。Win 的流畅度靠上面的
// GPU 加速开关（尤其 ignore-gpu-blocklist）解决，而非解锁帧率。

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

/** 应用自身页面的 origin：生产 = 内嵌服务的 localhost:端口（端口被占时会回退随机口，故运行时现取）。 */
function currentAppOrigin(): string | null {
  const base = DEV_URL ?? (server ? `http://localhost:${server.port}/` : null)
  if (!base) return null
  try {
    return new URL(base).origin
  } catch {
    return null
  }
}

// —— 外链一律交给系统默认浏览器 ——
// Electron 默认把 target="_blank" / window.open 开成新的 BrowserWindow：没有地址栏、
// 没有前进后退、也没有用户在系统浏览器里的登录态，用来看 GitHub Release 下载页很难用。
// 挂在 app 上而不是单个窗口上，将来新开的窗口/webview 自动同样受管。
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (classifyLink(url, currentAppOrigin()) === 'external') void shell.openExternal(url)
    // 应用内部并不使用弹窗，故 internal/ignore 也一并 deny——绝不产出第二个 Electron 窗口
    return { action: 'deny' }
  })
  // 没写 target 的外链会让当前窗口整个导航走（应用直接「变成」网页且回不来）
  contents.on('will-navigate', (event, url) => {
    if (classifyLink(url, currentAppOrigin()) !== 'external') return
    event.preventDefault()
    void shell.openExternal(url)
  })
})

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
      // 诊断：打印 GPU 各特性是硬件加速(enabled)还是软件(software/disabled)。
      // 从终端启动应用可见此输出，用来确认上面的开关是否把 gpu_compositing /
      // rasterization 从 software 变成了硬件加速。
      console.log('[openflow][gpu]', JSON.stringify(app.getGPUFeatureStatus()))
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
