import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Home, MoreHorizontal, Plus, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { useFlowStore } from '@/store/useFlowStore'

export function ProjectSidebar() {
  const navigate = useNavigate()
  const projects = useFlowStore((s) => s.projects)
  const activeProjectId = useFlowStore((s) => s.activeProjectId)
  const addProject = useFlowStore((s) => s.addProject)
  const renameProject = useFlowStore((s) => s.renameProject)
  const deleteProject = useFlowStore((s) => s.deleteProject)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')

  const startRename = (id: string, name: string) => {
    setEditingId(id)
    setDraftName(name)
  }

  const commitRename = () => {
    if (editingId) renameProject(editingId, draftName)
    setEditingId(null)
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
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={async () => navigate(`/project/${await addProject()}`)}
                >
                  <Plus className="size-4" />
                  <span>新建项目</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>项目</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {projects.length === 0 && (
                <p className="px-2 py-2 text-xs text-muted-foreground">
                  还没有项目，点上面新建一个。
                </p>
              )}

              {projects.map((p) => {
                if (editingId === p.id) {
                  return (
                    <SidebarMenuItem key={p.id}>
                      <Input
                        autoFocus
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename()
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        className="h-8 text-sm"
                      />
                    </SidebarMenuItem>
                  )
                }
                return (
                  <SidebarMenuItem key={p.id}>
                    <SidebarMenuButton
                      isActive={p.id === activeProjectId}
                      onClick={() => navigate(`/project/${p.id}`)}
                      onDoubleClick={() => startRename(p.id, p.name)}
                    >
                      <span className="truncate">{p.name}</span>
                    </SidebarMenuButton>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuAction showOnHover>
                          <MoreHorizontal className="size-4" />
                        </SidebarMenuAction>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => startRename(p.id, p.name)}>
                          重命名
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => deleteProject(p.id)}
                        >
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
