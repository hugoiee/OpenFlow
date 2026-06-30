import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { uploadImagesApi } from '@/lib/api'
import { type ImageNode as ImageNodeT, type VideoNode as VideoNodeT } from '@/lib/types'
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
  const selected = (project?.nodes ?? []).filter((n) => n.selected)
  if (selected.length !== 1) return null
  const node = selected[0]
  if (node.type !== 'image' && node.type !== 'video') return null
  // key={node.id}：切换选中节点时重置 uploading / 文件输入，避免上传态串台
  return <NodeInspectorPanel key={node.id} node={node} />
}

function NodeInspectorPanel({ node }: { node: ImageNodeT | VideoNodeT }) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const id = node.id
  const imagesText = node.data.imagesText ?? ''

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
          className="min-h-20 resize-none text-xs"
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
