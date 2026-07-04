import { Link } from 'react-router-dom'
import { APP_NAME, APP_VERSION } from '@/lib/appMeta'

// 品牌标记：favicon 流程图 mark + 应用名 + 版本号。点击回首页。
// 顶栏 / 侧栏共用，保证两处 logo 视觉一致。
export function AppLogo({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      title="返回首页"
      className={`flex items-center gap-2 transition-opacity hover:opacity-70 ${className ?? ''}`}
    >
      <img src="/favicon.svg" alt="" className="size-7 shrink-0" />
      <div className="flex flex-col leading-none">
        <span className="text-sm font-semibold text-sidebar-foreground">{APP_NAME}</span>
        <span className="text-[10px] font-medium text-muted-foreground">v{APP_VERSION}</span>
      </div>
    </Link>
  )
}
