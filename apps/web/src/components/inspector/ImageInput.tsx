import { collectUpstreamImages } from '@/lib/graph'
import { useActiveProject } from '@/store/useFlowStore'

/**
 * 输入图预览（只读，右侧 Inspector 用）。
 * 输入图只来自连线：把「图像素材」节点（拖桌面图片到画布空白处生成）或上游生成结果
 * 连到本节点的图像输入端点即可。此处按最终发送顺序展示缩略图，不提供上传 / 手填 URL。
 * （imagesText 为兼容旧数据保留：若旧项目里存过手填 URL，仍会排在连线图之后一并展示 / 发送。）
 */
export function ImageInput({ id, imagesText }: { id: string; imagesText: string }) {
  const project = useActiveProject()
  // 上游连线传入的图（图像素材 / 生成结果），排在前
  const connected = project ? collectUpstreamImages(project, id) : []
  // 旧数据里手填/传的 URL（按行拆，去空白 / 空行），排在后
  const legacy = imagesText
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  const urls = [...connected, ...legacy]

  if (urls.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-2 text-[11px] leading-relaxed text-muted-foreground">
        暂无输入图。把图片拖到画布空白处会生成「图像素材」节点，连线到本节点即可作输入图（留空则文生图）。
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
