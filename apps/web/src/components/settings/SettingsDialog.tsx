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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fetchModelsApi } from '@/lib/api'
import { PROVIDER_PRESETS, type ProviderId } from '@/lib/types'
import { useSettingsStore } from '@/store/useSettingsStore'

function presetBaseURL(id: ProviderId): string {
  return PROVIDER_PRESETS.find((p) => p.id === id)?.defaultBaseURL ?? ''
}

export function SettingsDialog({ children }: { children: React.ReactNode }) {
  const activeProviderId = useSettingsStore((s) => s.activeProviderId)
  const configs = useSettingsStore((s) => s.configs)
  const defaultReqFrom = useSettingsStore((s) => s.defaultReqFrom)
  const saveProvider = useSettingsStore((s) => s.saveProvider)

  const [open, setOpen] = useState(false)
  // 当前正在编辑的供应商及其草稿
  const [editingId, setEditingId] = useState<ProviderId>(activeProviderId)
  const [apiKey, setApiKey] = useState('') // 仅写入：留空表示不修改已存 key
  const [hasKey, setHasKey] = useState(false)
  const [baseURL, setBaseURL] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [models, setModels] = useState<string[]>([])
  // 全局调用方署名（req_from），与具体供应商无关
  const [reqFrom, setReqFrom] = useState('')
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // 把某供应商已存配置载入草稿（不含 key，只知道 hasKey）；无配置则用预置默认 BaseURL
  const loadProvider = (id: ProviderId) => {
    const config = configs[id]
    setEditingId(id)
    setApiKey('')
    setHasKey(Boolean(config?.hasKey))
    setBaseURL(config?.baseURL || presetBaseURL(id))
    setSelectedModel(config?.selectedModel ?? '')
    setModels(config?.models ?? [])
    setError('')
  }

  const handleOpenChange = (next: boolean) => {
    if (next) {
      loadProvider(activeProviderId)
      setReqFrom(defaultReqFrom)
    }
    setOpen(next)
  }

  const handleFetchModels = async () => {
    setFetching(true)
    setError('')
    try {
      const list = await fetchModelsApi({
        providerId: editingId,
        baseURL,
        apiKey: apiKey.trim() || undefined,
      })
      setModels(list)
      // 已选模型不在新列表里时，默认选第一个
      if (!list.includes(selectedModel)) setSelectedModel(list[0] ?? '')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setFetching(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await saveProvider({
        providerId: editingId,
        apiKey: apiKey.trim() || undefined,
        baseURL: baseURL.trim(),
        selectedModel,
        models,
        defaultReqFrom: reqFrom.trim(),
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
          <DialogTitle>模型供应商设置</DialogTitle>
          <DialogDescription>
            选择供应商，填入 API Key 与 BaseURL，拉取并选定模型。Key 只存后端，不会回传浏览器。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label>供应商</Label>
            <Select value={editingId} onValueChange={(v) => loadProvider(v as ProviderId)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {configs[p.id]?.hasKey ? ' ✓' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasKey ? '已保存（留空则不修改）' : 'sk-…'}
            />
          </div>

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
            <div className="flex items-center justify-between">
              <Label htmlFor="model">模型</Label>
              <Button
                size="sm"
                variant="outline"
                onClick={handleFetchModels}
                disabled={fetching || !baseURL.trim() || (!apiKey.trim() && !hasKey)}
              >
                {fetching ? '获取中…' : '获取模型'}
              </Button>
            </div>
            <Select
              value={selectedModel}
              onValueChange={setSelectedModel}
              disabled={models.length === 0}
            >
              <SelectTrigger id="model" className="w-full">
                <SelectValue placeholder="先获取模型列表" />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <div className="flex flex-col gap-1.5 border-t pt-4">
            <Label htmlFor="reqFrom">req_from（全局署名）</Label>
            <Input
              id="reqFrom"
              value={reqFrom}
              onChange={(e) => setReqFrom(e.target.value)}
              placeholder="改自己名字哦，不要冒用他/她人。"
            />
            <p className="text-xs text-muted-foreground">
              图像 / 视频生成与图片上传统一使用此署名；留空则后端用默认值。
            </p>
          </div>
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
