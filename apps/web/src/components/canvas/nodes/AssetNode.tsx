import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Image as ImageIcon, Music } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { NodeHeader } from './NodeHeader'
import { ASSET_NODE_META } from '@/lib/nodeCatalog'
import { type AssetNode as AssetNodeType } from '@/lib/types'

/**
 * 素材节点：承载从桌面拖入并上传后的一张图片 / 一段音频。
 * 纯「源」节点——只有右侧 source Handle，可连到下游图像/视频生成节点作输入。
 * 图像素材展示缩略图，音频素材展示 <audio> 播放器；上传中显示骨架，失败内联红字。
 */
export function AssetNode({ id, data, selected }: NodeProps<AssetNodeType>) {
  const kind = data.kind ?? 'image'
  const meta = ASSET_NODE_META[kind]
  const uploading = data.uploading ?? false
  const url = data.url ?? ''

  return (
    <Card
      className={`group/node w-60 gap-2 py-3 shadow-sm transition-shadow ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
    >
      <NodeHeader
        id={id}
        icon={kind === 'image' ? ImageIcon : Music}
        title={data.fileName || meta.label}
        selected={selected}
      />
      <CardContent className="flex flex-col gap-2 px-3">
        <div className="nodrag overflow-hidden rounded-md border">
          {uploading ? (
            <Skeleton className={kind === 'image' ? 'aspect-square w-full' : 'h-12 w-full'} />
          ) : kind === 'image' && url ? (
            <a href={url} target="_blank" rel="noreferrer" className="block">
              <img
                src={url}
                alt={data.fileName ?? '图像素材'}
                className="max-h-64 w-full bg-muted object-contain"
              />
            </a>
          ) : kind === 'audio' && url ? (
            <audio src={url} controls className="w-full" />
          ) : (
            <div className="flex h-12 w-full items-center justify-center bg-muted text-[11px] text-muted-foreground">
              {data.error ? '上传失败' : '暂无素材'}
            </div>
          )}
        </div>

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
