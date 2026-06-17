import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useFlowStore } from '@/store/useFlowStore'

export function ProjectSidebar() {
  const projects = useFlowStore((s) => s.projects)
  const activeProjectId = useFlowStore((s) => s.activeProjectId)
  const addProject = useFlowStore((s) => s.addProject)
  const renameProject = useFlowStore((s) => s.renameProject)
  const deleteProject = useFlowStore((s) => s.deleteProject)
  const setActiveProject = useFlowStore((s) => s.setActiveProject)

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
    <aside className="flex h-full w-60 shrink-0 flex-col border-r bg-sidebar">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-lg font-semibold">OpenFlow</span>
      </div>

      <div className="px-3 pb-2">
        <Button size="sm" className="w-full" onClick={() => addProject()}>
          + 新建项目
        </Button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-1">
        {projects.length === 0 && (
          <p className="px-1 py-4 text-center text-xs text-muted-foreground">
            还没有项目，点上面新建一个。
          </p>
        )}

        {projects.map((p) => {
          const active = p.id === activeProjectId
          if (editingId === p.id) {
            return (
              <Input
                key={p.id}
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
            )
          }
          return (
            <div
              key={p.id}
              className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm ${
                active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
              }`}
            >
              <button
                type="button"
                className="flex-1 truncate text-left"
                onClick={() => setActiveProject(p.id)}
                onDoubleClick={() => startRename(p.id, p.name)}
              >
                {p.name}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-6 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                  >
                    ⋯
                  </Button>
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
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
