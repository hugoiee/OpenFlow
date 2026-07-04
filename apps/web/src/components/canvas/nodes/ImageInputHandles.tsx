import { ImagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { imageInputHandleId } from '@/lib/graph'
import { useFlowStore } from '@/store/useFlowStore'
import { NodeHandle } from './NodeHandle'

/**
 * 一组「图像输入」端点（编号 1..count）：绿色环形端点，标签 Image 1 / Image 2…（悬停/选中显示）。
 * baseIndex = 该节点在这组端点之前已占用的左侧端点数（图像节点 =1[Prompt]，LLM 节点 =2[Prompt+System]）。
 * 端点 handle id 为 image-0、image-1…（见 imageInputHandleId），供连线路由与 collectUpstreamImages 排序。
 */
export function ImageInputHandles({ count, baseIndex }: { count: number; baseIndex: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <NodeHandle
          key={i}
          type="target"
          id={imageInputHandleId(i)}
          index={baseIndex + i}
          tone="image"
          label={`Image ${i + 1}`}
          title={`图像输入 ${i + 1}`}
        />
      ))}
    </>
  )
}

/** 「添加图像输入」按钮：给该节点递增一个图像输入端点（编号顺延）。 */
export function AddImageInputButton({ id, count }: { id: string; count: number }) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  return (
    <Button
      size="sm"
      variant="outline"
      className="nodrag h-8 gap-1.5 px-2 text-xs"
      title="新增一个图像输入端点"
      onClick={() => updateNodeData(id, { imageInputs: count + 1 })}
    >
      <ImagePlus className="size-3.5 opacity-70" />
      添加图像输入
    </Button>
  )
}
