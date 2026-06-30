import { Link, useNavigate } from 'react-router-dom'
import { Home, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { type FlowNodeType } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'

// 画布可添加的节点类型；颜色点沿用画布节点的配色
const NODE_TYPES: { type: FlowNodeType; label: string; dot: string }[] = [
  { type: 'prompt', label: 'Prompt 节点', dot: 'bg-sky-500' },
  { type: 'model', label: 'Model 节点', dot: 'bg-violet-500' },
]

export function ProjectSidebar() {
  const navigate = useNavigate()
  const addNode = useFlowStore((s) => s.addNode)

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center justify-between px-1">
          <Link
            to="/"
            className="text-lg font-semibold hover:opacity-70"
            title="返回首页"
          >
            OpenFlow
          </Link>
          <SettingsDialog>
            <Button size="icon" variant="ghost" className="size-7" title="API 设置">
              <Settings className="size-4" />
            </Button>
          </SettingsDialog>
        </div>
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

        <SidebarGroup>
          <SidebarGroupLabel>节点</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NODE_TYPES.map((n) => (
                <SidebarMenuItem key={n.type}>
                  <SidebarMenuButton onClick={() => addNode(n.type)}>
                    <span className={`size-2 shrink-0 rounded-full ${n.dot}`} />
                    <span>{n.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
