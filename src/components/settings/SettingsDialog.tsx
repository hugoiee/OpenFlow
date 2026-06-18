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
import { MODEL_OPTIONS } from '@/lib/types'
import { useSettingsStore } from '@/store/useSettingsStore'

export function SettingsDialog({ children }: { children: React.ReactNode }) {
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.updateSettings)

  const [open, setOpen] = useState(false)
  const [baseURL, setBaseURL] = useState(settings.baseURL)
  const [apiKey, setApiKey] = useState(settings.apiKey)
  const [defaultModel, setDefaultModel] = useState(settings.defaultModel)

  // 打开/关闭弹窗时用当前已保存的值回填草稿，避免编辑后取消又残留草稿
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setBaseURL(settings.baseURL)
      setApiKey(settings.apiKey)
      setDefaultModel(settings.defaultModel)
    }
    setOpen(next)
  }

  const handleSave = () => {
    updateSettings({
      baseURL: baseURL.trim(),
      apiKey: apiKey.trim(),
      defaultModel: defaultModel.trim() || MODEL_OPTIONS[0],
    })
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>API 设置</DialogTitle>
          <DialogDescription>
            配置 OpenAI 兼容的第三方中转 API。留空则 Model 节点使用 mock 占位结果。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="baseURL">Base URL</Label>
            <Input
              id="baseURL"
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              placeholder="https://api.example.com/v1"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-…"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="defaultModel">默认模型</Label>
            <Input
              id="defaultModel"
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              list="settings-model-options"
              placeholder="gpt-4o-mini"
            />
            <datalist id="settings-model-options">
              {MODEL_OPTIONS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button onClick={handleSave}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
