import { Link, useNavigate } from 'react-router-dom'
import {
  Home,
  Settings,
  LogOut,
  Type,
  Image as ImageIcon,
  Banana,
  Video,
  type LucideIcon,
} from 'lucide-react'
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
import { useSettingsStore } from '@/store/useSettingsStore'

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
  const defaultReqFrom = useSettingsStore((s) => s.defaultReqFrom)
  const saveReqFrom = useSettingsStore((s) => s.saveReqFrom)

  // 退出：清空 req_from → ReqFromGate 会重新全屏阻断；同时回到起始页
  const handleLogout = async () => {
    try {
      await saveReqFrom('')
      navigate('/')
    } catch (e) {
      console.error('[openflow] 退出失败', e)
    }
  }

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
        {defaultReqFrom && (
          <div className="mt-1 flex items-center gap-1">
            <SettingsDialog>
              <button
                type="button"
                title="邮箱前缀（req_from）· 点击修改"
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent"
              >
                <span className="shrink-0">邮箱前缀</span>
                <span className="truncate font-medium text-sidebar-foreground">
                  {defaultReqFrom}
                </span>
              </button>
            </SettingsDialog>
            <Button
              size="icon"
              variant="ghost"
              className="size-6 shrink-0 text-muted-foreground"
              title="退出（清空邮箱前缀）"
              onClick={handleLogout}
            >
              <LogOut className="size-3.5" />
            </Button>
          </div>
        )}
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
                      draggable
                      onDragStart={(e) => {
                        // 拖拽建节点：把类型/模型塞进 dataTransfer，画布 onDrop 读取
                        e.dataTransfer.setData(
                          'application/openflow-node',
                          JSON.stringify({ type: item.type, model: item.model }),
                        )
                        e.dataTransfer.effectAllowed = 'copy'
                      }}
                      onClick={() => addNode(item.type, item.model)}
                      title={`拖入画布或点按添加 ${item.label}`}
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
