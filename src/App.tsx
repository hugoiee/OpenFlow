import { Button } from '@/components/ui/button'
import { FlowCanvasWithProvider } from '@/components/canvas/FlowCanvas'
import { ProjectSidebar } from '@/components/projects/ProjectSidebar'
import { useActiveProject, useFlowStore } from '@/store/useFlowStore'

function App() {
  const activeProject = useActiveProject()
  const addProject = useFlowStore((s) => s.addProject)

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <ProjectSidebar />
      <main className="relative flex-1">
        {activeProject ? (
          <FlowCanvasWithProvider />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <h2 className="text-xl font-semibold">还没有打开的项目</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              每个项目是一块独立画布。新建一个项目，然后在画布上添加 Prompt 节点和 Model
              节点，用连线把它们连起来。
            </p>
            <Button onClick={() => addProject()}>+ 新建项目</Button>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
