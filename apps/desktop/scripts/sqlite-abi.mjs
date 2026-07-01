// 在 better-sqlite3 的 Node ABI / Electron ABI 之间切换（二者共用同一物理副本，一次只能建一种）。
//   node sqlite-abi.mjs node       → 还原系统 Node ABI（供 pnpm dev:all / pnpm server）
//   node sqlite-abi.mjs electron   → 切到 Electron ABI（供 electron . 交互式开发）
// 说明：dist:* 打包由 electron-builder 自行重建并自带副本，打包脚本末尾会调用本脚本还原 node，
// 使打包不破坏 pnpm dev:all。
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const target = process.argv[2]
if (target !== 'node' && target !== 'electron') {
  console.error('usage: node sqlite-abi.mjs <node|electron>')
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
} else {
  // prebuild-install 默认 runtime=node，拉取系统 Node ABI 预编译产物（无需本地编译工具链）
  console.log('[sqlite-abi] → Node ABI (prebuild-install -r node) in', pkgDir)
  execFileSync('pnpm', ['exec', 'prebuild-install', '-r', 'node'], {
    cwd: pkgDir,
    stdio: 'inherit',
  })
}
console.log('[sqlite-abi] done:', target)
