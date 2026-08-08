import { useMemo } from 'react'
import { buildVideoRequest } from '@/lib/requestBody'
import { VIDEO_VARIANT_DEFAULT } from '@/lib/nodeCatalog'
import type { VideoNode } from '@/lib/types'
import { useActiveProject, useGraphRev } from '@/store/useFlowStore'
import {
  AudioRows,
  ImageThumbs,
  PreviewEmpty,
  PreviewSection,
  VideoThumbs,
} from './ResourcePreview'

/**
 * 输入资源预览（只读，右侧 Inspector 用）——图像节点 ImageInput 的视频版。
 * 视频节点吃三类资源，全都只能靠连线喂进来、此前在面板上完全看不见，故三类一并展示：
 * image_list / audio_list / video_list，全部取自**实际发送**的请求体（同源 buildVideoRequest，
 * 保证预览=实发）：@ 筛选、连线序、frames 变体只取 First/Last 前 2 张等语义都已在其中算好。
 */
export function VideoInput({ node }: { node: VideoNode }) {
  const project = useActiveProject()
  // ⚡ 依赖取 graphRev 而非 project 引用——原来这行裸写在渲染体里，拖任意节点都会每帧重跑
  // 三次 O(E×N) 的上游采集（图/音/视各一次）。理由与用法见 useFlowStore 里 graphRev 的注释。
  const graphRev = useGraphRev()
  const body = useMemo(
    () => (project ? buildVideoRequest(project, node) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graphRev, node.id, node.data],
  )
  const images = body?.images ?? []
  const audios = body?.audios ?? []
  const videos = body?.videos ?? []

  const d = node.data
  const isFrames =
    (d.videoVariant ?? (d.videoTask === 'reference' ? 'reference' : VIDEO_VARIANT_DEFAULT)) ===
    'frames'

  if (images.length === 0 && audios.length === 0 && videos.length === 0) {
    return (
      <PreviewEmpty>
        {isFrames
          ? '暂无输入资源。把图片拖到画布空白处生成「图像素材」节点，连到 First / Last 端点即可定首尾帧（留空则文生视频）。'
          : '暂无输入资源。把图片 / 音频 / 视频拖到画布空白处会生成对应素材节点，连线到本节点的资源端点即可作输入；上游 Prompt 里可用 @ 指定用哪些（留空则文生视频）。'}
      </PreviewEmpty>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {images.length > 0 && (
        <PreviewSection title={isFrames ? '首尾帧（实发列表）' : '输入图（实发列表）'}>
          {/* frames 变体的图序即端点语义（首帧 / 尾帧），标序号不如标语义 */}
          <ImageThumbs urls={images} labels={isFrames ? ['首帧', '尾帧'] : undefined} />
        </PreviewSection>
      )}
      {videos.length > 0 && (
        <PreviewSection title="参考视频（实发列表）">
          <VideoThumbs urls={videos} />
        </PreviewSection>
      )}
      {audios.length > 0 && (
        <PreviewSection title="输入音频（实发列表）">
          <AudioRows urls={audios} />
        </PreviewSection>
      )}
    </div>
  )
}
