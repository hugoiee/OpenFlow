import { useNavigate } from 'react-router-dom'
import { Home } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { AppLogo } from '@/components/workspace/AppLogo'
import { NODE_GROUPS } from '@/lib/nodeMenu'

export function ProjectSidebar() {
  const navigate = useNavigate()

  return (
    <Sidebar>
      {/* 头部只放品牌 logo；主题/预设/设置/账号已迁至工作区顶栏 WorkspaceHeader */}
      <SidebarHeader className="h-14 flex-row items-center px-2">
        <AppLogo />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => navigate('/')}>
                  <Home className="size-4" />
                  <span>返回首页</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {NODE_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <div className="px-2 pb-2">
              <h3 className="text-xs font-semibold leading-tight">{group.label}</h3>
            </div>
            <SidebarGroupContent>
              <div className="grid grid-cols-2 gap-2 px-1 mb-4">
                {group.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.label}
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        // 拖拽建节点：把类型/模型塞进 dataTransfer，画布 onDrop 读取
                        e.dataTransfer.setData(
                          'application/openflow-node',
                          JSON.stringify({
                            type: item.type,
                            model: item.model,
                            videoVariant: item.videoVariant,
                          }),
                        )
                        e.dataTransfer.effectAllowed = 'copy'
                      }}
                      title={`拖入画布添加 ${item.label}`}
                      className="group flex aspect-[4/3] cursor-grab flex-col items-center justify-center gap-2 rounded-xl border border-sidebar-border bg-sidebar-accent/40 px-2 text-center transition-colors hover:border-sidebar-ring hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring active:cursor-grabbing"
                    >
                      <Icon className="size-6 text-muted-foreground transition-colors group-hover:text-sidebar-accent-foreground" />
                      <span className="text-xs font-medium leading-tight text-sidebar-foreground">
                        {item.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  )
}
