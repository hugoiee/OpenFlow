import { Link } from 'react-router-dom'
import { APP_NAME, APP_VERSION } from '@/lib/appMeta'

// 品牌标记：四节点连线 mark（内联 SVG）+ 应用名 + 版本号。点击回首页。
// 现由工作区顶栏（WorkspaceHeader）使用（工作区已无侧栏）。
// 「深色」节点用 currentColor（= text-foreground），随主题明暗自适应；
// 蓝色固定。与 public/favicon.svg 同一图形（favicon 靠 prefers-color-scheme 自适应）。
export function AppLogo({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      title="返回首页"
      className={`flex items-center gap-2 transition-opacity hover:opacity-70 ${className ?? ''}`}
    >
      <svg
        viewBox="0 0 256 256"
        fill="none"
        aria-hidden="true"
        className="size-7 shrink-0 text-foreground"
      >
        <g strokeWidth={15}>
          <line x1="105" y1="84" x2="128" y2="84" stroke="currentColor" />
          <line x1="128" y1="84" x2="151" y2="84" stroke="#3D6BFF" />
          <line x1="172" y1="105" x2="172" y2="128" stroke="#3D6BFF" />
          <line x1="172" y1="128" x2="172" y2="151" stroke="currentColor" />
          <line x1="105" y1="172" x2="128" y2="172" stroke="#3D6BFF" />
          <line x1="128" y1="172" x2="151" y2="172" stroke="currentColor" />
          <line x1="84" y1="105" x2="84" y2="128" stroke="currentColor" />
          <line x1="84" y1="128" x2="84" y2="151" stroke="#3D6BFF" />
        </g>
        <g fill="none" strokeWidth={15}>
          <circle cx="84" cy="84" r="21" stroke="currentColor" />
          <circle cx="172" cy="84" r="21" stroke="#3D6BFF" />
          <circle cx="84" cy="172" r="21" stroke="#3D6BFF" />
          <circle cx="172" cy="172" r="21" stroke="currentColor" />
        </g>
      </svg>
      <div className="flex flex-col leading-none">
        <span className="text-sm font-semibold text-foreground">{APP_NAME}</span>
        <span className="text-[10px] font-medium text-muted-foreground">v{APP_VERSION}</span>
      </div>
    </Link>
  )
}
