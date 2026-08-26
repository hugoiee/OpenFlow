import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart3, ChevronRight, Download, Home, Library, LogOut, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { PromptPresetsDialog } from '@/components/presets/PromptPresetsDialog'
import { ProjectStatsDialog } from '@/components/stats/ProjectStatsDialog'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { AppLogo } from '@/components/workspace/AppLogo'
import { useUpdateCheck } from '@/hooks/useUpdateCheck'
import { useFlowStore } from '@/store/useFlowStore'
import { useSettingsStore } from '@/store/useSettingsStore'

/**
 * 工作区顶栏：贴合规划布局。
 * 左：品牌 logo（含版本号，纯展示）+ 新版本提醒 + 首页按钮 + 可点击改名的项目名；
 * 右：账号（邮箱前缀 + 退出）· 预设 · 主题 · 设置。
 * 工作区已无侧栏，logo / 版本 / 更新提醒都落在本栏（新建节点走画布右键菜单）。
 */
export function WorkspaceHeader({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  // 有新版本才提示（仅桌面端，Web 版 supported=false 不发请求也不渲染）
  const update = useUpdateCheck()
  const projectName = useFlowStore(
    (s) => s.projects.find((p) => p.id === projectId)?.name ?? '',
  )
  // 生成统计只对画布项目有意义（评估项目不建生成任务），故按形态显隐入口
  const isCanvas = useFlowStore(
    (s) => s.projects.find((p) => p.id === projectId)?.type !== 'evaluation',
  )
  const renameProject = useFlowStore((s) => s.renameProject)
  const defaultReqFrom = useSettingsStore((s) => s.defaultReqFrom)
  const saveReqFrom = useSettingsStore((s) => s.saveReqFrom)

  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState('')

  const startRename = () => {
    setDraftName(projectName)
    setEditing(true)
  }

  const commitRename = () => {
    renameProject(projectId, draftName)
    setEditing(false)
  }

  // 退出：清空 req_from → ReqFromGate 重新全屏阻断；同时回起始页。
  const handleLogout = async () => {
    try {
      await saveReqFrom('')
      navigate('/')
    } catch (e) {
      console.error('[openflow] 退出失败', e)
    }
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-2">
      {/* 品牌 logo + 版本号（纯展示不可点）——原在侧栏头部，侧栏移除后落到顶栏 */}
      <AppLogo className="shrink-0 px-1" />

      {/* 新版本提醒：紧跟版本号，只在查到更高版本时出现，点击去 Release 页下载 */}
      {update.hasUpdate && (
        <a
          href={update.url}
          target="_blank"
          rel="noreferrer"
          title={`有新版本 v${update.latest}，点击去下载`}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Download className="size-3" />新版本 v{update.latest}
        </a>
      )}

      {/* 层级面包屑：首页（回首页的唯一入口）> 项目名称 */}
      <button
        type="button"
        onClick={() => navigate('/')}
        title="返回首页"
        className="ml-1 flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Home className="size-4" />
        首页
      </button>
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />

      {editing ? (
        <Input
          autoFocus
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return // 输入法组词中，别把选字的回车/Esc 当作提交/取消
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="h-8 w-56 text-sm"
        />
      ) : (
        <button
          type="button"
          onClick={startRename}
          title="点击修改项目名"
          className="max-w-[16rem] truncate rounded-md px-2 py-1 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          {projectName || <span className="text-muted-foreground">未命名项目</span>}
        </button>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        {defaultReqFrom && (
          <div className="mr-1 flex items-center gap-0.5 rounded-full border bg-muted/40 py-0.5 pl-3 pr-1 text-xs">
            <SettingsDialog>
              <button
                type="button"
                title="邮箱前缀（req_from）· 点击修改"
                className="max-w-[10rem] truncate font-medium text-foreground hover:opacity-70"
              >
                {defaultReqFrom}
              </button>
            </SettingsDialog>
            <Button
              size="icon"
              variant="ghost"
              className="size-6 shrink-0 rounded-full text-muted-foreground"
              title="退出（清空邮箱前缀）"
              onClick={handleLogout}
            >
              <LogOut className="size-3.5" />
            </Button>
          </div>
        )}

        {isCanvas && (
          <ProjectStatsDialog projectId={projectId}>
            <Button size="icon" variant="ghost" className="size-9" title="生成统计（开销核算用）">
              <BarChart3 className="size-4" />
            </Button>
          </ProjectStatsDialog>
        )}

        <PromptPresetsDialog>
          <Button size="icon" variant="ghost" className="size-9" title="常用 Prompt 预设">
            <Library className="size-4" />
          </Button>
        </PromptPresetsDialog>

        <ThemeToggle className="size-9" />

        <SettingsDialog>
          <Button size="icon" variant="ghost" className="size-9" title="API 设置">
            <Settings className="size-4" />
          </Button>
        </SettingsDialog>
      </div>
    </header>
  )
}
