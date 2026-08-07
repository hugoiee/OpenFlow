import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Image as ImageIcon, Music4, Video } from 'lucide-react'
import type { MentionCandidate, MentionResource } from '@/lib/graph'
import { HANDLE_COLORS } from '@/lib/handleTypes'
import { placeFloating } from '@/lib/floating'
import { useTrackedRect } from '@/hooks/useTrackedRect'
import type { MentionKind, PromptMentionRef } from '@/lib/types'

const KIND_ICON: Record<MentionKind, typeof ImageIcon> = {
  image: ImageIcon,
  audio: Music4,
  video: Video,
}

const KIND_LABEL: Record<MentionKind, string> = { image: '图像', audio: '音频', video: '视频' }

/** @ tag 底色（按资源类型取端点配色，'59' 后缀 ≈ 35% 透明度）。 */
const KIND_TAG_BG: Record<MentionKind, string> = {
  image: `${HANDLE_COLORS.image}59`,
  audio: `${HANDLE_COLORS.audio}59`,
  video: `${HANDLE_COLORS.video}59`,
}

/** 切片用：外层捕获组保住 token 本身、内部不再捕获（split 会把所有捕获组塞进结果）。 */
const TOKEN_SPLIT_RE = /(@\[[^\]\n]+\])/g
/** 单个 token 的整体匹配（切片再验证 + 提取显示名）。 */
const TOKEN_EXACT_RE = /^@\[([^\]\n]+)\]$/

/** 菜单尺寸（px）：宽度固定，避免「按内容测宽 → 定位 → 又变宽」的循环。 */
const MENU_WIDTH = 288
const MENU_MAX_HEIGHT = 264
/** 悬停预览尺寸（px）。 */
const PREVIEW_WIDTH = 240
const PREVIEW_MAX_HEIGHT = 240

/**
 * 资源缩略图：加载失败（外链挂了 / URL 失效）回落成类型图标，不显示浏览器破图。
 * 非图像资源、以及 url 为空时直接走图标。
 */
function ResourceThumb({
  kind,
  url,
  className,
  iconClassName,
}: {
  kind: MentionKind
  url?: string
  className: string
  iconClassName: string
}) {
  // 调用方传 key={url} 重置本组件，故这里无需在 url 变化时手动清 failed
  const [failed, setFailed] = useState(false)
  const Icon = KIND_ICON[kind]

  if (kind !== 'image' || !url || failed) {
    return (
      <span className={`flex items-center justify-center bg-muted ${className}`}>
        <Icon className={`opacity-70 ${iconClassName}`} />
      </span>
    )
  }
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={`bg-muted ${className}`}
    />
  )
}

/**
 * Prompt 文本的 @ tag 高亮层内容：把文本按 token 切片，命中 mentions 映射的 token
 * 渲染成带底色的圆角片段（文字透明——真实文字由上层 Textarea 绘制，这里只画「底色药丸」）。
 * 未命中映射的 @[...]（手打/悬空到映射被清理）不上色。药丸带 data-mention-name 供悬停命中测试。
 *
 * anchorIndex 非空时（@ 菜单打开中），把该下标处的 `@` 字符单独包一层**无样式** span 作测量锚点：
 * 本层与 Textarea 逐像素对齐，所以那个 span 的矩形就是光标位置，菜单据此跟随光标定位。
 * 用「包住真实字符」而非插入零宽空 span——空 inline 元素的 rect 可能塌成 0，且塞 ZWSP 会引入
 * 额外换行机会破坏对齐；无样式 inline 元素则不产生换行机会、不影响布局（现有药丸已实证）。
 *
 * ⚠️ 不变量：本层的字体/内边距/换行规则必须与 Textarea 完全一致，否则药丸错位、光标测量失准。
 */
export function MentionHighlights({
  text,
  mentions,
  anchorIndex,
  anchorRef,
}: {
  text: string
  mentions?: PromptMentionRef[]
  anchorIndex?: number | null
  anchorRef?: RefObject<HTMLSpanElement | null>
}) {
  const kindByName = new Map((mentions ?? []).map((m) => [m.name, m.kind]))
  const parts = text.split(TOKEN_SPLIT_RE)
  const out: ReactNode[] = []
  let offset = 0

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const start = offset
    offset += part.length
    if (!part) continue
    // 锚点是否落在本片段内（只认 `@` 字符本身，避免 anchorIndex 过期时错标）
    const hasAnchor =
      anchorIndex != null &&
      anchorIndex >= start &&
      anchorIndex < start + part.length &&
      text[anchorIndex] === '@'
    const m = TOKEN_EXACT_RE.exec(part)
    const kind = m ? kindByName.get(m[1]) : undefined

    if (kind && m) {
      out.push(
        <span
          key={i}
          // 极端情况：新输入的 @ 恰好把后文拼成了已登记 token，锚点就挂在药丸上
          ref={hasAnchor ? anchorRef : undefined}
          data-mention-name={m[1]}
          className="rounded-[4px]"
          style={{ backgroundColor: KIND_TAG_BG[kind] }}
        >
          {part}
        </span>,
      )
      continue
    }
    if (!hasAnchor) {
      out.push(<span key={i}>{part}</span>)
      continue
    }
    const rel = anchorIndex - start
    out.push(
      <span key={i}>
        {part.slice(0, rel)}
        <span ref={anchorRef}>{part[rel]}</span>
        {part.slice(rel + 1)}
      </span>,
    )
  }

  return (
    <>
      {out}
      {'\n'}
    </>
  )
}

