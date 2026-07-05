import { useState } from 'react'
import { Cable, Network, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/store/useSettingsStore'

type SectionId = 'general' | 'api' | 'network'

const SECTIONS: {
  id: SectionId
  label: string
  icon: typeof SlidersHorizontal
  desc: string
}[] = [
  {
    id: 'general',
    label: '常规',
    icon: SlidersHorizontal,
    desc: '邮箱前缀（req_from）用于图像 / 视频生成与文件上传的调用方署名。',
  },
  {
    id: 'api',
    label: 'API 接入',
    icon: Cable,
    desc: '画布 Agent 与 Any LLM 节点共用的 OpenAI 兼容接口配置。',
  },
  {
    id: 'network',
    label: '内网地址',
    icon: Network,
    desc: '生成与上传的服务端点，留空则使用服务端默认地址。',
  },
]

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
  const [section, setSection] = useState<SectionId>('general')
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
      setSection('general')
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

  const active = SECTIONS.find((s) => s.id === section)!

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>设置</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-[360px]">
          {/* 左侧导航 */}
          <nav className="flex w-44 shrink-0 flex-col gap-1 border-r bg-muted/30 p-3">
            {SECTIONS.map((s) => {
              const Icon = s.icon
              const activeItem = s.id === section
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSection(s.id)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors',
                    activeItem
                      ? 'bg-background font-medium text-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {s.label}
                </button>
              )
            })}
          </nav>

          {/* 右侧内容 */}
          <div className="flex-1 px-6 py-5">
            <p className="mb-5 text-sm text-muted-foreground">{active.desc}</p>

            <div className="flex flex-col gap-4">
              {section === 'general' && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="reqFrom">邮箱前缀</Label>
                  <Input
                    id="reqFrom"
                    value={reqFrom}
                    onChange={(e) => setReqFrom(e.target.value)}
                    placeholder="请输入邮箱前缀，如 zhaoqianyu或v_zhaoqianyu"
                  />
                </div>
              )}

              {section === 'api' && (
                <>
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
                      placeholder={
                        hasAgentApiKey ? '已保存（输入新值可更换，留空保持不变）' : '无鉴权网关可留空'
                      }
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
                </>
              )}

              {section === 'network' && (
                <>
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
                </>
              )}
            </div>
          </div>
        </div>

        {error && <p className="px-6 text-xs text-destructive">{error}</p>}

        <DialogFooter className="mx-0 mb-0 rounded-b-xl border-t px-6 py-4">
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
