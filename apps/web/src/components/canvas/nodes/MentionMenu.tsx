import { Image as ImageIcon, Music4, Video } from 'lucide-react'
import type { MentionCandidate } from '@/lib/graph'
import { HANDLE_COLORS } from '@/lib/handleTypes'
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

/**
 * Prompt 文本的 @ tag 高亮层内容：把文本按 token 切片，命中 mentions 映射的 token
 * 渲染成带底色的圆角片段（文字透明——真实文字由上层 Textarea 绘制，这里只画「底色药丸」）。
 * 未命中映射的 @[...]（手打/悬空到映射被清理）不上色。
 */
export function MentionHighlights({
  text,
  mentions,
}: {
  text: string
  mentions?: PromptMentionRef[]
}) {
  const kindByName = new Map((mentions ?? []).map((m) => [m.name, m.kind]))
  const parts = text.split(TOKEN_SPLIT_RE)
  return (
    <>
      {parts.map((part, i) => {
        const m = TOKEN_EXACT_RE.exec(part)
        const kind = m ? kindByName.get(m[1]) : undefined
        if (!kind) return <span key={i}>{part}</span>
        return (
          <span key={i} className="rounded-[4px]" style={{ backgroundColor: KIND_TAG_BG[kind] }}>
            {part}
          </span>
        )
      })}
      {'\n'}
    </>
  )
}

/**
 * @ 引用候选菜单（自绘绝对定位浮层，锚在 Textarea 正下方；逻辑见 hooks/useMentionMenu）。
 * 不用 Radix Popover/DropdownMenu：其 pointerdown 会被 React Flow 节点拖拽逻辑吞掉（见 PromptNode 预设弹窗注释）。
 * 菜单项 onMouseDown preventDefault 防 textarea 失焦；容器 nodrag/nowheel 防节点拖拽与画布缩放。
 */
export function MentionMenu({
  items,
  activeIndex,
  onHover,
  onSelect,
}: {
  items: MentionCandidate[]
  activeIndex: number
  onHover: (index: number) => void
  onSelect: (item: MentionCandidate) => void
}) {
  return (
    <div className="nodrag nowheel absolute inset-x-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
      {items.length === 0 ? (
        <p className="px-2 py-1.5 text-xs text-muted-foreground">
          无可引用的资源：把图像/音频/视频素材连线到本 Prompt 下游的图像/视频节点后再试。
        </p>
      ) : (
        items.map((item, i) => {
          const Icon = KIND_ICON[item.kind]
          return (
            <button
              key={item.key}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => onHover(i)}
              onClick={() => onSelect(item)}
              className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs ${
                i === activeIndex ? 'bg-accent text-accent-foreground' : ''
              }`}
            >
              {item.kind === 'image' && item.url ? (
                <img src={item.url} alt="" className="size-6 shrink-0 rounded-sm object-cover" />
              ) : (
                <Icon className="size-4 shrink-0 opacity-70" />
              )}
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">{KIND_LABEL[item.kind]}</span>
            </button>
          )
        })
      )}
    </div>
  )
}
