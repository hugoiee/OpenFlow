import { useEffect, useState } from 'react'
import {
  Cable,
  CheckCircle2,
  Download,
  Info,
  Loader2,
  Network,
  PlugZap,
  RefreshCw,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ModelCapabilityBadges } from '@/components/model/ModelCapabilityBadges'
import { testAgentConnectionApi } from '@/lib/api'
import { mergeModelOptions } from '@/lib/nodeCatalog'
import { cn } from '@/lib/utils'
import { useUpdateCheck } from '@/hooks/useUpdateCheck'
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
  const hasVolcTtsApiKey = useSettingsStore((s) => s.hasVolcTtsApiKey)
  const agentModel = useSettingsStore((s) => s.agentModel)
  const agentModelList = useSettingsStore((s) => s.agentModelList)
  const saveSettings = useSettingsStore((s) => s.saveSettings)
  // 动态模型列表（从 Agent 端点 GET /models 获取，与 Any LLM 节点共用同一份）
  const agentModels = useSettingsStore((s) => s.agentModels)
  const agentModelsLoading = useSettingsStore((s) => s.agentModelsLoading)
  const agentModelsLoaded = useSettingsStore((s) => s.agentModelsLoaded)
  const agentModelsError = useSettingsStore((s) => s.agentModelsError)
  const loadAgentModels = useSettingsStore((s) => s.loadAgentModels)

  const [open, setOpen] = useState(false)
  const [section, setSection] = useState<SectionId>('general')
  const [reqFrom, setReqFrom] = useState('')
  const [aigc, setAigc] = useState('')
  const [upload, setUpload] = useState('')
  const [uploadMedia, setUploadMedia] = useState('')
  const [agentUrl, setAgentUrl] = useState('')
  const [agentKey, setAgentKey] = useState('')
  const [volcKey, setVolcKey] = useState('')
  const [agentModelName, setAgentModelName] = useState('')
  // 手动模型列表草稿（每行一个）：进入下拉候选并在保存时持久化
  const [modelListText, setModelListText] = useState('')
  const [saving, setSaving] = useState(false)
  // 检查更新（仅桌面端；Web 版 supported=false，整块不渲染）
  const update = useUpdateCheck()
  const [error, setError] = useState('')
  // 连接测试：testing 进行中；testResult 为最近一次结果（改动配置输入即清空以免误导）
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

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
      setVolcKey('') // 同上：火山语音 Key 也是写入-only
      setAgentModelName(agentModel)
      setModelListText(agentModelList.join('\n'))
      setError('')
      setTestResult(null)
    }
    setOpen(next)
  }

  // 用表单当前值发最小用量探测；apiKey 留空则后端回退已存密钥
  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const r = await testAgentConnectionApi({
        endpoint: agentUrl.trim(),
        apiKey: agentKey.trim() || undefined,
        model: agentModelName.trim(),
      })
      setTestResult({ ok: true, message: `连接成功 · 模型 ${r.model} · ${r.latencyMs}ms` })
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : String(e) })
    } finally {
      setTesting(false)
    }
  }

  // 用表单当前 endpoint/key 拉取端点可用模型（fetch-before-save：不必先保存即可获取）
  const handleFetchModels = () => {
    void loadAgentModels({ endpoint: agentUrl.trim(), apiKey: agentKey.trim() || undefined })
  }

  // 进入「API 接入」分区且已填端点、尚未获取过时，自动拉一次模型列表；
  // 编辑 endpoint/key 后由「获取模型列表」按钮手动重取（故不把表单值放进依赖，避免逐字重拉）。
  useEffect(() => {
    if (open && section === 'api' && agentUrl.trim() && !agentModelsLoaded && !agentModelsLoading) {
      handleFetchModels()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, section])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const modelList = modelListText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
      await saveSettings({
        defaultReqFrom: reqFrom.trim(),
        aigcEndpoint: aigc.trim(),
        uploadEndpoint: upload.trim(),
        uploadMediaEndpoint: uploadMedia.trim(),
        agentEndpoint: agentUrl.trim(),
        // 密钥字段为空 = 用户没改：省略以保持后端已存值（后端合并写只覆盖出现的字段）
        ...(agentKey.trim() ? { agentApiKey: agentKey.trim() } : {}),
        ...(volcKey.trim() ? { volcTtsApiKey: volcKey.trim() } : {}),
        agentModel: agentModelName.trim(),
        agentModelList: modelList,
      })
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const active = SECTIONS.find((s) => s.id === section)!
  // 手动列表草稿（每行一个）→ 与动态获取结果取并集作下拉候选（当前已选值置顶保留）
  const draftModels = modelListText
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  const modelOptions = mergeModelOptions(draftModels, agentModels, agentModelName)
  const hasModels = modelOptions.length > 0

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
                      onChange={(e) => {
                        setAgentUrl(e.target.value)
                        setTestResult(null)
                      }}
                      placeholder="如 https://api.openai.com/v1（自动补 /chat/completions）"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="agentApiKey">Agent API Key</Label>
                    <Input
                      id="agentApiKey"
                      type="password"
                      value={agentKey}
                      onChange={(e) => {
                        setAgentKey(e.target.value)
                        setTestResult(null)
                      }}
                      placeholder={
                        hasAgentApiKey ? '已保存（输入新值可更换，留空保持不变）' : '无鉴权网关可留空'
                      }
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="agentModel">Agent 模型名</Label>
                      <button
                        type="button"
                        onClick={handleFetchModels}
                        disabled={agentModelsLoading || !agentUrl.trim()}
                        title={
                          agentUrl.trim()
                            ? '从端点 GET /models 获取可用模型'
                            : '请先填写 Agent 接口地址'
                        }
                        className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                      >
                        {agentModelsLoading ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="size-3.5" />
                        )}
                        获取模型列表
                      </button>
                    </div>
                    <Select
                      value={agentModelName}
                      onValueChange={(v) => {
                        setAgentModelName(v)
                        setTestResult(null)
                      }}
                    >
                      <SelectTrigger id="agentModel" className="w-full">
                        <SelectValue
                          placeholder={
                            hasModels ? '选择模型' : '先在下方「模型列表」添加或点「获取模型列表」'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {modelOptions.map((m) => (
                          <SelectItem key={m} value={m}>
                            <span className="flex items-center gap-2">
                              {m}
                              <ModelCapabilityBadges model={m} />
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {agentModelsError && (
                      <p className="text-xs text-muted-foreground">
                        未能获取模型列表（可在下方手动维护）：{agentModelsError}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="agentModelList">模型列表（手动维护，每行一个）</Label>
                    <Textarea
                      id="agentModelList"
                      value={modelListText}
                      onChange={(e) => setModelListText(e.target.value)}
                      placeholder={'每行一个模型名，如\ngpt-4o\nqwen2.5-72b'}
                      rows={4}
                      className="text-sm"
                    />
                    <span className="text-xs text-muted-foreground">
                      上面的下拉从这份列表 + 端点获取到的模型中选；不支持 /models
                      的网关可在此手填多个。
                    </span>
                  </div>

                  {/* 最小用量连接测试：发一条 max_tokens:1 的探测请求验证接口/密钥/模型可用 */}
                  <div className="mt-1 flex flex-col gap-2 border-t pt-3">
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleTest}
                        disabled={testing}
                      >
                        {testing ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <PlugZap className="size-4" />
                        )}
                        {testing ? '测试中…' : '测试连接'}
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        发一条最小请求验证接口 / 密钥 / 模型可用
                      </span>
                    </div>
                    {testResult && (
                      <p
                        className={cn(
                          'flex items-start gap-1.5 text-xs',
                          testResult.ok
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-destructive',
                        )}
                      >
                        {testResult.ok ? (
                          <CheckCircle2 className="mt-px size-3.5 shrink-0" />
                        ) : (
                          <XCircle className="mt-px size-3.5 shrink-0" />
                        )}
                        <span className="break-all">{testResult.message}</span>
                      </p>
                    )}
                  </div>

                  {/* 火山语音（播客 TTS）：独立于 Agent 的鉴权体系，写入-only 同 Agent Key */}
                  <div className="mt-1 flex flex-col gap-1.5 border-t pt-3">
                    <Label htmlFor="volcTtsApiKey">火山语音 API Key（播客 TTS 节点用）</Label>
                    <Input
                      id="volcTtsApiKey"
                      type="password"
                      value={volcKey}
                      onChange={(e) => setVolcKey(e.target.value)}
                      placeholder={
                        hasVolcTtsApiKey
                          ? '已保存（输入新值可更换，留空保持不变）'
                          : '火山控制台 > API Key 管理 获取'
                      }
                    />
                    <span className="text-xs text-muted-foreground">
                      用于「播客 TTS（火山）」节点调豆包语音合成 2.0；音色 ID 在节点右侧面板填写。
                    </span>
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

        {/* 关于 / 检查更新：仅桌面端显示（Web 版没有安装包的概念） */}
        {update.supported && (
          <div className="border-t px-6 py-4">
            <div className="flex items-center gap-2 pb-2 text-sm font-medium">
              <Info className="size-4 text-muted-foreground" />
              关于
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">当前版本 v{update.current}</span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={update.check}
                disabled={update.checking}
              >
                <RefreshCw className={`size-3.5 ${update.checking ? 'animate-spin' : ''}`} />
                {update.checking ? '检查中…' : '检查更新'}
              </Button>
              {update.hasUpdate ? (
                <a
                  href={update.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
                >
                  <Download className="size-3.5" />
                  有新版本 v{update.latest}，去下载
                </a>
              ) : update.checked && !update.error ? (
                <span className="text-xs text-muted-foreground">已是最新版本</span>
              ) : null}
            </div>
            {/* 检查失败只在手动检查后小字提示，不弹窗、不阻塞 */}
            {update.checked && update.error && (
              <p className="pt-1.5 text-[11px] text-muted-foreground">
                检查更新失败：{update.error}
              </p>
            )}
          </div>
        )}

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
