import { build } from 'esbuild'
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const root = join(scriptsDir, '..') // apps/desktop
const outdir = join(root, 'dist-electron')
const webDist = join(root, '..', 'web', 'dist')

rmSync(outdir, { recursive: true, force: true })
mkdirSync(outdir, { recursive: true })

// 主/预加载进程输出 CJS（.cjs 强制 CommonJS，规避 Electron ESM 边角问题）；
// electron 与 better-sqlite3(原生) 保持 external，运行时从 node_modules 解析。
const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron', 'better-sqlite3'],
  sourcemap: true,
  logLevel: 'info',
  // db.ts 的回退分支含 import.meta.url（CJS 产物里为空），但桌面端始终注入 OPENFLOW_DATA_DIR
  // 不会执行到该分支，故静音此告警
  logOverride: { 'empty-import-meta': 'silent' },
}

await build({
  ...common,
  entryPoints: [join(root, 'src/main.ts')],
  outfile: join(outdir, 'main.cjs'),
})
await build({
  ...common,
  entryPoints: [join(root, 'src/preload.ts')],
  outfile: join(outdir, 'preload.cjs'),
})

// 拷贝前端构建产物到 dist-electron/web（生产环境由内嵌服务器托管）
if (existsSync(webDist)) {
  cpSync(webDist, join(outdir, 'web'), { recursive: true })
  console.log('[desktop] copied web dist → dist-electron/web')
} else if (process.env.CI) {
  // CI 里静默产出「一个没有前端的安装包」比构建失败危险得多（装上才发现白屏），直接中止。
  // 本地不这么做：pnpm dev 走 Vite dev server，本来就不需要 apps/web/dist。
  throw new Error('[desktop] apps/web/dist 不存在：CI 中拒绝产出缺前端的包，请先跑 build:web')
} else {
  console.warn('[desktop] WARN: apps/web/dist 不存在，请先跑 pnpm run build:web')
}
