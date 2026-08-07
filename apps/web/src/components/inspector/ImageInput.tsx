import { buildImageRequest } from '@/lib/requestBody'
import type { ImageNode } from '@/lib/types'
import { useActiveProject } from '@/store/useFlowStore'

/**
 * 输入图预览（只读，右侧 Inspector 用）。
 * 展示**实际发送**的 image_list（与请求预览同源 buildImageRequest）：资源连到节点的统一资源端点，
 * 上游 Prompt 里有 @ 引用图像时只发被 @ 的（@ 序），没 @ 则全发（连线序）；
 * 旧数据手填 URL（imagesText）排在最后一并发送。不提供上传 / 手填。
 */
export function ImageInput({ node }: { node: ImageNode }) {
  const project = useActiveProject()
  const urls = project ? buildImageRequest(project, node).images : []

  if (urls.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-2 text-[11px] leading-relaxed text-muted-foreground">
        暂无输入图。把图片拖到画布空白处会生成「图像素材」节点，连线到本节点的资源端点即可作输入图；
        上游 Prompt 里可用 @ 指定用哪张（留空则文生图）。
      </p>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {urls.map((url, i) => (
        <div
          key={`${url}-${i}`}
          className="relative aspect-square overflow-hidden rounded-md border bg-muted"
        >
          <a href={url} target="_blank" rel="noreferrer" title={url}>
            <img
              src={url}
              alt={String(i + 1)}
              className="h-full w-full object-cover"
              onError={(e) => {
                e.currentTarget.style.visibility = 'hidden'
              }}
            />
          </a>
          <span className="pointer-events-none absolute left-1 top-1 z-10 rounded-full bg-foreground/80 px-1.5 text-[9px] font-medium leading-4 text-background shadow-sm">
            {i + 1}
          </span>
        </div>
      ))}
    </div>
  )
}
