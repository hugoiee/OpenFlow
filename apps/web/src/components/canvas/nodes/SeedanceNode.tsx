import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { generateVideoApi, uploadImagesApi } from '@/lib/api'
import {
  GEN_NODE_META,
  SEEDANCE_DURATION_DEFAULT,
  SEEDANCE_DURATION_OPTIONS,
  SEEDANCE_MODE_DEFAULT,
  SEEDANCE_MODE_OPTIONS,
  SEEDANCE_RESOLUTION_DEFAULT,
  SEEDANCE_RESOLUTION_OPTIONS,
  SEEDANCE_VERSION_DEFAULT,
  SEEDANCE_VERSION_OPTIONS,
  videoApiModel,
} from '@/lib/nodeCatalog'
import { type VideoNode as VideoNodeType } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'

const meta = GEN_NODE_META.video

/** 收集所有指向该节点的上游 prompt 节点文本，拼成生成指令。 */
function collectUpstreamPrompt(nodeId: string): string {
  const state = useFlowStore.getState()
  const project = state.projects.find((p) => p.id === state.activeProjectId)
  if (!project) return ''
  const sourceIds = project.edges.filter((e) => e.target === nodeId).map((e) => e.source)
  return project.nodes
    .filter((n) => n.type === 'prompt' && sourceIds.includes(n.id))
    .map((n) => (n.type === 'prompt' ? n.data.text : ''))
    .filter(Boolean)
    .join('\n\n')
}

/** Seedance 视频生成节点：上游 Prompt + 输入图 → 经后端 /api/video 代理生成视频。 */
export function SeedanceNode({ id, data, selected }: NodeProps<VideoNodeType>) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  // 兼容旧 video 节点（早期只有 {label, model}）：缺失字段给默认值
  const reqFrom = data.reqFrom ?? ''
  const imagesText = data.imagesText ?? ''
  const version = data.version ?? SEEDANCE_VERSION_DEFAULT
  const mode = data.mode ?? SEEDANCE_MODE_DEFAULT
  const resolution = data.resolution ?? SEEDANCE_RESOLUTION_DEFAULT
  const duration = data.duration ?? SEEDANCE_DURATION_DEFAULT
  const result = data.result ?? []
  const running = data.running ?? false

  const fail = (message: string) => {
    updateNodeData(id, { running: false, error: message })
    window.alert(`视频生成失败：${message}`)
  }

  const handleRun = async () => {
    const prompt = collectUpstreamPrompt(id)
    if (!prompt.trim()) {
      fail('请先连接一个有内容的 Prompt 节点')
      return
    }
    const images = imagesText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    updateNodeData(id, { running: true, error: undefined, result: [] })
    try {
      const urls = await generateVideoApi({
        reqFrom,
        model: videoApiModel(data.model),
        version,
        mode,
        prompt,
        images,
        resolution,
        duration,
      })
      updateNodeData(id, { running: false, result: urls })
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e))
    }
  }

  // 选择本地图片 → 上传 → 把返回 URL 按行追加进输入图文本框（保留已填内容）
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    setUploading(true)
    try {
      const urls = await uploadImagesApi(files, reqFrom.trim() || 'openflow')
      const next = [imagesText.trim(), ...urls].filter(Boolean).join('\n')
      updateNodeData(id, { imagesText: next })
    } catch (err) {
      window.alert(`图片上传失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card
      className={`w-72 gap-2 py-3 shadow-sm transition-shadow ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
    >
      <Handle type="target" position={Position.Left} className={`!size-3 ${meta.handle}`} />
      <CardHeader className="px-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className={`size-2 rounded-full ${meta.dot}`} />
          {data.label}
          <span className="ml-auto text-xs font-normal text-muted-foreground">{data.model}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-3">
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          req_from（署名）
          <Input
            value={reqFrom}
            onChange={(e) => updateNodeData(id, { reqFrom: e.target.value })}
            placeholder="改自己名字哦，不要冒用他/她人。"
            className="nodrag h-8 text-xs"
          />
        </label>

        <Textarea
          value={imagesText}
          onChange={(e) => updateNodeData(id, { imagesText: e.target.value })}
          placeholder="输入图片 URL（每行一个；0=文生视频 / 1=首帧 / 2=首尾帧）"
          className="nodrag min-h-16 resize-none text-xs"
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleUpload}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="nodrag w-full"
        >
          {uploading ? '上传中…' : '上传图片'}
        </Button>

        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          version
          <Select value={version} onValueChange={(v) => updateNodeData(id, { version: v })}>
            <SelectTrigger className="nodrag w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEEDANCE_VERSION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          mode
          <Select value={mode} onValueChange={(v) => updateNodeData(id, { mode: v })}>
            <SelectTrigger className="nodrag w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEEDANCE_MODE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            分辨率
            <Select
              value={resolution}
              onValueChange={(v) => updateNodeData(id, { resolution: v })}
            >
              <SelectTrigger className="nodrag w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEEDANCE_RESOLUTION_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r} className="text-xs">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            时长（秒）
            <Select
              value={String(duration)}
              onValueChange={(v) => updateNodeData(id, { duration: Number(v) })}
            >
              <SelectTrigger className="nodrag w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEEDANCE_DURATION_OPTIONS.map((d) => (
                  <SelectItem key={d} value={String(d)} className="text-xs">
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>

        <Button size="sm" onClick={handleRun} disabled={running} className="nodrag w-full">
          {running ? '生成中…' : '生成'}
        </Button>

        {result.length > 0 && (
          <div className="nodrag flex flex-col gap-2">
            {result.map((url) => (
              <video key={url} src={url} controls className="w-full rounded-md border" />
            ))}
          </div>
        )}

        {data.error && (
          <p className="nodrag rounded-md bg-destructive/10 p-2 text-[11px] text-destructive">
            {data.error}
          </p>
        )}
      </CardContent>
      <Handle type="source" position={Position.Right} className={`!size-3 ${meta.handle}`} />
    </Card>
  )
}
