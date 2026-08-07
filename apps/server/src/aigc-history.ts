import { readAigcResult, type AigcPayload } from './provider'

/**
 * AIGC 历史任务查询：同步响应没带回结果 URL 时，去网关的历史记录里把结果找回来。
 *
 * 背景：生成接口是「提交即阻塞等结果」的同步接口，但偶尔会返回不带 URL 的响应
 * （长连接被中间设备掐断、网关侧降级等）——而视频其实已经生成，稍后会以
 * `result.status = success` 落进网关的历史记录。内部另一个平台「重启刷新就能在历史里找回 URL」
 * 就是这个道理。本模块把那套「人工去历史里翻」自动化。
 *
 * 历史接口（GET，返回 { items, total }，无鉴权，按 req_from 过滤）：
 *   {endpoint}?ip=&req_from=<署名>&sort=last_seen_desc&page=1&page_size=50
 * 每条 item 含**完整原始请求**与**完整响应**，故即便同步响应连 request_id 都没给回来，
 * 也能靠请求指纹把自己那一条认出来。
 */

/** 历史查询端点；同其余端点，不内置默认地址（打包分发不带任一方的内网地址）。 */
const AIGC_HISTORY_ENDPOINT = process.env.AIGC_HISTORY_ENDPOINT ?? ''

/** 单次拉取的记录条数：够覆盖并发提交，又不至于拉回太多。 */
const PAGE_SIZE = 50
/** 单次 HTTP 查询的超时。 */
const FETCH_TIMEOUT_MS = 30_000
/** 轮询节奏：5s 起，×1.3 退避，封顶 30s。 */
const POLL_START_MS = 5_000
const POLL_MAX_MS = 30_000
/** 复查总时长上限：与生成调用的 30 分钟超时对齐；env 可覆盖（慢网关 / 测试用）。 */
export const POLL_DEADLINE_MS = Number(process.env.AIGC_HISTORY_DEADLINE_MS) || 30 * 60 * 1000
/**
 * 时间窗下界的容差：本机与网关时钟可能有偏差，往前放宽 5 分钟。
 * （上界不设——记录只会晚于提交时刻产生。）
 */
const CLOCK_SKEW_MS = 5 * 60 * 1000

export type HistoryItem = {
  id?: string
  created_at?: number
  request?: Record<string, unknown>
  response?: Record<string, unknown>
}

/** 认领用的请求指纹：只取「我们真正发出去的」判别字段。 */
export type HistoryFingerprint = {
  modelName: string
  version: string
  mode: string
  prompt: string
  imageList: string[]
  videoList: string[]
}

/**
 * 从请求体提炼指纹。
 * **刻意不含 config**：网关会往 config 里补 generate_audio / watermark 等我们没发的默认字段
 * 再落库，全等比对必然失配。prompt + 输入列表已是足够强的判别信号。
 */
export function fingerprintFromPayload(payload: AigcPayload): HistoryFingerprint {
  return {
    modelName: str(payload.model_name),
    version: str(payload.version),
    mode: str(payload.mode),
    prompt: str(payload.prompt),
    imageList: strList(payload.image_list),
    videoList: strList(payload.video_list),
  }
}

/** 一条历史记录的认领键：优先上游 request_id，退而用记录自身 id。 */
export function claimKeyOf(item: HistoryItem): string {
  const requestId = item.response?.request_id
  if (typeof requestId === 'string' && requestId.trim()) return requestId.trim()
  return typeof item.id === 'string' ? item.id : ''
}

export type MatchOptions = {
  /** 同步响应拿到的 request_id：有它就精确匹配，不必比指纹。 */
  requestId?: string
  fingerprint: HistoryFingerprint
  /** 任务提交时刻（ms）：只认这之后产生的记录，避免配到同参的历史旧任务。 */
  submittedAt: number
  /** 已被其他任务认领的 claimKey：跳过，防止同 prompt 连跑两次时两个任务抢同一条。 */
  claimed?: ReadonlySet<string>
}

/** 从历史列表里认出属于本次任务的那条记录。 */
export function matchHistoryItem(
  items: readonly HistoryItem[],
  opts: MatchOptions,
): HistoryItem | undefined {
  const claimed = opts.claimed
  const available = items.filter((item) => {
    const key = claimKeyOf(item)
    return !key || !claimed?.has(key)
  })

  if (opts.requestId) {
    const hit = available.find((item) => item.response?.request_id === opts.requestId)
    if (hit) return hit
  }

  const notBefore = opts.submittedAt - CLOCK_SKEW_MS
  const candidates = available.filter((item) => {
    if (typeof item.created_at === 'number' && item.created_at < notBefore) return false
    return item.request ? sameFingerprint(fingerprintFromPayload(item.request), opts.fingerprint) : false
  })
  if (candidates.length === 0) return undefined
  // 多条命中取最新的一条
  return candidates.reduce((best, cur) => ((cur.created_at ?? 0) > (best.created_at ?? 0) ? cur : best))
}

