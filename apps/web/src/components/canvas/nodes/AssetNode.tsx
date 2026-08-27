import { type NodeProps } from '@xyflow/react'
import { Image as ImageIcon, Music, Video } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { NodeHeader } from './NodeHeader'
import { NodeActions } from './NodeActions'
import { NodeHandle } from './NodeHandle'
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
        icon={kind === 'image' ? ImageIcon : kind === 'video' ? Video : Music}
        title={data.label || meta.label}
        selected={selected}
        markable={false}
      />
      <CardContent className="flex flex-col gap-2 px-3">
        {/* node-media：滑出视口时跳过渲染，见 index.css */}
        <div className="node-media nodrag overflow-hidden rounded-md border">
          {uploading ? (
            <Skeleton className={kind === 'audio' ? 'h-12 w-full' : 'aspect-square w-full'} />
          ) : kind === 'image' && url ? (
            <a href={url} target="_blank" rel="noreferrer" className="block">
              <img
                src={url}
                alt={data.fileName ?? '图像素材'}
                // 素材是用户拖入的原图（常有几 MB / 数千像素），这里只显示到 ~240px 宽。
                // loading=lazy：画布上素材节点常有几十个，只让平移到视口附近的发请求——图基本都在
                // 同一个网关 origin 上，HTTP/1.1 下浏览器每源只并发 ~6 条，全量预取会把视口内的图挤到队尾。
                // 与 .node-media 的 content-visibility 互补：那个跳渲染，这个省下载。
                // decoding=async 把解码挪出主线程关键路径，画布上素材一多时平移不被解码卡住。
                loading="lazy"
                decoding="async"
                className="max-h-64 w-full bg-muted object-contain"
              />
            </a>
          ) : kind === 'video' && url ? (
            // preload=metadata：只拉首帧与时长，不预取整片（Chrome 默认可能拉更多）。
            // 画布上可能同时挂着十几个视频素材，全量预取会把带宽和解码器实例吃光。
            <video
              src={url}
              controls
              preload="metadata"
              className="max-h-64 w-full bg-black object-contain"
            />
          ) : kind === 'audio' && url ? (
            // 音频没有画面可展示，preload=none 到点播放才拉流（代价仅是播放前不显示时长）
            <audio src={url} controls preload="none" className="w-full" />
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

        {/* 底部动作行：文件名 + 复制 / 删除（本节点没有主操作按钮，这一行是专为它们加的） */}
        <div className="flex items-center gap-2">
          <NodeActions id={id} subtitle={data.fileName} selected={selected} />
        </div>
      </CardContent>
      {/* 输出：图像素材=Image(绿) / 音频素材=Audio(蓝) / 视频素材=Video(玫红) */}
      <NodeHandle
        type="source"
        index={0}
        tone={kind === 'image' ? 'image' : kind === 'video' ? 'video' : 'audio'}
        label={kind === 'image' ? 'Image' : kind === 'video' ? 'Video' : 'Audio'}
      />
    </Card>
  )
}