/**
 * @ 引用候选菜单：跟随光标定位、portal 到 body，空间不足时向上翻转。
 *
 * 为什么 portal 到 body：节点卡片（shadcn Card）有 overflow-hidden 会裁掉浮层，且 React Flow
 * 给每个节点 div 同时加了 transform 与 z-index（必然形成独立层叠上下文），节点内的 z-50 对其他
 * 节点无效。只有渲染出节点子树才能既不被裁、又盖得住邻居节点。
 * 不用 Radix Popover/DropdownMenu：其 pointerdown 会被 React Flow 节点拖拽逻辑吞掉（见 PromptNode 预设弹窗注释）。
 */
export function MentionMenu({
  anchorRef,
  clipRef,
  items,
  activeIndex,
  onHover,
  onSelect,
}: {
  /** 高亮层里那个包住 `@` 的测量锚点。 */
  anchorRef: RefObject<HTMLSpanElement | null>
  /** Textarea：锚点滚出其可视区时隐藏菜单。 */
  clipRef: RefObject<HTMLTextAreaElement | null>
  items: MentionCandidate[]
  activeIndex: number
  onHover: (index: number) => void
  onSelect: (item: MentionCandidate) => void
}) {
  const rect = useTrackedRect(() => anchorRef.current?.getBoundingClientRect() ?? null, clipRef)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  // ↑↓ 导航时把选中项滚进菜单可视区（block:'nearest' 只滚最近的可滚容器 = 菜单本身）
  useEffect(() => {
    itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (!rect) return null
  const pos = placeFloating(rect, { width: MENU_WIDTH, maxHeight: MENU_MAX_HEIGHT, side: 'bottom' })

  return createPortal(
    <div
      data-mention-menu
      // nodrag/nowheel 在 portal 后其实已不再必需（React Flow 的拖拽/缩放 filter 沿真实 DOM
      // 祖先链判定，body 里的元素传不到节点/pane），保留作防御与语义提示。
      className="nodrag nowheel fixed z-50 overflow-y-auto overscroll-contain rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: MENU_WIDTH, maxHeight: pos.maxHeight }}
      // React 合成事件仍沿 React 树冒泡到 NodeWrapper：拦掉右键（否则弹画布「选中操作」菜单）
      // 与点击（避免多余的节点选中 → 全画布连线重算）
      onContextMenu={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {items.length === 0 ? (
        <p className="px-2 py-1.5 text-xs text-muted-foreground">
          无可引用的资源：把图像/音频/视频素材连线到本 Prompt 下游的图像/视频节点后再试。
        </p>
      ) : (
        items.map((item, i) => (
          <button
            key={item.key}
            ref={(el) => {
              itemRefs.current[i] = el
            }}
            type="button"
            onMouseDown={(e) => e.preventDefault()} // 防 Textarea 失焦
            onMouseEnter={() => onHover(i)}
            onClick={() => onSelect(item)}
            className={`flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-xs ${
              i === activeIndex ? 'bg-accent text-accent-foreground' : ''
            }`}
          >
            <ResourceThumb
              key={item.url}
              kind={item.kind}
              url={item.url}
              className="size-10 shrink-0 rounded-sm border object-cover"
              iconClassName="size-4"
            />
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {KIND_LABEL[item.kind]}
            </span>
          </button>
        ))
      )}
    </div>,
    document.body,
  )
}

/**
 * @ tag 悬停预览：鼠标停在文本里某个 tag 药丸上时，浮出该资源的缩略图 / 类型信息。
 * （Textarea 是纯文本控件，文字流里无法内嵌图片——高亮层必须与文字逐像素对齐——故用浮层形式
 * 回答「我 @ 的到底是哪个资源」。）
 *
 * ⚠️ 必须 pointer-events-none：本层压在 Textarea 上方，一旦吃鼠标事件就会让底层 mousemove
 * 断流，形成「显示 → 丢失命中 → 隐藏 → 再命中」的闪烁循环。
 */
export function MentionPreview({
  getRect,
  clipRef,
  mention,
  resource,
}: {
  /** 返回被悬停药丸当前命中的那条 client rect（跨行 token 有多条）。 */
  getRect: () => DOMRect | null
  clipRef: RefObject<HTMLTextAreaElement | null>
  mention: PromptMentionRef
  resource: MentionResource | null
}) {
  const rect = useTrackedRect(getRect, clipRef)
  if (!rect) return null
  const pos = placeFloating(rect, {
    width: PREVIEW_WIDTH,
    maxHeight: PREVIEW_MAX_HEIGHT,
    side: 'top',
    align: 'center',
    gap: 6,
  })

  return createPortal(
    <div
      data-mention-preview
      className="pointer-events-none fixed z-50 overflow-hidden rounded-md border bg-popover p-2 text-popover-foreground shadow-md"
      style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: PREVIEW_WIDTH, maxHeight: pos.maxHeight }}
    >
      {!resource ? (
        <p className="text-xs text-muted-foreground">资源已失效（源节点被删除或结果已清空）</p>
      ) : (
        <>
          {resource.kind === 'video' ? (
            <video
              src={resource.url}
              muted
              preload="metadata"
              className="mb-1.5 max-h-40 w-full rounded-sm bg-muted object-contain"
            />
          ) : (
            <ResourceThumb
              key={resource.url}
              kind={resource.kind}
              url={resource.url}
              className="mb-1.5 h-24 w-full rounded-sm object-contain"
              iconClassName="size-6"
            />
          )}
          <p className="truncate text-xs font-medium">{mention.name}</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {KIND_LABEL[mention.kind]}
            {resource.fileName ? ` · ${resource.fileName}` : ''}
          </p>
        </>
      )}
    </div>,
    document.body,
  )
}
