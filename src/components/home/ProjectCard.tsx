import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useFlowStore } from '@/store/useFlowStore'
import type { Project } from '@/lib/types'

type ProjectCardProps = {
  project: Project
  view: 'grid' | 'list'
}

export function ProjectCard({ project, view }: ProjectCardProps) {
  const navigate = useNavigate()
  const renameProject = useFlowStore((s) => s.renameProject)
  const deleteProject = useFlowStore((s) => s.deleteProject)

  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(project.name)

  const open = () => navigate(`/project/${project.id}`)

  const startRename = () => {
    setDraftName(project.name)
    setEditing(true)
  }

  const commitRename = () => {
    renameProject(project.id, draftName)
    setEditing(false)
  }

  const nameField = editing ? (
    <Input
      autoFocus
      value={draftName}
      onChange={(e) => setDraftName(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={commitRename}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') commitRename()
        if (e.key === 'Escape') setEditing(false)
      }}
      className="h-8 text-sm"
    />
  ) : null

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          ⋯
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={startRename}>重命名</DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onClick={() => deleteProject(project.id)}
        >
          删除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  if (view === 'list') {
    return (
      <div
        className="group flex cursor-pointer items-center gap-2 rounded-md border bg-card px-3 py-2.5 text-sm hover:bg-accent/50"
        onClick={open}
      >
        {editing ? (
          <div className="flex-1">{nameField}</div>
        ) : (
          <span
            className="flex-1 truncate font-medium"
            onDoubleClick={(e) => {
              e.stopPropagation()
              startRename()
            }}
          >
            {project.name}
          </span>
        )}
        {menu}
      </div>
    )
  }

  return (
    <Card
      className="group relative flex h-28 cursor-pointer items-center justify-center p-4 text-center transition-colors hover:bg-accent/50"
      onClick={open}
    >
      <div className="absolute right-2 top-2">{menu}</div>
      {editing ? (
        <div className="w-full px-2">{nameField}</div>
      ) : (
        <span
          className="line-clamp-3 px-4 font-medium"
          onDoubleClick={(e) => {
            e.stopPropagation()
            startRename()
          }}
        >
          {project.name}
        </span>
      )}
    </Card>
  )
}
