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
  const aigcEndpoint = useSettingsStore((s) => s.aigcEndpoint)
  const uploadEndpoint = useSettingsStore((s) => s.uploadEndpoint)
  const uploadMediaEndpoint = useSettingsStore((s) => s.uploadMediaEndpoint)
  const saveSettings = useSettingsStore((s) => s.saveSettings)

  const [open, setOpen] = useState(false)
  const [reqFrom, setReqFrom] = useState('')
  const [aigc, setAigc] = useState('')
  const [upload, setUpload] = useState('')
  const [uploadMedia, setUploadMedia] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleOpenChange = (next: boolean) => {
    if (next) {
      // 打开时用当前设置填充各字段
      setReqFrom(defaultReqFrom)
      setAigc(aigcEndpoint)
      setUpload(uploadEndpoint)
      setUploadMedia(uploadMediaEndpoint)
      setError('')
    }
    setOpen(next)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await saveSettings({
        defaultReqFrom: reqFrom.trim(),
        aigcEndpoint: aigc.trim(),
        uploadEndpoint: upload.trim(),
        uploadMediaEndpoint: uploadMedia.trim(),
      })
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
            调用方署名 req_from 用于图像 / 视频生成与文件上传。端点留空则使用服务端默认地址。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reqFrom">req_from（署名）</Label>
            <Input
              id="reqFrom"
              value={reqFrom}
              onChange={(e) => setReqFrom(e.target.value)}
              placeholder="改自己名字哦，不要冒用他/她人。"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="aigcEndpoint">AIGC 生成端点（图像 / 视频）</Label>
            <Input
              id="aigcEndpoint"
              value={aigc}
              onChange={(e) => setAigc(e.target.value)}
              placeholder="留空用默认，如 http://host:port/aigc"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="uploadEndpoint">图片上传端点</Label>
            <Input
              id="uploadEndpoint"
              value={upload}
              onChange={(e) => setUpload(e.target.value)}
              placeholder="留空用默认，如 http://host:port/api/upload"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="uploadMediaEndpoint">音频上传端点</Label>
            <Input
              id="uploadMediaEndpoint"
              value={uploadMedia}
              onChange={(e) => setUploadMedia(e.target.value)}
              placeholder="留空用默认，如 http://host:port/api/upload-media"
            />
          </div>

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
