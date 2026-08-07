import { Hono } from 'hono'
import type { UpdateCheckResponse } from '@openflow/shared'

export const update = new Hono()

/** 发布仓库（Release 页 / API 都由它拼出）；可用 env 覆盖，便于 fork 后自建发布源。 */
const REPO = process.env.OPENFLOW_RELEASE_REPO ?? 'hugoiee/OpenFlow'
/** 缓存时长：匿名 GitHub API 限流 60 次/小时/IP，单用户桌面应用半小时查一次绰绰有余。 */
const CACHE_TTL_MS = 30 * 60 * 1000

let cache: { at: number; data: UpdateCheckResponse } | null = null

/** 查 GitHub 最新 Release。仓库需为 public（私有仓库匿名读不到，会落到 error 分支）。 */
async function fetchLatest(): Promise<UpdateCheckResponse> {
  const releasesPage = `https://github.com/${REPO}/releases`
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'OpenFlow' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      // 404 = 还没发过 Release（或仓库私有）；403 = 撞限流。都不是需要打扰用户的错误
      return { latest: '', url: releasesPage, error: `GitHub API HTTP ${res.status}` }
    }
    const data = (await res.json()) as { tag_name?: string; html_url?: string }
    const latest = (data.tag_name ?? '').replace(/^v/, '')
    if (!latest) return { latest: '', url: releasesPage, error: '未从 Release 解析到版本号' }
    return { latest, url: data.html_url || releasesPage }
  } catch (e) {
    return { latest: '', url: releasesPage, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * GET /api/update-check：返回最新发布版本与其 Release 地址（**不做版本比较**，见 UpdateCheckResponse 注释）。
 * 结果缓存 CACHE_TTL_MS；`?force=1` 跳过缓存（供设置面板的「检查更新」按钮）。
 * 任何失败都仍返回 2xx——检查更新失败不该打扰用户，前端据 error 字段自行决定是否提示。
 */
update.get('/update-check', async (c) => {
  const force = c.req.query('force') === '1'
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return c.json(cache.data)
  }
  const data = await fetchLatest()
  // 只缓存成功结果，失败下次仍会重试
  if (!data.error) cache = { at: Date.now(), data }
  return c.json(data)
})
