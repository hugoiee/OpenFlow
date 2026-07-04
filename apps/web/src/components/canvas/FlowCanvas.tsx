import {
  Background,
  MiniMap,
  ConnectionLineType,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
  type Connection,
  type Edge,
  type OnConnectStart,
  type OnConnectEnd,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useRef, useState } from 'react'
import { nodeTypes } from './nodes'
import { ZoomSlider } from './ZoomSlider'
import { CanvasContextMenu } from './CanvasContextMenu'
import { uploadFilesApi } from '@/lib/api'
import { type FlowNodeType } from '@/lib/types'
import { useActiveProject, useFlowStore } from '@/store/useFlowStore'
import { useThemeStore } from '@/store/useThemeStore'

// 节点吸附偏好的 localStorage 键；网格步长与 <Background> 默认点距（20）一致，吸附落点对齐可见网格
const SNAP_STORAGE_KEY = 'openflow-snap-grid'
const MINIMAP_STORAGE_KEY = 'openflow-minimap'
const SNAP_GRID: [number, number] = [20, 20]

// 拉线松开在空白处时，记录连线从哪个节点的哪一端（source=输出端 / target=输入端）发起，
// 供菜单选中后据方向连线（源→新 或 新→源）。
type ConnectFrom = { nodeId: string; handleType: 'source' | 'target' }

export function FlowCanvas() {
  const project = useActiveProject()
  const onNodesChange = useFlowStore((s) => s.onNodesChange)
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange)
  const onConnect = useFlowStore((s) => s.onConnect)
  const onReconnect = useFlowStore((s) => s.onReconnect)
  const addAssetNode = useFlowStore((s) => s.addAssetNode)
  const addNode = useFlowStore((s) => s.addNode)
  const addConnectedNode = useFlowStore((s) => s.addConnectedNode)
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

  // 缩略图显隐：偏好存 localStorage，首次默认显示；由 ZoomSlider 缩略图按钮切换
  const [minimapOpen, setMinimapOpen] = useState(
    () => localStorage.getItem(MINIMAP_STORAGE_KEY) !== '0',
  )
  useEffect(() => {
    localStorage.setItem(MINIMAP_STORAGE_KEY, minimapOpen ? '1' : '0')
  }, [minimapOpen])
  const toggleMinimap = useCallback(() => setMinimapOpen((v) => !v), [])

  // 画布右键菜单：记录光标处（相对画布容器的 top/left）+ 落点（flow 坐标），点选即在该处建节点
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<{
    top: number
    left: number
    flow: { x: number; y: number }
    // 非空表示菜单由「拉线松开在空白处」触发，选中后按此方向与源节点连线
    connectFrom: ConnectFrom | null
  } | null>(null)

  // 在指定屏幕坐标浮出节点菜单；connectFrom 非空时选中项会与源节点连线
  const openMenuAt = useCallback(
    (clientX: number, clientY: number, connectFrom: ConnectFrom | null) => {
      const rect = wrapperRef.current?.getBoundingClientRect()
      if (!rect) return
      const flow = screenToFlowPosition({ x: clientX, y: clientY })
      // 基本防溢出：菜单约 180×230，靠近右/下边缘时回夹
      const left = Math.max(0, Math.min(clientX - rect.left, rect.width - 180))
      const top = Math.max(0, Math.min(clientY - rect.top, rect.height - 230))
      setMenu({ top, left, flow, connectFrom })
    },
    [screenToFlowPosition],
  )

  const openContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault()
      openMenuAt(event.clientX, event.clientY, null)
    },
    [openMenuAt],
  )

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

  // Add Node On Edge Drop：从 handle 拉线松开在空白处 → 在落点浮出节点菜单，选中即建节点并连线。
  // onConnectStart 记下起点（节点/端别 + 起点屏幕坐标）；onConnectEnd 若未连到合法 handle 即视为落空。
  const connectStartRef = useRef<(ConnectFrom & { x: number; y: number }) | null>(null)

  const onConnectStart = useCallback<OnConnectStart>((event, params) => {
    if (!params.nodeId || !params.handleType) {
      connectStartRef.current = null
      return
    }
    const point = 'clientX' in event ? event : event.changedTouches[0]
    connectStartRef.current = {
      nodeId: params.nodeId,
      handleType: params.handleType,
      x: point?.clientX ?? 0,
      y: point?.clientY ?? 0,
    }
  }, [])

  const onConnectEnd = useCallback<OnConnectEnd>(
    (event, connectionState) => {
      const start = connectStartRef.current
      connectStartRef.current = null
      // 不弹菜单的情形：已连到合法 handle（onConnect 处理）/ 松手落在某个节点上（非空白）/ 并非从节点发起
      if (connectionState.isValid || connectionState.toNode || !start) return
      const point = 'clientX' in event ? event : event.changedTouches[0]
      if (!point) return
      // 仅在确实拉出一段距离后才弹菜单（点一下 handle 不算，避免误触）
      if (Math.hypot(point.clientX - start.x, point.clientY - start.y) < 8) return
      openMenuAt(point.clientX, point.clientY, {
        nodeId: start.nodeId,
        handleType: start.handleType,
      })
    },
    [openMenuAt],
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

  // 连线统一走贝塞尔曲线（default）：旧的 straight/smoothstep 一并归一成曲线。
  // 派生视图态（不入库）：与「已选中节点」相连的边高亮（edge-active）+ 走蚂蚁线（animated）。
  const selectedNodeIds = new Set(
    project.nodes.filter((n) => n.selected).map((n) => n.id),
  )
  const edges = project.edges.map((e) => {
    const active = selectedNodeIds.has(e.source) || selectedNodeIds.has(e.target)
    return {
      ...e,
      type: 'default',
      animated: active,
      className: active ? 'edge-active' : undefined,
    }
  })

  return (
    <div
      ref={wrapperRef}
      className="relative h-full w-full"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <ReactFlow
        // key 让切换项目时画布完全重挂载，避免残留视图状态
        key={project.id}
        nodes={project.nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onReconnectStart={onReconnectStart}
        onReconnect={handleReconnect}
        onReconnectEnd={onReconnectEnd}
        onPaneContextMenu={openContextMenu}
        onPaneClick={() => setMenu(null)}
        onMoveStart={() => setMenu(null)}
        defaultEdgeOptions={{ type: 'default' }}
        connectionLineType={ConnectionLineType.Bezier}
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
        {minimapOpen && (
          <MiniMap
            pannable
            zoomable
            position="bottom-left"
            style={{ bottom: 60, left: 15, margin: 0 }}
          />
        )}
        <ZoomSlider
          position="bottom-left"
          style={{ bottom: 12, left: 15, margin: 0 }}
          snapEnabled={snapToGrid}
          onToggleSnap={toggleSnap}
          minimapEnabled={minimapOpen}
          onToggleMinimap={toggleMinimap}
        />
      </ReactFlow>
      {menu && (
        <CanvasContextMenu
          top={menu.top}
          left={menu.left}
          onClose={() => setMenu(null)}
          onPick={(item) => {
            if (menu.connectFrom) {
              // 由「拉线松开在空白处」触发：建节点并按方向与源节点连线
              addConnectedNode({
                type: item.type,
                model: item.model,
                position: menu.flow,
                from: menu.connectFrom,
              })
            } else {
              addNode(item.type, item.model, menu.flow)
            }
            setMenu(null)
          }}
        />
      )}
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
