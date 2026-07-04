import { Textarea } from '@/components/ui/textarea'
import { collectUpstreamPrompt } from '@/lib/graph'
import {
  type ImageNode as ImageNodeT,
  type LlmNode as LlmNodeT,
  type Project,
  type VideoNode as VideoNodeT,
} from '@/lib/types'
import { useActiveProject } from '@/store/useFlowStore'
import { ImageInput } from './ImageInput'
import { ImageParams } from './ImageParams'
import { LlmParams } from './LlmParams'
import { VideoParams } from './VideoParams'

/**
 * 右侧节点参数面板（Inspector）。
 * 仅在「恰好选中一个 image/video/llm 节点」时出现；节点卡片只显示生成结果，参数都在此编辑。
 * 选中状态来自 React Flow 写在 node.selected 上的标记（store 已通过 applyNodeChanges 维护）。
 */
export function NodeInspector() {
  const project = useActiveProject()
  if (!project) return null
  const selected = project.nodes.filter((n) => n.selected)
  if (selected.length !== 1) return null
  const node = selected[0]
  if (node.type !== 'image' && node.type !== 'video' && node.type !== 'llm') return null
  // key={node.id}：切换选中节点时重置内部状态（上传态 / 文件输入），避免串台
  return <NodeInspectorPanel key={node.id} node={node} project={project} />
}

function NodeInspectorPanel({
  node,
  project,
}: {
  node: ImageNodeT | VideoNodeT | LlmNodeT
  project: Project
}) {
  const id = node.id
  // 运行时实际发送的 prompt（= 所有上游 Prompt 节点文本按连线拼接），只读预览
  const promptPreview = collectUpstreamPrompt(project, id)
  const hasPrompt = promptPreview.trim().length > 0

  return (
    <aside className="absolute right-0 top-0 z-10 flex h-full w-60 flex-col gap-3 overflow-y-auto border-l bg-background p-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">{node.data.label}</span>
        <h2 className="text-sm font-semibold">{node.data.model}</h2>
      </div>

      {/* 图像：输入图（画廊态）+ 模型参数；视频：整套参数；LLM：Model/Temperature/Thinking */}
      {node.type === 'image' ? (
        <>
          <div className="flex flex-col gap-2">
            <span className="text-[11px] text-muted-foreground">输入图（每行一个 URL）</span>
            <ImageInput
              id={id}
              imagesText={node.data.imagesText ?? ''}
              placeholder="输入图片 URL（每行一个，可留空做文生图）"
            />
          </div>
          <ImageParams id={id} data={node.data} />
        </>
      ) : node.type === 'video' ? (
        <VideoParams id={id} data={node.data} />
      ) : (
        <LlmParams id={id} data={node.data} />
      )}

      {/* 最终 Prompt 预览（置底）：运行时发送的 prompt（上游 Prompt 节点文本按连线拼接）。
          readOnly = 只读不可改，可查看/复制；resize-y 让用户拖拽调高。 */}
      <div className="flex flex-col gap-2">
        <span className="text-[11px] text-muted-foreground">最终 Prompt（只读预览）</span>
        <Textarea
          value={hasPrompt ? promptPreview : ''}
          readOnly
          placeholder="未连接含内容的 Prompt 节点"
          // field-sizing-fixed 固定起始高度 + 内部滚动；resize-y 可拖拽调高；
          // cursor-default + bg-muted 弱化「可编辑」暗示，配合 readOnly 表明仅供查看。
          className="field-sizing-fixed h-24 max-h-96 resize-y cursor-default bg-muted/40 text-xs"
        />
      </div>
    </aside>
  )
}