/** 拉取历史记录列表。端点为空时返回 null，表示「没配置，无法复查」。 */
export async function fetchHistory(opts: {
  endpoint?: string
  reqFrom: string
  pageSize?: number
}): Promise<HistoryItem[] | null> {
  const endpoint = resolveHistoryEndpoint(opts.endpoint)
  if (!endpoint) return null

  const url = new URL(endpoint)
  url.searchParams.set('ip', '')
  url.searchParams.set('req_from', opts.reqFrom)
  url.searchParams.set('sort', 'last_seen_desc')
  url.searchParams.set('page', '1')
  url.searchParams.set('page_size', String(opts.pageSize ?? PAGE_SIZE))

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    const text = await res.text().catch(() => '')
    if (!res.ok) throw new Error(`历史接口 HTTP ${res.status}：${text.slice(0, 200)}`)
    const data = JSON.parse(text) as { items?: unknown }
    return Array.isArray(data?.items) ? (data.items as HistoryItem[]) : []
  } finally {
    clearTimeout(timer)
  }
}

/** 历史端点解析：设置优先，回退 env；都为空返回空串（调用方据此降级，不报错）。 */
export function resolveHistoryEndpoint(value: string | undefined): string {
  return value?.trim() || AIGC_HISTORY_ENDPOINT.trim()
}

export type PollResult = { urls: string[]; claimKey: string }

export type PollOptions = MatchOptions & {
  endpoint?: string
  reqFrom: string
  /** 每轮开始前重新取一次「已被认领」集合（并发任务会边跑边认领）。 */
  getClaimed?: () => ReadonlySet<string>
  signal?: AbortSignal
  /** 复查总时长上限，默认 30 分钟。 */
  deadlineMs?: number
  /** 命中未终态的记录时回调（供上层刷新 upstream_id 落库）。 */
  onClaim?: (claimKey: string) => void
}

/**
 * 轮询历史直到认领到的记录进入终态。
 * - `status === 'success'` 且有 URL → 返回；
 * - `status === 'failed'` → 抛上游给的真实原因；
 * - 记录还没出现 / 还没终态 → 退避后再查，直到 deadline。
 */
export async function pollHistoryForResult(opts: PollOptions): Promise<PollResult> {
  const endpoint = resolveHistoryEndpoint(opts.endpoint)
  if (!endpoint) throw new Error('未配置 AIGC 历史查询接口，无法复查结果')

  const deadline = Date.now() + (opts.deadlineMs ?? POLL_DEADLINE_MS)
  let interval = POLL_START_MS
  let lastError: string | undefined
  let claimed = false

  for (;;) {
    if (opts.signal?.aborted) throw new Error('复查已取消')
    try {
      const items = await fetchHistory({ endpoint, reqFrom: opts.reqFrom })
      const hit = items
        ? matchHistoryItem(items, { ...opts, claimed: opts.getClaimed?.() ?? opts.claimed })
        : undefined
      if (hit) {
        const key = claimKeyOf(hit)
        if (key && !claimed) {
          claimed = true
          opts.onClaim?.(key)
        }
        const parsed = readAigcResult(hit.response)
        if (parsed.urls.length > 0) return { urls: parsed.urls, claimKey: key }
        if (parsed.status === 'failed' || parsed.errorMessage) {
          throw new UpstreamFailedError(parsed.errorMessage ?? '上游返回失败且未给出原因')
        }
      }
    } catch (e) {
      if (e instanceof UpstreamFailedError) throw e
      // 历史接口本身抖动：记下原因，下一轮再试
      lastError = e instanceof Error ? e.message : String(e)
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `上游未返回结果 URL，去历史记录复查 ${Math.round((opts.deadlineMs ?? POLL_DEADLINE_MS) / 60000)} 分钟仍未拿到${lastError ? `（最后一次查询失败：${lastError}）` : ''}`,
      )
    }
    await sleep(Math.min(interval, Math.max(0, deadline - Date.now())), opts.signal)
    interval = Math.min(POLL_MAX_MS, Math.round(interval * 1.3))
  }
}

/** 上游明确失败（区别于「历史接口暂时查不到」），不该被当成可重试的抖动。 */
export class UpstreamFailedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UpstreamFailedError'
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('复查已取消'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error('复查已取消'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function sameFingerprint(a: HistoryFingerprint, b: HistoryFingerprint): boolean {
  return (
    a.modelName === b.modelName &&
    a.version === b.version &&
    a.mode === b.mode &&
    a.prompt === b.prompt &&
    sameList(a.imageList, b.imageList) &&
    sameList(a.videoList, b.videoList)
  )
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}
