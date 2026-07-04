import { useEffect, type CSSProperties } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { AgentChatPanel, AgentChatToggle } from '@/components/agent/AgentChatPanel'
import { FlowCanvasWithProvider } from '@/components/canvas/FlowCanvas'
import { NodeInspector } from '@/components/inspector/NodeInspector'
import { ProjectSidebar } from '@/components/projects/ProjectSidebar'
import { WorkspaceHeader } from '@/components/workspace/WorkspaceHeader'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
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
    <SidebarProvider
      defaultOpen={false}
      className="h-screen min-h-0 overflow-hidden"
      style={{ '--sidebar-width': '240px' } as CSSProperties}
    >
      <ProjectSidebar />
      {/* flex-col：顶栏通栏置顶；其下 flex-row = 画布区 + Agent 面板，二者顶边均落在 header 之下 */}
      <SidebarInset className="flex min-h-0 flex-col overflow-hidden">
        <WorkspaceHeader projectId={id} />
        <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
          {/* 画布区：NodeInspector / AgentChatToggle 相对本容器定位，与 Agent 面板并排不重叠 */}
          <div className="relative min-w-0 flex-1">
            <FlowCanvasWithProvider />
            <NodeInspector />
            <AgentChatToggle />
          </div>
          <AgentChatPanel projectId={id} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
