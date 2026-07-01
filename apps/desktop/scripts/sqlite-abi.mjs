// 在 better-sqlite3 的 Node ABI / Electron ABI 之间切换（二者共用同一物理副本，一次只能建一种）。
//   node sqlite-abi.mjs node       → 还原系统 Node ABI（供 pnpm dev:all / pnpm server）
//   node sqlite-abi.mjs electron   → 切到本机 Electron ABI（供 electron . 交互式开发 / 本机架构打包）
//   node sqlite-abi.mjs win        → 拉取 Windows(win32-x64)+Electron ABI 预编译产物（供在 mac 上交叉打包 win）
// 说明：
//  - dist:mac 由 electron-builder 按目标架构自行重建并自带副本；
//  - dist:win 因原生模块无法在 mac 上为 Windows 编译，改由本脚本从 better-sqlite3 的 GitHub
//    预编译产物直接下载对应 .node 覆盖到 build/Release，再让 electron-builder 原样打包（-c.npmRebuild=false）；
//  - 打包脚本末尾会调用本脚本 `node` 还原，使打包不破坏 pnpm dev:all。
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const target = process.argv[2]
if (target !== 'node' && target !== 'electron' && target !== 'win') {
  console.error('usage: node sqlite-abi.mjs <node|electron|win>')
  process.exit(1)
}

const require = createRequire(import.meta.url)
const pkgDir = dirname(require.resolve('better-sqlite3/package.json'))
const scriptsDir = dirname(fileURLToPath(import.meta.url))
const desktopDir = dirname(scriptsDir)

if (target === 'electron') {
  // electron-rebuild 内部按 runtime=electron 拉取/编译对应 ABI 预编译产物
  console.log('[sqlite-abi] → Electron ABI (electron-rebuild)')
  execFileSync('pnpm', ['exec', 'electron-rebuild', '-f', '-w', 'better-sqlite3'], {
    cwd: desktopDir,
    stdio: 'inherit',
  })
} else if (target === 'win') {
  // 交叉打包 Windows：原生模块无法在 mac 上为 win 编译，改用 prebuild-install 直接下载
  // better-sqlite3 官方发布的 win32-x64 + 目标 Electron ABI 预编译 .node，覆盖到 build/Release。
  // Electron 版本从 desktop 依赖动态解析，保证与打包用的 Electron ABI 一致。
  const electronVersion = require(
    require.resolve('electron/package.json', { paths: [desktopDir] }),
  ).version
  console.log(`[sqlite-abi] → win32-x64 Electron ABI (prebuild-install, electron ${electronVersion})`)
  execFileSync(
    'pnpm',
    [
      'exec',
      'prebuild-install',
      '--platform',
      'win32',
      '--arch',
      'x64',
      '--runtime',
      'electron',
      '--target',
      electronVersion,
      '--tag-prefix',
      'v',
    ],
    { cwd: pkgDir, stdio: 'inherit' },
  )
} else {
  // prebuild-install 默认 runtime=node，拉取系统 Node ABI 预编译产物（无需本地编译工具链）
  console.log('[sqlite-abi] → Node ABI (prebuild-install -r node) in', pkgDir)
  execFileSync('pnpm', ['exec', 'prebuild-install', '-r', 'node'], {
    cwd: pkgDir,
    stdio: 'inherit',
  })
}
console.log('[sqlite-abi] done:', target)
