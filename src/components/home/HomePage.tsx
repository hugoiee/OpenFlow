import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { ProjectCard } from '@/components/home/ProjectCard'
import { useFlowStore } from '@/store/useFlowStore'

export function HomePage() {
  const navigate = useNavigate()
  const projects = useFlowStore((s) => s.projects)
  const homeView = useFlowStore((s) => s.homeView)
  const setHomeView = useFlowStore((s) => s.setHomeView)
  const addProject = useFlowStore((s) => s.addProject)

  const createProject = () => {
    const id = addProject()
    navigate(`/project/${id}`)
  }

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
        ) : homeView === 'grid' ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} view="grid" />
            ))}
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-2">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} view="list" />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
