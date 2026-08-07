#!/usr/bin/env node
// 校验「发布版本号」三处书写一致（发版前 fail fast）：
//   1) git tag（形如 v0.4.0，作为参数传入；不传则跳过这项）
//   2) apps/desktop/package.json 的 version    ← electron-builder 的打包版本，权威来源
//   3) apps/web/src/lib/appMeta.ts 的 APP_VERSION ← 界面展示版本
// 这三处目前靠手工双写维护（CLAUDE.md 明说发版时要一起改），最容易漏。
//
// 用法：
//   node scripts/check-version.mjs           只校验 2 与 3（本地 / PR）
//   node scripts/check-version.mjs v0.4.0    连 tag 一起校验（发版流水线）
//   node scripts/check-version.mjs --print   打印权威版本号（供 CI 取值，无换行）
//
// ⚠️ 保持零依赖（只用 node 内置模块）：CI 的 prepare job 刻意不装依赖以求快。
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkgPath = join(root, 'apps/desktop/package.json')
const metaPath = join(root, 'apps/web/src/lib/appMeta.ts')

const pkgVersion = JSON.parse(readFileSync(pkgPath, 'utf8')).version
const matched = readFileSync(metaPath, 'utf8').match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/)
if (!matched) {
  console.error(`[check-version] 无法从 ${metaPath} 解析 APP_VERSION`)
  process.exit(1)
}
const metaVersion = matched[1]

if (process.argv.includes('--print')) {
  process.stdout.write(pkgVersion) // 不带换行，便于 $(...) 取值
  process.exit(0)
}

const errors = []
if (pkgVersion !== metaVersion) {
  errors.push(
    `apps/desktop/package.json version=${pkgVersion} ≠ appMeta.ts APP_VERSION=${metaVersion}`,
  )
}

const tag = process.argv.slice(2).find((a) => !a.startsWith('-'))
if (tag) {
  if (!/^v\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(tag)) {
    errors.push(`tag "${tag}" 不符合 vMAJOR.MINOR.PATCH[-prerelease] 规范`)
  } else if (tag.slice(1) !== pkgVersion) {
    errors.push(`tag ${tag} ≠ apps/desktop/package.json version=${pkgVersion}`)
  }
}

if (errors.length) {
  console.error('[check-version] 版本不一致：')
  for (const e of errors) console.error('  - ' + e)
  console.error('\n发版前请把三处改成同一个值：')
  console.error('  apps/desktop/package.json   →  version')
  console.error('  apps/web/src/lib/appMeta.ts →  APP_VERSION')
  console.error('  git tag                     →  v<version>')
  process.exit(1)
}

console.log(`[check-version] OK v${pkgVersion}${tag ? ` (tag ${tag})` : ''}`)
