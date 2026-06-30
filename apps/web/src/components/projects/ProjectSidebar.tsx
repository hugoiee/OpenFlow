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
import { IMAGE_MODELS, VIDEO_MODELS } from '@/lib/nodeCatalog'
import { type FlowNodeType } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'

type NodeItem = { type: FlowNodeType; label: string; dot: string; model?: string }

// 节点列表按输出形态分三类：文本 / 图像 / 视频。
// 图像、视频项各对应一个具名预置模型，点按即添加对应节点并预设该模型。
const NODE_GROUPS: { label: string; items: NodeItem[] }[] = [
  { label: '文本', items: [{ type: 'prompt', label: 'Prompt 节点', dot: 'bg-sky-500' }] },
  {
    label: '图像',
    items: IMAGE_MODELS.map((m) => ({ type: 'image', label: m, dot: 'bg-amber-500', model: m })),
  },
  {
    label: '视频',
    items: VIDEO_MODELS.map((m) => ({ type: 'video', label: m, dot: 'bg-rose-500', model: m })),
  },
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

        {NODE_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton onClick={() => addNode(item.type, item.model)}>
                      <span className={`size-2 shrink-0 rounded-full ${item.dot}`} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  )
}
