import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { nodeTypes } from './nodes'
import { uploadFilesApi } from '@/lib/api'
import { useActiveProject, useFlowStore } from '@/store/useFlowStore'

export function FlowCanvas() {
  const project = useActiveProject()
  const onNodesChange = useFlowStore((s) => s.onNodesChange)
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange)
  const onConnect = useFlowStore((s) => s.onConnect)
  const addAssetNode = useFlowStore((s) => s.addAssetNode)
  const removeNode = useFlowStore((s) => s.removeNode)
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const { screenToFlowPosition } = useReactFlow()

  // 允许把桌面文件拖入画布（默认浏览器会拦截 drop，需 preventDefault）
  const onDragOver = (event: React.DragEvent) => {
    if (Array.from(event.dataTransfer.types).includes('Files')) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    }
  }

  // 建一个素材节点（先占位上传中），上传完成写回 URL；失败移除占位并提示
  const createAsset = async (
    kind: 'image' | 'audio',
    file: File,
    position: { x: number; y: number },
  ) => {
    const id = addAssetNode(kind, position)
    updateNodeData(id, { fileName: file.name })
    try {
      const [url] = await uploadFilesApi([file], kind)
      if (!url) throw new Error('上传未返回 URL')
      updateNodeData(id, { url, uploading: false })
    } catch (e) {
      removeNode(id)
      window.alert(
        `${kind === 'image' ? '图像' : '音频'}素材上传失败：${
          e instanceof Error ? e.message : String(e)
        }`,
      )
    }
  }

  // 把拖入的图片上传后追加到某个图像/视频节点的输入图文本框
  const appendImagesToNode = async (nodeId: string, files: File[]) => {
    try {
      const urls = await uploadFilesApi(files)
      const state = useFlowStore.getState()
      const node = state.projects
        .find((p) => p.id === state.activeProjectId)
        ?.nodes.find((n) => n.id === nodeId)
      const prev =
        node && (node.type === 'image' || node.type === 'video')
          ? (node.data.imagesText ?? '')
          : ''
      const next = [prev.trim(), ...urls].filter(Boolean).join('\n')
      updateNodeData(nodeId, { imagesText: next })
    } catch (e) {
      window.alert(`图片上传失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // 把拖入的音频上传（走音频端点）后追加到某个视频节点的输入音频文本框
  const appendAudiosToNode = async (nodeId: string, files: File[]) => {
    try {
      const urls = await uploadFilesApi(files, 'audio')
      const state = useFlowStore.getState()
      const node = state.projects
        .find((p) => p.id === state.activeProjectId)
        ?.nodes.find((n) => n.id === nodeId)
      const prev = node && node.type === 'video' ? (node.data.audiosText ?? '') : ''
      const next = [prev.trim(), ...urls].filter(Boolean).join('\n')
      updateNodeData(nodeId, { audiosText: next })
    } catch (e) {
      window.alert(`音频上传失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const onDrop = (event: React.DragEvent) => {
    const files = Array.from(event.dataTransfer.files ?? [])
    if (files.length === 0) return
    event.preventDefault()

    const images = files.filter((f) => f.type.startsWith('image/'))
    const audios = files.filter((f) => f.type.startsWith('audio/'))
    if (images.length === 0 && audios.length === 0) {
      window.alert('仅支持拖入图像或音频文件')
      return
    }

    const dropPos = screenToFlowPosition({ x: event.clientX, y: event.clientY })

    // 是否正好落在某个图像/视频节点上 → 图片直接追加为该节点输入图
    const nodeEl = (event.target as HTMLElement | null)?.closest('.react-flow__node')
    const targetId = nodeEl?.getAttribute('data-id') ?? null
    const state = useFlowStore.getState()
    const targetNode = targetId
      ? state.projects
          .find((p) => p.id === state.activeProjectId)
          ?.nodes.find((n) => n.id === targetId)
      : undefined
    const droppedOnGenNode =
      !!targetNode && (targetNode.type === 'image' || targetNode.type === 'video')
    // 音频只对视频节点有意义：落在视频节点上→追加为其输入音频，否则建音频素材
    const droppedOnVideoNode = !!targetNode && targetNode.type === 'video'

    // 待新建的素材节点列表：图片 / 音频均仅在「未落在对应生成节点上」时才建素材
    const assetJobs: { kind: 'image' | 'audio'; file: File }[] = []
    if (images.length > 0) {
      if (droppedOnGenNode && targetId) {
        void appendImagesToNode(targetId, images)
      } else {
        images.forEach((file) => assetJobs.push({ kind: 'image', file }))
      }
    }
    if (audios.length > 0) {
      if (droppedOnVideoNode && targetId) {
        void appendAudiosToNode(targetId, audios)
      } else {
        audios.forEach((file) => assetJobs.push({ kind: 'audio', file }))
      }
    }

    // 多个素材错开摆放，避免完全重叠
    assetJobs.forEach((job, i) => {
      void createAsset(job.kind, job.file, {
        x: dropPos.x + i * 32,
        y: dropPos.y + i * 32,
      })
    })
  }

  if (!project) return null

  // 用 straight 让连线走两端点间最短直线；旧的 smoothstep 折线也一并归一成直线
  const edges = project.edges.map((e) =>
    e.type && e.type !== 'smoothstep' ? e : { ...e, type: 'straight' },
  )

  return (
    <div className="relative h-full w-full" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        // key 让切换项目时画布完全重挂载，避免残留视图状态
        key={project.id}
        nodes={project.nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        defaultEdgeOptions={{ type: 'straight' }}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
        {/* 缩略图挪到左下角，紧贴 4 个控制按钮右侧 */}
        <MiniMap pannable zoomable position="bottom-left" style={{ left: 40 }} />
      </ReactFlow>
    </div>
  )
}

export function FlowCanvasWithProvider() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  )
}
