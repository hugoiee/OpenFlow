import { useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { PromptPresetsDialog } from '@/components/presets/PromptPresetsDialog'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { ProjectCard } from '@/components/home/ProjectCard'
import { useFlowStore } from '@/store/useFlowStore'
import type { Project } from '@/lib/types'

export function HomePage() {
  const navigate = useNavigate()
  const projects = useFlowStore((s) => s.projects)
  const homeView = useFlowStore((s) => s.homeView)
  const setHomeView = useFlowStore((s) => s.setHomeView)
  const addProject = useFlowStore((s) => s.addProject)

  const createProject = async () => {
    const id = await addProject()
    navigate(`/project/${id}`)
  }

  // 置顶项目与其他项目分成两组（各自保持后端排好的顺序），渲染到两个独立容器里 —— 不同行显示
  const [pinnedProjects, otherProjects] = useMemo(
    () => [projects.filter((p) => p.pinned), projects.filter((p) => !p.pinned)],
    [projects],
  )

  const renderProjects = (list: Project[]) =>
    homeView === 'grid' ? (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
        {list.map((p) => (
          <ProjectCard key={p.id} project={p} view="grid" />
        ))}
      </div>
    ) : (
      <div className="mx-auto flex max-w-2xl flex-col gap-2">
        {list.map((p) => (
          <ProjectCard key={p.id} project={p} view="list" />
        ))}
      </div>
    )

  const sectionTitle = (text: string, icon?: ReactNode) => (
    <div
      className={`mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground ${
        homeView === 'list' ? 'mx-auto max-w-2xl' : ''
      }`}
    >
      {icon}
      {text}
    </div>
  )

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="text-lg font-semibold">OpenFlow</span>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border p-0.5">
            <Button
              size="sm"
              variant={homeView === 'grid' ? 'secondary' : 'ghost'}
              className="h-7 px-2"
              onClick={() => setHomeView('grid')}
            >
              宫格
            </Button>
            <Button
              size="sm"
              variant={homeView === 'list' ? 'secondary' : 'ghost'}
              className="h-7 px-2"
              onClick={() => setHomeView('list')}
            >
              列表
            </Button>
          </div>
          <ThemeToggle className="size-8" />
          <PromptPresetsDialog>
            <Button size="sm" variant="ghost" title="常用 Prompt 预设">
              预设
            </Button>
          </PromptPresetsDialog>
          <SettingsDialog>
            <Button size="sm" variant="ghost" title="API 设置">
              设置
            </Button>
          </SettingsDialog>
          <Button size="sm" onClick={createProject}>
            + 新建项目
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        {projects.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <h2 className="text-xl font-semibold">还没有项目</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              每个项目是一块独立画布。新建一个项目，然后在画布上添加 Prompt 节点和 Model
              节点，用连线把它们连起来。
            </p>
            <Button onClick={createProject}>+ 新建项目</Button>
          </div>
        ) : pinnedProjects.length === 0 ? (
          // 没有置顶项目时不显示分区标题，布局与未启用置顶时一致
          renderProjects(otherProjects)
        ) : (
          <div className="flex flex-col gap-4">
            <section>
              {sectionTitle('置顶', <Pin className="size-3.5" />)}
              {renderProjects(pinnedProjects)}
            </section>
            {otherProjects.length > 0 && (
              <>
                <Separator className={homeView === 'list' ? 'mx-auto max-w-2xl' : ''} />
                <section>
                  {sectionTitle('其他项目')}
                  {renderProjects(otherProjects)}
                </section>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
