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
  const agentEndpoint = useSettingsStore((s) => s.agentEndpoint)
  const hasAgentApiKey = useSettingsStore((s) => s.hasAgentApiKey)
  const agentModel = useSettingsStore((s) => s.agentModel)
  const saveSettings = useSettingsStore((s) => s.saveSettings)

  const [open, setOpen] = useState(false)
  const [reqFrom, setReqFrom] = useState('')
  const [aigc, setAigc] = useState('')
  const [upload, setUpload] = useState('')
  const [uploadMedia, setUploadMedia] = useState('')
  const [agentUrl, setAgentUrl] = useState('')
  const [agentKey, setAgentKey] = useState('')
  const [agentModelName, setAgentModelName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleOpenChange = (next: boolean) => {
    if (next) {
      // 打开时用当前设置填充各字段
      setReqFrom(defaultReqFrom)
      setAigc(aigcEndpoint)
      setUpload(uploadEndpoint)
      setUploadMedia(uploadMediaEndpoint)
      setAgentUrl(agentEndpoint)
      setAgentKey('') // 密钥不回显（后端不回明文）；留空=保持已存值
      setAgentModelName(agentModel)
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
        agentEndpoint: agentUrl.trim(),
        // 密钥字段为空 = 用户没改：省略以保持后端已存值（后端合并写只覆盖出现的字段）
        ...(agentKey.trim() ? { agentApiKey: agentKey.trim() } : {}),
        agentModel: agentModelName.trim(),
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
            邮箱前缀（req_from）用于图像 / 视频生成与文件上传。端点留空则使用服务端默认地址。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reqFrom">邮箱前缀</Label>
            <Input
              id="reqFrom"
              value={reqFrom}
              onChange={(e) => setReqFrom(e.target.value)}
              placeholder="请输入邮箱前缀，如 zhaoqianyu或v_zhaoqianyu"
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agentEndpoint">Agent 接口地址（OpenAI 兼容）</Label>
            <Input
              id="agentEndpoint"
              value={agentUrl}
              onChange={(e) => setAgentUrl(e.target.value)}
              placeholder="如 https://api.openai.com/v1（自动补 /chat/completions）"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agentApiKey">Agent API Key</Label>
            <Input
              id="agentApiKey"
              type="password"
              value={agentKey}
              onChange={(e) => setAgentKey(e.target.value)}
              placeholder={hasAgentApiKey ? '已保存（输入新值可更换，留空保持不变）' : '无鉴权网关可留空'}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agentModel">Agent 模型名</Label>
            <Input
              id="agentModel"
              value={agentModelName}
              onChange={(e) => setAgentModelName(e.target.value)}
              placeholder="如 gpt-4o / doubao-seed-1.6"
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
