import { Link, useNavigate } from 'react-router-dom'
import { Home, Settings, Type, Image as ImageIcon, Banana, Video, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { IMAGE_MODELS, VIDEO_MODELS } from '@/lib/nodeCatalog'
import { type FlowNodeType } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'

type NodeItem = { type: FlowNodeType; label: string; icon: LucideIcon; model?: string }

// 各图像模型的图标（缺省回退到通用图像图标）。
const IMAGE_ICONS: Record<string, LucideIcon> = {
  'Image 2': ImageIcon,
  'Nano Banana': Banana,
}

// 节点列表按输出形态分三类：文本 / 图像 / 视频。
// 图像、视频项各对应一个具名预置模型，点按即添加对应节点并预设该模型。
const NODE_GROUPS: { label: string; subtitle: string; items: NodeItem[] }[] = [
  {
    label: '文本',
    subtitle: '编写 Prompt 提示词',
    items: [{ type: 'prompt', label: 'Prompt 节点', icon: Type }],
  },
  {
    label: '图像模型',
    subtitle: '从文本生成图像',
    items: IMAGE_MODELS.map((m) => ({
      type: 'image' as const,
      label: m,
      icon: IMAGE_ICONS[m] ?? ImageIcon,
      model: m,
    })),
  },
  {
    label: '视频模型',
    subtitle: '从文本 / 图像生成视频',
    items: VIDEO_MODELS.map((m) => ({ type: 'video' as const, label: m, icon: Video, model: m })),
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
            <div className="px-2 pb-2">
              <h3 className="text-base font-semibold leading-tight">{group.label}</h3>
              <p className="text-xs text-muted-foreground">{group.subtitle}</p>
            </div>
            <SidebarGroupContent>
              <div className="grid grid-cols-2 gap-2 px-1">
                {group.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => addNode(item.type, item.model)}
                      title={`添加 ${item.label}`}
                      className="group flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl border border-sidebar-border bg-sidebar-accent/40 px-2 text-center transition-colors hover:border-sidebar-ring hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
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
