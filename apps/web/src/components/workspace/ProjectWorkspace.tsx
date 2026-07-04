import { useEffect } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { AgentChatPanel, AgentChatToggle } from '@/components/agent/AgentChatPanel'
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
      {/* flex-row：画布区弹性占满，Agent 聊天面板固定宽度靠右；NodeInspector 仍吸附画布区右缘 */}
      <SidebarInset className="flex min-h-0 flex-row overflow-hidden">
        <div className="relative min-w-0 flex-1">
          <SidebarTrigger className="absolute left-2 top-2 z-20 size-10" />
          <FlowCanvasWithProvider />
          <NodeInspector />
          <AgentChatToggle />
        </div>
        <AgentChatPanel projectId={id} />
      </SidebarInset>
    </SidebarProvider>
  )
}
