import { ImagePlus, Music4, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { audioInputHandleId, imageInputHandleId } from '@/lib/graph'
import { type HandleTone } from '@/lib/handleTypes'
import { useFlowStore } from '@/store/useFlowStore'
import { NodeHandle } from './NodeHandle'

type InputKind = 'image' | 'audio'

const KIND: Record<
  InputKind,
  { tone: HandleTone; handleId: (i: number) => string; label: string; title: string; icon: LucideIcon; addLabel: string }
> = {
  image: {
    tone: 'image',
    handleId: imageInputHandleId,
    label: 'Image',
    title: '图像输入',
    icon: ImagePlus,
    addLabel: '添加图像输入',
  },
  audio: {
    tone: 'audio',
    handleId: audioInputHandleId,
    label: 'Audio',
    title: '音频输入',
    icon: Music4,
    addLabel: '添加音频输入',
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

/** 「添加…输入」text button：给该节点递增一个对应类型的输入端点（编号顺延）。 */
function AddInputButton({ id, kind, count }: { id: string; kind: InputKind; count: number }) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const m = KIND[kind]
  const Icon = m.icon
  const onAdd = () =>
    updateNodeData(id, kind === 'image' ? { imageInputs: count + 1 } : { audioInputs: count + 1 })
  return (
    <Button
      size="sm"
      variant="ghost"
      className="nodrag h-8 gap-1.5 px-1.5 text-xs font-normal text-muted-foreground hover:text-foreground"
      title={`新增一个${m.title}端点`}
      onClick={onAdd}
    >
      <Icon className="size-3.5 opacity-70" />
      {m.addLabel}
    </Button>
  )
}

// —— 具名封装：图像/音频各一套，供各节点直接用（保持既有图像用法不变） ——

export function ImageInputHandles({ count, baseIndex }: { count: number; baseIndex: number }) {
  return <NumberedInputHandles kind="image" count={count} baseIndex={baseIndex} />
}
export function AddImageInputButton({ id, count }: { id: string; count: number }) {
  return <AddInputButton id={id} kind="image" count={count} />
}
export function AudioInputHandles({ count, baseIndex }: { count: number; baseIndex: number }) {
  return <NumberedInputHandles kind="audio" count={count} baseIndex={baseIndex} />
}
export function AddAudioInputButton({ id, count }: { id: string; count: number }) {
  return <AddInputButton id={id} kind="audio" count={count} />
}
