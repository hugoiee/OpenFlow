import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { uploadFilesApi } from '@/lib/api'
import { collectUpstreamImages } from '@/lib/graph'
import { useActiveProject, useFlowStore } from '@/store/useFlowStore'

/**
 * 输入图编辑器（右侧 Inspector 共用）。
 * 输入图来自两处，合并成一条有序序列：上游连线传入的结果图（只读，排前）+ 手动填/传的 URL（可删 / 排序）。
 * - 画廊态（不传 slotLabels）：数字角标 1..n，不限张数（图像节点 / 视频参考图）。
 * - 槽位态（传 slotLabels，如 ['首帧','尾帧']）：按位置打标签 + 空占位提示；超出槽位的图标「忽略」。
 */
export function ImageInput({
  id,
  imagesText,
  placeholder,
  slotLabels,
}: {
  id: string
  imagesText: string
  placeholder?: string
  slotLabels?: string[]
}) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const project = useActiveProject()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  // 手动填/传的 URL（按行拆，去空白 / 空行）
  const images = imagesText
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  // 上游连线传入的结果图（只读，排在手动图之前）
  const connected = project ? collectUpstreamImages(project, id) : []
  const total = connected.length + images.length

  // 删除第 idx 张手动图（连线图只读，不在此列）
  const removeImage = (idx: number) => {
    updateNodeData(id, { imagesText: images.filter((_, i) => i !== idx).join('\n') })
  }

  // 在手动图内部前移 / 后移（dir=-1 / 1），顺序即槽位 / 序号
  const moveImage = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= images.length) return
    const next = images.slice()
    ;[next[idx], next[target]] = [next[target], next[idx]]
    updateNodeData(id, { imagesText: next.join('\n') })
  }

  // 选择本地图片 → 上传 → 把返回 URL 追加进输入图（保留已填内容）
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // 清空，便于重复选同名文件
    if (files.length === 0) return
    setUploading(true)
    try {
      const urls = await uploadFilesApi(files)
      const next = [imagesText.trim(), ...urls].filter(Boolean).join('\n')
      updateNodeData(id, { imagesText: next })
    } catch (err) {
      window.alert(`图片上传失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setUploading(false)
    }
  }

  // 合并序列里第 pos 张的角标：槽位态用 slotLabels 标注，超出槽位标「忽略」；画廊态用序号
  const badge = (pos: number): { text: string; muted: boolean } =>
    slotLabels
      ? pos < slotLabels.length
        ? { text: slotLabels[pos], muted: false }
        : { text: '忽略', muted: true }
      : { text: String(pos + 1), muted: false }

  // 槽位态始终展示（含空占位）以呈现结构；画廊态仅有图时展示
  const showGrid = !!slotLabels || total > 0
  // 剩余未填的槽位标签（仅槽位态）
  const emptySlots = slotLabels ? slotLabels.slice(total) : []

  return (
    <div className="flex flex-col gap-2">
      {showGrid && (
        <div className={`grid gap-2 ${slotLabels ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {/* 上游连线传入：只读 */}
          {connected.map((url, i) => {
            const b = badge(i)
            return (
              <div
                key={`up-${url}-${i}`}
                className={`relative aspect-square overflow-hidden rounded-md border bg-muted ${
                  b.muted ? 'border-dashed opacity-40' : 'border-primary/50 ring-1 ring-primary/30'
                }`}
              >
                <a href={url} target="_blank" rel="noreferrer" title={url}>
                  <img
                    src={url}
                    alt={b.text}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.visibility = 'hidden'
                    }}
                  />
                </a>
                <span className="pointer-events-none absolute left-1 top-1 z-10 rounded-full bg-foreground/80 px-1.5 text-[9px] font-medium leading-4 text-background shadow-sm">
                  {b.text}
                </span>
                <span className="pointer-events-none absolute inset-x-1 bottom-1 z-10 rounded bg-primary/80 px-1 text-center text-[9px] leading-4 text-primary-foreground">
                  连线
                </span>
              </div>
            )
          })}

          {/* 手动填 / 传：可删 / 排序 */}
          {images.map((url, i) => {
            const b = badge(connected.length + i)
            return (
              <div
                key={`${url}-${i}`}
                className={`group relative aspect-square overflow-hidden rounded-md border bg-muted ${
                  b.muted ? 'border-dashed opacity-40' : ''
                }`}
              >
                <a href={url} target="_blank" rel="noreferrer" title={url}>
                  <img
                    src={url}
                    alt={b.text}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.visibility = 'hidden'
                    }}
                  />
                </a>
                <span className="pointer-events-none absolute left-1 top-1 z-10 rounded-full bg-foreground/80 px-1.5 text-[9px] font-medium leading-4 text-background shadow-sm">
                  {b.text}
                </span>
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  title="移除"
                  className="absolute right-1 top-1 z-10 grid size-4 place-items-center rounded-full bg-background/80 text-foreground shadow-sm transition-colors hover:bg-background"
                >
                  <X className="size-3" />
                </button>
                <div className="absolute inset-x-1 bottom-1 z-10 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => moveImage(i, -1)}
                    disabled={i === 0}
                    title="前移"
                    className="grid size-4 place-items-center rounded-full bg-background/80 text-foreground shadow-sm transition-colors hover:bg-background disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ChevronLeft className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveImage(i, 1)}
                    disabled={i === images.length - 1}
                    title="后移"
                    className="grid size-4 place-items-center rounded-full bg-background/80 text-foreground shadow-sm transition-colors hover:bg-background disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ChevronRight className="size-3" />
                  </button>
                </div>
              </div>
            )
          })}

          {/* 槽位态：剩余空占位，提示该放什么 */}
          {emptySlots.map((label, i) => (
            <div
              key={`slot-${i}`}
              className="flex aspect-square items-center justify-center rounded-md border border-dashed text-[10px] text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>
      )}

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
        className="w-full"
      >
        {uploading ? '上传中…' : '上传图片'}
      </Button>
      <Textarea
        value={imagesText}
        onChange={(e) => updateNodeData(id, { imagesText: e.target.value })}
        placeholder={placeholder}
        // field-sizing-fixed 关掉 shadcn 默认的内容自动撑高；固定起始高度 + 内部滚动，resize-y 可拖高
        className="field-sizing-fixed h-16 max-h-72 resize-y text-xs"
      />
    </div>
  )
}
