import { useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { BookmarkPlus, Library, Type } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { NodeHeader } from './NodeHeader'
import { useFlowStore } from '@/store/useFlowStore'
import { usePromptPresetStore } from '@/store/usePromptPresetStore'
import type { PromptNode as PromptNodeType } from '@/lib/types'

/** 从 prompt 正文派生一个默认标题：取首个非空行，截断到 24 字。 */
function defaultTitle(text: string): string {
  const line = text.split('\n').map((s) => s.trim()).find(Boolean) ?? ''
  return line.length > 24 ? `${line.slice(0, 24)}…` : line
}

export function PromptNode({ id, data, selected }: NodeProps<PromptNodeType>) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const presets = usePromptPresetStore((s) => s.presets)
  const addPreset = usePromptPresetStore((s) => s.addPreset)

  // 选用预设弹窗（不用 DropdownMenu：其 pointerdown 会被 React Flow 节点拖拽逻辑吞掉，弹不出来）
  const [pickOpen, setPickOpen] = useState(false)

  // 「存为预设」弹窗状态
  const [saveOpen, setSaveOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const hasText = data.text.trim().length > 0

  const applyPreset = (content: string) => {
    updateNodeData(id, { text: content })
    setPickOpen(false)
  }

  const openSave = () => {
    setTitle(defaultTitle(data.text))
    setError('')
    setSaveOpen(true)
  }

  const handleSave = async () => {
    const t = title.trim()
    if (!t) {
      setError('请填写标题')
      return
    }
    setSaving(true)
    setError('')
    try {
      await addPreset(t, data.text)
      setSaveOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card
      className={`group/node inline-flex w-auto flex-col gap-2 py-3 shadow-sm transition-shadow ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
    >
      <NodeHeader id={id} icon={Type} title={data.label} selected={selected} />
      <CardContent className="flex flex-col gap-2 px-3">
        <Textarea
          value={data.text}
          onChange={(e) => updateNodeData(id, { text: e.target.value })}
          placeholder="在这里写 prompt…"
          className="nodrag field-sizing-fixed h-24 min-h-24 w-56 min-w-56 resize overflow-hidden text-sm"
        />

        {/* 预设工具条：选用预设 / 存为预设 */}
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="nodrag h-7 flex-1 justify-start gap-1.5 px-2 text-xs"
            title="选用一个常用 Prompt 预设（替换当前内容）"
            onClick={() => setPickOpen(true)}
          >
            <Library className="size-3.5 opacity-70" />
            选用预设
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="nodrag h-7 shrink-0 gap-1 px-2 text-xs"
            title="把当前内容存为常用预设"
            disabled={!hasText}
            onClick={openSave}
          >
            <BookmarkPlus className="size-3.5" />
            存为预设
          </Button>
        </div>
      </CardContent>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-sky-500 dark:!bg-sky-400"
      />

      {/* 选用预设：从全局预设库挑一条，内容替换当前节点文本 */}
      <Dialog open={pickOpen} onOpenChange={setPickOpen}>
        <DialogContent className="nodrag sm:max-w-md">
          <DialogHeader>
            <DialogTitle>选用常用 Prompt 预设</DialogTitle>
            <DialogDescription>选择一个预设，其内容将替换当前节点的文本。</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto">
            {presets.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                还没有预设，点右侧「存为预设」或到「预设」库添加。
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {presets.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => applyPreset(p.content)}
                      className="w-full rounded-md border p-2 text-left transition-colors hover:border-primary hover:bg-accent"
                    >
                      <p className="truncate text-sm font-medium">{p.title}</p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {p.content || '（空内容）'}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 存为预设：填标题 */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="nodrag sm:max-w-md">
          <DialogHeader>
            <DialogTitle>存为常用 Prompt 预设</DialogTitle>
            <DialogDescription>
              把当前节点的内容存进全局预设库，之后可在任意 Prompt 节点里一键选用。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-1">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`preset-title-${id}`}>标题</Label>
              <Input
                id={`preset-title-${id}`}
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="标题，如「电商主图」"
              />
            </div>
            <div className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
              {data.text}
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
