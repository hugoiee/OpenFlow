import { useCallback, useEffect, useRef, useState } from 'react'
import { checkUpdateApi } from '@/lib/api'
import { APP_VERSION } from '@/lib/appMeta'
import { isDesktop, isNewerVersion } from '@/lib/version'

export type UpdateState = {
  /** 是否有新版本可用。 */
  hasUpdate: boolean
  /** 最新版本号（查不到为空串）。 */
  latest: string
  /** Release 页面地址（供「去下载」跳转）。 */
  url: string
  /** 手动检查进行中。 */
  checking: boolean
  /** 已完成过至少一次检查（供 UI 区分「未查」与「已是最新」）。 */
  checked: boolean
  /** 上次检查失败的原因；仅手动检查时展示，自动检查静默。 */
  error: string
}

const INITIAL: UpdateState = {
  hasUpdate: false,
  latest: '',
  url: '',
  checking: false,
  checked: false,
  error: '',
}

/**
 * 检查更新：挂载时静默自查一次（有新版才提示，不打扰），另暴露 check() 供手动触发。
 *
 * 只在**桌面端**生效（Web 版没有安装包的概念，直接返回初始态不发请求）。
 * 版本比较放在前端：当前版本的唯一权威来源是 APP_VERSION，后端刻意不持有版本号。
 */
export function useUpdateCheck() {
  const [state, setState] = useState<UpdateState>(INITIAL)
  const desktop = isDesktop()

  const run = useCallback(
    async (force: boolean) => {
      if (!desktop) return
      setState((s) => ({ ...s, checking: true, error: '' }))
      try {
        const data = await checkUpdateApi(force)
        setState({
          hasUpdate: isNewerVersion(data.latest, APP_VERSION),
          latest: data.latest,
          url: data.url,
          checking: false,
          checked: true,
          error: data.error ?? '',
        })
      } catch (e) {
        setState((s) => ({
          ...s,
          checking: false,
          checked: true,
          error: e instanceof Error ? e.message : String(e),
        }))
      }
    },
    [desktop],
  )

  // 挂载时自查一次（严格模式下 effect 会跑两次，用 ref 去重，免得白打一次请求）
  const autoRan = useRef(false)
  useEffect(() => {
    if (!desktop || autoRan.current) return
    autoRan.current = true
    void run(false)
  }, [desktop, run])

  return {
    ...state,
    current: APP_VERSION,
    /** 是否显示更新相关 UI（Web 版一律不显示）。 */
    supported: desktop,
    /** 手动检查（跳过后端缓存）。 */
    check: useCallback(() => run(true), [run]),
  }
}
