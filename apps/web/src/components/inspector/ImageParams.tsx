import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
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
import { type ImageNodeData } from '@/lib/types'
import { useFlowStore } from '@/store/useFlowStore'

/** 图像节点参数控件（右侧 Inspector 用）：按模型分两套可调项。 */
export function ImageParams({ id, data }: { id: string; data: ImageNodeData }) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)

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

  return isNano ? (
    <div className="grid grid-cols-2 gap-2">
      <label className="col-span-2 flex flex-col gap-1 text-[11px] text-muted-foreground">
        version
        <Select value={version} onValueChange={(v) => updateNodeData(id, { version: v })}>
          <SelectTrigger className="w-full text-xs">
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
        <Select value={aspectRatio} onValueChange={(v) => updateNodeData(id, { aspectRatio: v })}>
          <SelectTrigger className="w-full text-xs">
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
        <Select value={imageSize} onValueChange={(v) => updateNodeData(id, { imageSize: v })}>
          <SelectTrigger className="w-full text-xs">
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
          <SelectTrigger className="w-full text-xs">
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
          <SelectTrigger className="w-full text-xs">
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
        <Select value={String(n)} onValueChange={(v) => updateNodeData(id, { n: Number(v) })}>
          <SelectTrigger className="w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {IMAGE_N_OPTIONS.map((nn) => (
              <SelectItem key={nn} value={String(nn)} className="text-xs">
                {nn}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
    </div>
  )
}
