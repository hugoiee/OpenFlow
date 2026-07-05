import { Image as ImageIcon, Music4, type LucideIcon } from 'lucide-react'
import { audioInputHandleId, imageInputHandleId } from '@/lib/graph'
import { type HandleTone } from '@/lib/handleTypes'
import { useFlowStore } from '@/store/useFlowStore'
import { NodeHandle } from './NodeHandle'

type InputKind = 'image' | 'audio'

const KIND: Record<
  InputKind,
  { tone: HandleTone; handleId: (i: number) => string; label: string; title: string; icon: LucideIcon }
> = {
  image: {
    tone: 'image',
    handleId: imageInputHandleId,
    label: 'Image',
    title: '图像输入',
    icon: ImageIcon,
  },
  audio: {
    tone: 'audio',
    handleId: audioInputHandleId,
    label: 'Audio',
    title: '音频输入',
    icon: Music4,
  },
}

/**
 * 一组编号输入端点（image-0.. / audio-0..，标签 Image 1 / Audio 1…，悬停/选中显示）。
 * baseIndex = 该节点在这组端点之前已占用的左侧端点数（用于竖向排位）。
 */
function NumberedInputHandles({
  kind,
  count,
  baseIndex,
}: {
  kind: InputKind
  count: number
  baseIndex: number
}) {
  const m = KIND[kind]
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <NodeHandle
          key={i}
          type="target"
          id={m.handleId(i)}
          index={baseIndex + i}
          tone={m.tone}
          label={`${m.label} ${i + 1}`}
          title={`${m.title} ${i + 1}`}
        />
      ))}
    </>
  )
}

const ADD_BTN_CLASS =
  'nodrag rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'

/**
 * 「Add Input:」+ 图标按钮：点对应图标给该节点新增一个该类型输入端点（编号顺延）。
 * image / audio 传入当前端点数则显示该类型的图标按钮；不传则不显示（如首尾帧节点无「加图像」）。
 */
export function AddInputControls({
  id,
  image,
  audio,
}: {
  id: string
  image?: number
  audio?: number
}) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const ImgIcon = KIND.image.icon
  const AudIcon = KIND.audio.icon
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <span>Add Input:</span>
      {image !== undefined && (
        <button
          type="button"
          title="新增一个图像输入端点"
          onClick={() => updateNodeData(id, { imageInputs: image + 1 })}
          className={ADD_BTN_CLASS}
        >
          <ImgIcon className="size-4" />
        </button>
      )}
      {audio !== undefined && (
        <button
          type="button"
          title="新增一个音频输入端点"
          onClick={() => updateNodeData(id, { audioInputs: audio + 1 })}
          className={ADD_BTN_CLASS}
        >
          <AudIcon className="size-4" />
        </button>
      )}
    </div>
  )
}

// —— 端点组具名封装：图像 / 音频各一套 ——

export function ImageInputHandles({ count, baseIndex }: { count: number; baseIndex: number }) {
  return <NumberedInputHandles kind="image" count={count} baseIndex={baseIndex} />
}
export function AudioInputHandles({ count, baseIndex }: { count: number; baseIndex: number }) {
  return <NumberedInputHandles kind="audio" count={count} baseIndex={baseIndex} />
}
