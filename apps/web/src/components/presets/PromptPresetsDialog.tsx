import { useState } from 'react'
import { Pencil, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { usePromptPresetStore } from '@/store/usePromptPresetStore'

/** 编辑草稿：id 为 null 表示新增，非空表示正在编辑该条。 */
type Draft = { id: string | null; title: string; content: string }
const EMPTY: Draft = { id: null, title: '', content: '' }

/**
 * 「常用 Prompt 预设」管理弹窗：顶部一个新增/编辑表单，下方预设列表（编辑 / 删除）。
 * 预设为全局共享库，供 Prompt 节点下拉一键选用。
 */
export function PromptPresetsDialog({ children }: { children: React.ReactNode }) {
  const presets = usePromptPresetStore((s) => s.presets)
  const addPreset = usePromptPresetStore((s) => s.addPreset)
  const editPreset = usePromptPresetStore((s) => s.editPreset)
  const removePreset = usePromptPresetStore((s) => s.removePreset)

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const resetDraft = () => {
    setDraft(EMPTY)
    setError('')
  }

  const handleOpenChange = (next: boolean) => {
    if (next) resetDraft()
    setOpen(next)
  }

  const handleSave = async () => {
    const title = draft.title.trim()
    if (!title) {
      setError('请填写标题')
      return
    }
    setSaving(true)
    setError('')
    try {
      if (draft.id) await editPreset(draft.id, title, draft.content)
      else await addPreset(title, draft.content)
      resetDraft()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setError('')
    try {
      await removePreset(id)
      if (draft.id === id) resetDraft()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>常用 Prompt 预设</DialogTitle>
          <DialogDescription>
            管理可在 Prompt 节点里一键选用的常用提示词，全局共享、跨项目通用。
          </DialogDescription>
        </DialogHeader>

        {/* 新增 / 编辑表单 */}
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium text-muted-foreground">
              {draft.id ? '编辑预设' : '新增预设'}
            </Label>
            {draft.id && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-xs"
                onClick={resetDraft}
              >
                <X className="size-3" /> 取消编辑
              </Button>
            )}
          </div>
          <Input
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="标题，如「电商主图」"
          />
          <Textarea
            value={draft.content}
            onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
            placeholder="prompt 正文…"
            className="h-24 resize-y text-sm"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button size="sm" onClick={handleSave} disabled={saving} className="self-end">
            {saving ? '保存中…' : draft.id ? '保存修改' : '添加预设'}
          </Button>
        </div>

        {/* 预设列表 */}
        <div className="max-h-64 overflow-y-auto">
          {presets.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              还没有预设，先添加一个吧。
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {presets.map((p) => (
                <li
                  key={p.id}
                  className={`group flex items-start gap-2 rounded-md border p-2 ${
                    draft.id === p.id ? 'border-primary' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.content || '（空内容）'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      title="编辑"
                      onClick={() => {
                        setDraft({ id: p.id, title: p.title, content: p.content })
                        setError('')
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive"
                      title="删除"
                      onClick={() => handleDelete(p.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
