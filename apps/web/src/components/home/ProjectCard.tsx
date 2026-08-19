import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pin, Table2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
  const setProjectPinned = useFlowStore((s) => s.setProjectPinned)
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
        if (e.nativeEvent.isComposing) return // 输入法组词中，别把选字的回车/Esc 当作提交/取消
        if (e.key === 'Enter') commitRename()
        if (e.key === 'Escape') setEditing(false)
      }}
      className="h-8 text-sm"
    />
  ) : null

  // 评估项目才标类型图标（画布项目是默认形态，不加图标少点噪音）
  const typeIcon =
    project.type === 'evaluation' ? (
      <Table2 className="size-3.5 shrink-0 text-muted-foreground" aria-label="评估项目" />
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
        <DropdownMenuItem onClick={() => setProjectPinned(project.id, !project.pinned)}>
          {project.pinned ? '取消置顶' : '置顶'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={startRename}>重命名</DropdownMenuItem>
        <DropdownMenuSeparator />
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
        {project.pinned && !editing && (
          <Pin className="size-3.5 shrink-0 text-muted-foreground" aria-label="已置顶" />
        )}
        {!editing && typeIcon}
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
      {/* 置顶标与类型标同排左上角：分别绝对定位会叠在一起 */}
      {(project.pinned || typeIcon) && (
        <div className="absolute top-2 left-2 flex items-center gap-1">
          {project.pinned && (
            <Pin className="size-3.5 text-muted-foreground" aria-label="已置顶" />
          )}
          {typeIcon}
        </div>
      )}
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
