import {
  Background,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
  type Connection,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import { nodeTypes } from './nodes'
import { ZoomSlider } from './ZoomSlider'
import { uploadFilesApi } from '@/lib/api'
import { type FlowNodeType } from '@/lib/types'
import { useActiveProject, useFlowStore } from '@/store/useFlowStore'
import { useThemeStore } from '@/store/useThemeStore'

// 节点吸附偏好的 localStorage 键；网格步长与 <Background> 默认点距（20）一致，吸附落点对齐可见网格
const SNAP_STORAGE_KEY = 'openflow-snap-grid'
const SNAP_GRID: [number, number] = [20, 20]

export function FlowCanvas() {
  const project = useActiveProject()
  const onNodesChange = useFlowStore((s) => s.onNodesChange)
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange)
  const onConnect = useFlowStore((s) => s.onConnect)
  const onReconnect = useFlowStore((s) => s.onReconnect)
  const addAssetNode = useFlowStore((s) => s.addAssetNode)
  const addNode = useFlowStore((s) => s.addNode)
  const removeNode = useFlowStore((s) => s.removeNode)
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  // 实际生效的明暗（system 已解析）：让画布底纹 / 控制按钮 / 缩略图 / 连线跟随主题
  const colorMode = useThemeStore((s) => s.resolved)
  const { screenToFlowPosition } = useReactFlow()

  // 节点吸附（snap-to-grid）：偏好存 localStorage，首次默认开启；由 ZoomSlider 磁吸按钮切换
  const [snapToGrid, setSnapToGrid] = useState(
    () => localStorage.getItem(SNAP_STORAGE_KEY) !== '0',
  )
  useEffect(() => {
    localStorage.setItem(SNAP_STORAGE_KEY, snapToGrid ? '1' : '0')
  }, [snapToGrid])
  const toggleSnap = useCallback(() => setSnapToGrid((v) => !v), [])

  // Delete Edge on Drop：拖动连线端点若松手在空白处（未落到合法 handle）则删除该连线。
  // reconnect 成功会先触发 onReconnect 把标记置 true；未触发即视为落空 → onReconnectEnd 删除。
  const edgeReconnectSuccessful = useRef(true)

  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false
  }, [])

  const handleReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      edgeReconnectSuccessful.current = true
      onReconnect(oldEdge, newConnection)
    },
    [onReconnect],
  )

  const onReconnectEnd = useCallback(
    (_event: MouseEvent | TouchEvent, edge: Edge) => {
      if (!edgeReconnectSuccessful.current) {
        onEdgesChange([{ type: 'remove', id: edge.id }])
      }
      edgeReconnectSuccessful.current = true
    },
    [onEdgesChange],
  )

  // 允许把桌面文件 / 侧栏节点拖入画布（默认浏览器会拦截 drop，需 preventDefault）
  const onDragOver = (event: React.DragEvent) => {
    const types = Array.from(event.dataTransfer.types)
    if (types.includes('Files') || types.includes('application/openflow-node')) {
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
    // 优先处理从侧栏拖入的节点（携带 application/openflow-node）
    const nodePayload = event.dataTransfer.getData('application/openflow-node')
    if (nodePayload) {
      event.preventDefault()
      try {
        const { type, model } = JSON.parse(nodePayload) as {
          type: FlowNodeType
          model?: string
        }
        const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY })
        addNode(type, model, pos)
      } catch (e) {
        console.error('[openflow] 拖入节点解析失败', e)
      }
      return
    }

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
        onReconnectStart={onReconnectStart}
        onReconnect={handleReconnect}
        onReconnectEnd={onReconnectEnd}
        defaultEdgeOptions={{ type: 'straight' }}
        colorMode={colorMode}
        snapToGrid={snapToGrid}
        snapGrid={SNAP_GRID}
        minZoom={0.1}
        maxZoom={4}
        // 松开连线时的吸附半径（默认 20）；调大让「落在附近」也能连上，配合放大的命中区更好连
        connectionRadius={28}
        fitView
        proOptions={{ hideAttribution: true }}
        // 交互：左键拖拽默认框选；平移画布用中键拖拽或按住空格键拖拽
        selectionOnDrag
        panOnDrag={[1]}
        selectionMode={SelectionMode.Partial}
        panActivationKeyCode="Space"
      >
        <Background />
        {/* 左下角竖向堆叠：缩略图在上，缩放条紧贴其下方 */}
        <MiniMap
          pannable
          zoomable
          position="bottom-left"
          style={{ bottom: 60, left: 15, margin: 0 }}
        />
        <ZoomSlider
          position="bottom-left"
          style={{ bottom: 12, left: 15, margin: 0 }}
          snapEnabled={snapToGrid}
          onToggleSnap={toggleSnap}
        />
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
