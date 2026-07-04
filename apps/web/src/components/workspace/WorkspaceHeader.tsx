import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Library, LogOut, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { PromptPresetsDialog } from '@/components/presets/PromptPresetsDialog'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { useFlowStore } from '@/store/useFlowStore'
import { useSettingsStore } from '@/store/useSettingsStore'

/**
 * 工作区顶栏：贴合规划布局。
 * 左：侧栏开合 + 可点击改名的项目名；右：账号（邮箱前缀 + 退出）· 预设 · 主题 · 设置。
 * 品牌 logo 在侧栏头部（AppLogo），与本栏同高连成一条顶部横带。
 */
export function WorkspaceHeader({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const projectName = useFlowStore(
    (s) => s.projects.find((p) => p.id === projectId)?.name ?? '',
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
      <SidebarTrigger className="size-9 shrink-0" />

      {editing ? (
        <Input
          autoFocus
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
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
