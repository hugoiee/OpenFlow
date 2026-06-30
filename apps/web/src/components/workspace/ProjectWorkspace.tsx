import { useEffect } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { FlowCanvasWithProvider } from '@/components/canvas/FlowCanvas'
import { NodeInspector } from '@/components/inspector/NodeInspector'
import { ProjectSidebar } from '@/components/projects/ProjectSidebar'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { useFlowStore } from '@/store/useFlowStore'

export function ProjectWorkspace() {
  const { id } = useParams<{ id: string }>()
  const loaded = useFlowStore((s) => s.loaded)
  const exists = useFlowStore((s) => s.projects.some((p) => p.id === id))
  const setActiveProject = useFlowStore((s) => s.setActiveProject)

  // 把路由参数同步进 store：画布操作（patchActive）依赖 activeProjectId。
  useEffect(() => {
    if (id && exists) setActiveProject(id)
  }, [id, exists, setActiveProject])

  // 项目还没从后端加载完成前，先不要判定「不存在」而误跳首页。
  if (!loaded) return null

  // 无效或已删除的项目 id：回首页。
  if (!id || !exists) return <Navigate to="/" replace />

  return (
    <SidebarProvider className="h-screen min-h-0 overflow-hidden">
      <ProjectSidebar />
      <SidebarInset className="relative min-h-0">
        <SidebarTrigger className="absolute left-2 top-2 z-20" />
        <FlowCanvasWithProvider />
        <NodeInspector />
      </SidebarInset>
    </SidebarProvider>
  )
}
