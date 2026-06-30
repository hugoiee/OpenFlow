import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSettingsStore } from '@/store/useSettingsStore'

export function SettingsDialog({ children }: { children: React.ReactNode }) {
  const defaultReqFrom = useSettingsStore((s) => s.defaultReqFrom)
  const saveReqFrom = useSettingsStore((s) => s.saveReqFrom)

  const [open, setOpen] = useState(false)
  const [reqFrom, setReqFrom] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setReqFrom(defaultReqFrom)
      setError('')
    }
    setOpen(next)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await saveReqFrom(reqFrom.trim())
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>
            填写调用方署名 req_from，图像 / 视频生成与图片上传统一使用此署名。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5 py-2">
          <Label htmlFor="reqFrom">req_from（署名）</Label>
          <Input
            id="reqFrom"
            value={reqFrom}
            onChange={(e) => setReqFrom(e.target.value)}
            placeholder="改自己名字哦，不要冒用他/她人。"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
