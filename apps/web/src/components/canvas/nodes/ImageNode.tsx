import { Handle, Position, type NodeProps } from '@xyflow/react'
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
import { generateImageApi } from '@/lib/api'
import {
  GEN_NODE_META,
  IMAGE_N_OPTIONS,
  IMAGE_QUALITY_OPTIONS,
  IMAGE_SIZE_DEFAULT,
  IMAGE_SIZE_LABELS,
  IMAGE_SIZE_OPTIONS,
  NANO_ASPECT_DEFAULT,
  NANO_ASPECT_OPTIONS,
  NANO_IMAGE_SIZE_DEFAULT,
  NANO_IMAGE_SIZE_OPTIONS,
  NANO_VERSION_DEFAULT,
  NANO_VERSION_OPTIONS,
  imageApiModel,
} from '@/lib/nodeCatalog'
import { type ImageNode as ImageNodeType } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'

const meta = GEN_NODE_META.image

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

export function ImageNode({ id, data, selected }: NodeProps<ImageNodeType>) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)

  // 兼容旧数据：早期 image 节点只有 {label, model}，缺失字段给默认值，避免崩
  const imagesText = data.imagesText ?? ''
  const reqFrom = data.reqFrom ?? ''
  // 按模型区分两套可调项：nano-banana 走 version/aspect_ratio/image_size，其它走 size/quality/n
  const isNano = imageApiModel(data.model) === 'nano-banana'
  // 旧数据可能存了已不再支持的尺寸（如 1024x1024），回退到默认受支持尺寸
  const storedSize = data.size ?? IMAGE_SIZE_DEFAULT
  const size = (IMAGE_SIZE_OPTIONS as readonly string[]).includes(storedSize)
    ? storedSize
    : IMAGE_SIZE_DEFAULT
  const quality = data.quality ?? 'auto'
  const n = data.n ?? 1
  const version = data.version ?? NANO_VERSION_DEFAULT
  const aspectRatio = data.aspectRatio ?? NANO_ASPECT_DEFAULT
  const imageSize = data.imageSize ?? NANO_IMAGE_SIZE_DEFAULT
  const result = data.result ?? []
  const running = data.running ?? false

  // 生成失败：节点底部内联显示 + 弹窗提示
  const fail = (message: string) => {
    updateNodeData(id, { running: false, error: message })
    window.alert(`图像生成失败：${message}`)
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
      const urls = await generateImageApi({
        reqFrom,
        model: imageApiModel(data.model),
        prompt,
        images,
        // 按模型分组传参，未用到的一组留默认值/空（后端按 model 取舍）
        ...(isNano
          ? { version, aspectRatio, imageSize, size: '', n: 1, quality: '' }
          : { size, n, quality }),
      })
      updateNodeData(id, { running: false, result: urls })
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e))
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
          placeholder="输入图片 URL（每行一个，可留空做文生图）"
          className="nodrag min-h-16 resize-none text-xs"
        />

        {isNano ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-2 flex flex-col gap-1 text-[11px] text-muted-foreground">
              version
              <Select value={version} onValueChange={(v) => updateNodeData(id, { version: v })}>
                <SelectTrigger className="nodrag w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NANO_VERSION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
              宽高比
              <Select
                value={aspectRatio}
                onValueChange={(v) => updateNodeData(id, { aspectRatio: v })}
              >
                <SelectTrigger className="nodrag w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NANO_ASPECT_OPTIONS.map((a) => (
                    <SelectItem key={a} value={a} className="text-xs">
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
              尺寸
              <Select
                value={imageSize}
                onValueChange={(v) => updateNodeData(id, { imageSize: v })}
              >
                <SelectTrigger className="nodrag w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NANO_IMAGE_SIZE_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
              尺寸
              <Select value={size} onValueChange={(v) => updateNodeData(id, { size: v })}>
                <SelectTrigger className="nodrag w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_SIZE_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s} className="text-xs">
                      {IMAGE_SIZE_LABELS[s] ?? s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
              质量
              <Select value={quality} onValueChange={(v) => updateNodeData(id, { quality: v })}>
                <SelectTrigger className="nodrag w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_QUALITY_OPTIONS.map((q) => (
                    <SelectItem key={q} value={q} className="text-xs">
                      {q}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
              张数
              <Select
                value={String(n)}
                onValueChange={(v) => updateNodeData(id, { n: Number(v) })}
              >
                <SelectTrigger className="nodrag w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_N_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)} className="text-xs">
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
        )}

        <Button
          size="sm"
          onClick={handleRun}
          disabled={running}
          className="nodrag w-full"
        >
          {running ? '生成中…' : '生成'}
        </Button>

        {result.length > 0 && (
          <div className="nodrag grid grid-cols-2 gap-2">
            {result.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                <img
                  src={url}
                  alt="生成结果"
                  className="aspect-square w-full rounded-md border object-cover"
                />
              </a>
            ))}
          </div>
        )}

        {/* 生成失败信息：固定在节点最下方 */}
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
