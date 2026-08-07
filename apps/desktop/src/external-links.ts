// 外链归属判定（主进程用）。
//
// 背景：Electron 默认会把页面里的 target="_blank" / window.open 开成一个新的
// BrowserWindow —— 那是个没有地址栏、没有前进后退、也没有用户既有登录态的壳，
// 用它看 GitHub Release 下载页很难用。故主进程统一拦截，交给系统默认浏览器。
//
// 这里只做判定不做副作用，方便单测覆盖（尤其是「什么不该打开」那几条）。

export type LinkAction =
  /** 应用自身页面内的地址：维持现状，别劫持（下载代理 /api/download 也走这一类） */
  | 'internal'
  /** 站外 http(s)：交给系统默认浏览器 */
  | 'external'
  /** 解析不了或非 http(s)：一律丢弃 */
  | 'ignore'

/**
 * @param rawUrl   页面给出的目标地址（不可信，可能来自生成结果里的任意字符串）
 * @param appOrigin 应用自身的 origin（生产 = 内嵌服务 localhost:端口，开发 = Vite dev server）；
 *                  拿不到时按「无法确认是自己人」处理，站外链接照样外开。
 *
 * ⚠️ 只放行 http/https：file: / 自定义 scheme 交给 shell.openExternal 等于让页面内容
 * （含 AIGC 返回的 URL）驱动系统去打开本地文件或已注册的协议处理器，是一条实打实的提权路径。
 */
export function classifyLink(rawUrl: string, appOrigin: string | null): LinkAction {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return 'ignore'
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'ignore'
  if (appOrigin && url.origin === appOrigin) return 'internal'
  return 'external'
}
