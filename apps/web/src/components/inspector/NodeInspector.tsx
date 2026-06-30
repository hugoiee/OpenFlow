import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { uploadImagesApi } from '@/lib/api'
import { collectUpstreamImages } from '@/lib/graph'
import { type ImageNode as ImageNodeT, type Project, type VideoNode as VideoNodeT } from '@/lib/types'
import { useActiveProject, useFlowStore } from '@/store/useFlowStore'
import { ImageParams } from './ImageParams'
import { VideoParams } from './VideoParams'

/**
 * 右侧节点参数面板（Inspector）。
 * 仅在「恰好选中一个 image/video 节点」时出现；节点卡片只显示生成结果，参数都在此编辑。
 * 选中状态来自 React Flow 写在 node.selected 上的标记（store 已通过 applyNodeChanges 维护）。
 */
export function NodeInspector() {
  const project = useActiveProject()
  if (!project) return null
  const selected = project.nodes.filter((n) => n.selected)
  if (selected.length !== 1) return null
  const node = selected[0]
  if (node.type !== 'image' && node.type !== 'video') return null
  // key={node.id}：切换选中节点时重置 uploading / 文件输入，避免上传态串台
  return <NodeInspectorPanel key={node.id} node={node} project={project} />
}

function NodeInspectorPanel({
  node,
  project,
}: {
  node: ImageNodeT | VideoNodeT
  project: Project
}) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const id = node.id
  const imagesText = node.data.imagesText ?? ''
  // 手动填/传的输入图 URL 列表（按行拆，去空白/空行）
  const images = imagesText
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  // 上游 image 节点经连线传入的结果图（只读，排在手动图之前 = 图片1…）
  const connected = collectUpstreamImages(project, id)

  // 删除第 idx 张输入图：按位置移除（兼容重复 URL），重写回文本框
  const removeImage = (idx: number) => {
    updateNodeData(id, { imagesText: images.filter((_, i) => i !== idx).join('\n') })
  }

  // 调整顺序：把第 idx 张与相邻一张交换（dir=-1 前移 / 1 后移）。
  // 顺序即「图片1 / 图片2…」，下游 prompt 按此引用。
  const moveImage = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= images.length) return
    const next = images.slice()
    ;[next[idx], next[target]] = [next[target], next[idx]]
    updateNodeData(id, { imagesText: next.join('\n') })
  }

  // 选择本地图片 → 上传 → 把返回 URL 按行追加进输入图文本框（保留已填内容）
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // 清空，便于重复选同名文件
    if (files.length === 0) return
    setUploading(true)
    try {
      const urls = await uploadImagesApi(files)
      const next = [imagesText.trim(), ...urls].filter(Boolean).join('\n')
      updateNodeData(id, { imagesText: next })
    } catch (err) {
      window.alert(`图片上传失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <aside className="absolute right-0 top-0 z-10 flex h-full w-80 flex-col gap-3 overflow-y-auto border-l bg-background p-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">{node.data.label}</span>
        <h2 className="text-sm font-semibold">{node.data.model}</h2>
      </div>

      {/* 共享：输入图 URL + 上传 */}
      <div className="flex flex-col gap-2">
        <span className="text-[11px] text-muted-foreground">输入图（每行一个 URL）</span>
        <Textarea
          value={imagesText}
          onChange={(e) => updateNodeData(id, { imagesText: e.target.value })}
          placeholder={
            node.type === 'image'
              ? '输入图片 URL（每行一个，可留空做文生图）'
              : '输入图片 URL（每行一个；0=文生视频 / 1=首帧 / 2=首尾帧）'
          }
          // field-sizing-fixed 关掉 shadcn 默认的 field-sizing-content（内容自动撑高）；
          // 固定起始高度 + 内部滚动，避免图片一多就撑很长；resize-y 让用户可拖拽调高。
          className="field-sizing-fixed h-20 max-h-72 resize-y text-xs"
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
          className="w-full"
        >
          {uploading ? '上传中…' : '上传图片'}
        </Button>

        {/* 输入图缩略图预览：连线传入的（只读）排前，手动的（可删/排序）在后；序号即「图片1/图片2…」 */}
        {(connected.length > 0 || images.length > 0) && (
          <div className="grid grid-cols-3 gap-2">
            {/* 上游连线传入的图：只读，序号 1..k */}
            {connected.map((url, i) => (
              <div
                key={`up-${url}-${i}`}
                className="relative aspect-square overflow-hidden rounded-md border border-primary/50 bg-muted ring-1 ring-primary/30"
              >
                <a href={url} target="_blank" rel="noreferrer" title={url}>
                  <img
                    src={url}
                    alt={`连线输入图 ${i + 1}`}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.visibility = 'hidden'
                    }}
                  />
                </a>
                <span className="pointer-events-none absolute left-1 top-1 z-10 grid size-4 place-items-center rounded-full bg-foreground/80 text-[10px] font-medium text-background shadow-sm">
                  {i + 1}
                </span>
                <span className="pointer-events-none absolute inset-x-1 bottom-1 z-10 rounded bg-primary/80 px-1 text-center text-[9px] leading-4 text-primary-foreground">
                  连线
                </span>
              </div>
            ))}

            {/* 手动上传/填入的图：可删 / 排序，序号接在连线图之后 */}
            {images.map((url, i) => (
              <div
                key={`${url}-${i}`}
                className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
              >
                <a href={url} target="_blank" rel="noreferrer" title={url}>
                  <img
                    src={url}
                    alt={`输入图 ${connected.length + i + 1}`}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.visibility = 'hidden'
                    }}
                  />
                </a>

                {/* 序号角标：接在连线图之后，对应 prompt 里的「图片1 / 图片2…」 */}
                <span className="pointer-events-none absolute left-1 top-1 z-10 grid size-4 place-items-center rounded-full bg-foreground/80 text-[10px] font-medium text-background shadow-sm">
                  {connected.length + i + 1}
                </span>

                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  title="移除"
                  className="absolute right-1 top-1 z-10 grid size-4 place-items-center rounded-full bg-background/80 text-foreground shadow-sm transition-colors hover:bg-background"
                >
                  <X className="size-3" />
                </button>

                {/* 前移 / 后移：在手动图内部交换位置 */}
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
            ))}
          </div>
        )}
      </div>

      {/* 模型专用参数 */}
      {node.type === 'image' ? (
        <ImageParams id={id} data={node.data} />
      ) : (
        <VideoParams id={id} data={node.data} />
      )}
    </aside>
  )
}
