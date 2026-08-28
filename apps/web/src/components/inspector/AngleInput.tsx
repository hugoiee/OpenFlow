import { useMemo } from 'react'
import { collectUpstreamImageRefs } from '@/lib/graph'
import { buildAngleRequest } from '@/lib/requestBody'
import type { AngleNode } from '@/lib/types'
import { useActiveProject, useGraphRev } from '@/store/useFlowStore'
import { ImageThumbs, PreviewEmpty } from './ResourcePreview'

/**
 * 源图预览（只读，多角度节点的 Inspector 用）。
 * 展示**实际发送**的那一张（与请求预览同源 buildAngleRequest）：多角度恒发单图——
 * 上游 Prompt 里 @ 到图像 → 用被 @ 的第一张，没 @ → 用连线第一张；连了多张时明示只发 1 张。
 */
export function AngleInput({ node }: { node: AngleNode }) {
  const project = useActiveProject()
  // ⚡ 依赖取 graphRev 而非 project 引用（理由见 useFlowStore 里 graphRev 的注释）
  const graphRev = useGraphRev()
  const { urls, connected } = useMemo(
    () =>
      project
        ? {
            urls: buildAngleRequest(project, node).images,
            connected: collectUpstreamImageRefs(project, node.id).length,
          }
        : { urls: [] as string[], connected: 0 },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graphRev, node.id, node.data],
  )

  if (urls.length === 0) {
    return (
      <PreviewEmpty>
        暂无源图。把图片拖到画布空白处会生成「图像素材」节点，连线到本节点的资源端点即可作源图；
        上游图像/多角度节点的生成结果也可直接连入。
      </PreviewEmpty>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <ImageThumbs urls={urls} labels={['源图']} />
      {connected > 1 && (
        <span className="text-[10px] text-muted-foreground">
          已连 {connected} 张，仅发送其中 1 张（默认第一张，可在上游 Prompt 里 @ 指定）
        </span>
      )}
    </div>
  )
}
