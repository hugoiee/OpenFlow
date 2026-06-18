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
import { fetchModels } from '@/lib/openai'
import { PROVIDER_PRESETS, type ProviderId } from '@/lib/types'
import { emptyProviderConfig, useSettingsStore } from '@/store/useSettingsStore'

function presetBaseURL(id: ProviderId): string {
  return PROVIDER_PRESETS.find((p) => p.id === id)?.defaultBaseURL ?? ''
}

export function SettingsDialog({ children }: { children: React.ReactNode }) {
  const activeProviderId = useSettingsStore((s) => s.activeProviderId)
  const configs = useSettingsStore((s) => s.configs)
  const setActiveProvider = useSettingsStore((s) => s.setActiveProvider)
  const updateProviderConfig = useSettingsStore((s) => s.updateProviderConfig)

  const [open, setOpen] = useState(false)
  // 当前正在编辑的供应商及其草稿
  const [editingId, setEditingId] = useState<ProviderId>(activeProviderId)
  const [apiKey, setApiKey] = useState('')
  const [baseURL, setBaseURL] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState('')

  // 把某供应商已存配置载入草稿；无配置则用预置默认 BaseURL
  const loadProvider = (id: ProviderId) => {
    const config = configs[id] ?? { ...emptyProviderConfig(), baseURL: presetBaseURL(id) }
    setEditingId(id)
    setApiKey(config.apiKey)
    setBaseURL(config.baseURL || presetBaseURL(id))
    setSelectedModel(config.selectedModel)
    setModels(config.models)
    setFetchError('')
  }

  const handleOpenChange = (next: boolean) => {
    if (next) loadProvider(activeProviderId)
    setOpen(next)
  }

  const handleFetchModels = async () => {
    setFetching(true)
    setFetchError('')
    try {
      const list = await fetchModels({ baseURL, apiKey })
      setModels(list)
      // 已选模型不在新列表里时，默认选第一个
      if (!list.includes(selectedModel)) setSelectedModel(list[0] ?? '')
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : String(e))
    } finally {
      setFetching(false)
    }
  }

  const handleSave = () => {
    updateProviderConfig(editingId, {
      apiKey: apiKey.trim(),
      baseURL: baseURL.trim(),
      selectedModel,
      models,
    })
    setActiveProvider(editingId)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>模型供应商设置</DialogTitle>
          <DialogDescription>
            选择供应商，填入 API Key 与 BaseURL，拉取并选定要使用的模型。保存后该供应商即为激活供应商。
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
                    {configs[p.id]?.apiKey ? ' ✓' : ''}
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
              placeholder="sk-…"
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
                disabled={fetching || !baseURL.trim() || !apiKey.trim()}
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
            {fetchError && <p className="text-xs text-destructive">{fetchError}</p>}
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
