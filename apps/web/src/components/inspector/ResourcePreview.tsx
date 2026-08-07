import { AudioLines } from 'lucide-react'

/**
 * Inspector 里「实发资源」的只读预览件（图像 / 视频 / 音频三种），供 ImageInput 与 VideoInput 共用。
 * 纯展示：URL 由调用方从 buildXxxRequest 取，保证预览=实发。
 * 角标默认是 1 基序号（对应 prompt 里的 <<<image_N>>> 占位符）；首尾帧这类有语义的位次可传 labels 覆盖。
 */

/** 序号 / 语义角标（左上角）。 */
function IndexBadge({ text }: { text: string }) {
  return (
    <span className="pointer-events-none absolute left-1 top-1 z-10 rounded-full bg-foreground/80 px-1.5 text-[9px] leading-4 font-medium text-background shadow-sm">
      {text}
    </span>
  )
}

/** 图像缩略图（3 列方格）。加载失败的图隐藏图元但保留占位方块，不让整块塌掉。 */
export function ImageThumbs({ urls, labels }: { urls: string[]; labels?: string[] }) {
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
          <IndexBadge text={labels?.[i] ?? String(i + 1)} />
        </div>
      ))}
    </div>
  )
}

/**
 * 视频缩略图（2 列）。preload="metadata" 只拉首帧不拉整段——面板里可能同时挂好几个参考视频，
 * 全量预加载会白白吃掉带宽；点缩略图在新标签页打开看完整内容。
 */
export function VideoThumbs({ urls }: { urls: string[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {urls.map((url, i) => (
        <div
          key={`${url}-${i}`}
          className="relative aspect-video overflow-hidden rounded-md border bg-muted"
        >
          <a href={url} target="_blank" rel="noreferrer" title={url}>
            <video src={url} preload="metadata" muted className="h-full w-full object-cover" />
          </a>
          <IndexBadge text={String(i + 1)} />
        </div>
      ))}
    </div>
  )
}

/** 音频行（整宽，可直接试听）。 */
export function AudioRows({ urls }: { urls: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {urls.map((url, i) => (
        <div key={`${url}-${i}`} className="flex items-center gap-1.5">
          <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-foreground/80 text-[9px] font-medium text-background">
            {i + 1}
          </span>
          <AudioLines className="size-3 shrink-0 text-muted-foreground" />
          <audio src={url} controls preload="metadata" title={url} className="h-7 min-w-0 flex-1" />
        </div>
      ))}
    </div>
  )
}

/** 分区小标题（「输入图（实发列表）」这类）。 */
export function PreviewSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] text-muted-foreground">{title}</span>
      {children}
    </div>
  )
}

/** 无输入时的虚线提示框。 */
export function PreviewEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed p-2 text-[11px] leading-relaxed text-muted-foreground">
      {children}
    </p>
  )
}
