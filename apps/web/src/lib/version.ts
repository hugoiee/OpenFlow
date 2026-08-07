// 版本号比较（检查更新用）。当前版本的唯一权威来源是 appMeta.ts 的 APP_VERSION，
// 后端刻意不持有版本号（否则就成了第三处双写），故比较放在前端。

/**
 * latest 是否比 current 新。只比数字段（1.2.3），忽略 v 前缀；
 * 数字段相同时，正式版视为**新于**预发布版（1.2.3 > 1.2.3-beta.1）。
 * 不引 semver 依赖——支撑「有没有新版」这个判断足够了。
 */
export function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) => {
    const [core, pre] = v.trim().replace(/^v/i, '').split('-', 2)
    return {
      nums: core.split('.').map((n) => Number.parseInt(n, 10) || 0),
      isPre: Boolean(pre),
    }
  }
  if (!latest.trim() || !current.trim()) return false
  const a = parse(latest)
  const b = parse(current)
  const len = Math.max(a.nums.length, b.nums.length)
  for (let i = 0; i < len; i++) {
    const diff = (a.nums[i] ?? 0) - (b.nums[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return !a.isPre && b.isPre
}

/** 是否运行在桌面端（Electron 外壳经 preload 注入的标记）——Web 版没有安装包，不显示更新入口。 */
export function isDesktop(): boolean {
  return Boolean((window as { openflow?: { desktop?: boolean } }).openflow?.desktop)
}
