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
  type IsValidConnection,
  type Node,
  type OnConnectStart,
  type OnConnectEnd,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { nodeTypes } from './nodes'
import { ZoomSlider } from './ZoomSlider'
import { CanvasContextMenu } from './CanvasContextMenu'
import { SelectionContextMenu } from './SelectionContextMenu'
import { MultiConnectHandle } from './MultiConnectHandle'
import { useSpacePanGuard } from '@/hooks/useSpacePanGuard'
import { uploadFilesApi } from '@/lib/api'
import { edgeColorForSource, isValidTypedConnection } from '@/lib/handleTypes'
import { type FlowNode } from '@/lib/types'
import { useActiveProject, useFlowStore } from '@/store/useFlowStore'
import { useThemeStore } from '@/store/useThemeStore'

// 节点吸附偏好的 localStorage 键；网格步长与 <Background> 默认点距（20）一致，吸附落点对齐可见网格
const SNAP_STORAGE_KEY = 'openflow-snap-grid'
const MINIMAP_STORAGE_KEY = 'openflow-minimap'
const TRACKPAD_STORAGE_KEY = 'openflow-trackpad'
const SNAP_GRID: [number, number] = [20, 20]

/*
 * ⚡ 下面三个 props 必须是模块级常量——每次渲染新建对象/数组会各自惹出一摊每帧开销：
 * - defaultEdgeOptions 在 React Flow 的 fieldsToTrack 里：新引用 → 每次渲染一次 store.setState
 *   → 唤醒全部订阅者跑 selector（N 个 NodeWrapper + 每个 Handle 两个）。
 *   ⚠️ 别图省事删掉这个 prop：Handle 的 onConnectExtended 会把它合进新连边的 params，
 *   删了新建的 edge 会缺 type 字段落库（渲染期虽会归一成曲线，但库里数据不一致）。
 * - panOnDrag 不在 fieldsToTrack，但新数组会击穿 GraphView / FlowRenderer 的 memo →
 *   ZoomPane 的 effect 依赖含它 → 每帧重绑一次 d3-zoom。
 * - proOptions 只被 Attribution 读且 hideAttribution 时直接 return null（收益≈0，一并提上来齐整）。
 */
const DEFAULT_EDGE_OPTIONS = { type: 'default' } as const
const PRO_OPTIONS = { hideAttribution: true } as const
const PAN_ON_DRAG = [1]

// 拉线松开在空白处时，记录连线从哪个节点的哪一端（source=输出端 / target=输入端）发起，
// 及该端点的 id（多端点节点如 Any LLM 的 'system' 用来连回精确端点；默认端点为 null）。
// 供菜单选中后据方向 + 端点连线（源→新 或 新→源）。
type ConnectFrom = {
  nodeId: string
  handleType: 'source' | 'target'
  handleId: string | null
}

export function FlowCanvas() {
  const project = useActiveProject()
  const onNodesChange = useFlowStore((s) => s.onNodesChange)
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange)
  const onConnect = useFlowStore((s) => s.onConnect)
  const onReconnect = useFlowStore((s) => s.onReconnect)
  const addAssetNode = useFlowStore((s) => s.addAssetNode)
  const addNode = useFlowStore((s) => s.addNode)
  const addConnectedNode = useFlowStore((s) => s.addConnectedNode)
  const addNodeWithSelectedResources = useFlowStore((s) => s.addNodeWithSelectedResources)
  const removeNode = useFlowStore((s) => s.removeNode)
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const groupSelectedNodes = useFlowStore((s) => s.groupSelectedNodes)
  const ungroupNode = useFlowStore((s) => s.ungroupNode)
  const arrangeSelectedNodes = useFlowStore((s) => s.arrangeSelectedNodes)
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

  // 缩略图显隐：偏好存 localStorage，首次默认隐藏（缩略图随节点变动重绘，省点开销）；由 ZoomSlider 缩略图按钮切换
  const [minimapOpen, setMinimapOpen] = useState(
    () => localStorage.getItem(MINIMAP_STORAGE_KEY) === '1',
  )
  useEffect(() => {
    localStorage.setItem(MINIMAP_STORAGE_KEY, minimapOpen ? '1' : '0')
  }, [minimapOpen])
  const toggleMinimap = useCallback(() => setMinimapOpen((v) => !v), [])

  // 触控板模式：双指滑动=平移、捏合=缩放（Figma 式）；默认关（鼠标模式：滚轮=缩放）；由 ZoomSlider 模式按钮切换
  const [trackpadMode, setTrackpadMode] = useState(
    () => localStorage.getItem(TRACKPAD_STORAGE_KEY) === '1',
  )
  useEffect(() => {
    localStorage.setItem(TRACKPAD_STORAGE_KEY, trackpadMode ? '1' : '0')
  }, [trackpadMode])
  const toggleTrackpad = useCallback(() => setTrackpadMode((v) => !v), [])

  // 空格平移守卫：焦点残留在节点输入框时，指针在空白处按住空格不再被输入框吃成一串空格
  useSpacePanGuard()

  // 画布右键菜单：记录光标处（相对画布容器的 top/left）+ 落点（flow 坐标），点选即在该处建节点
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<{
    top: number
    left: number
    flow: { x: number; y: number }
    // 非空表示菜单由「拉线松开在空白处」触发，选中后按此方向与源节点连线
    connectFrom: ConnectFrom | null
    // true 表示菜单由「批量连线按钮拖到空白处」触发，选中后新建节点并把选中资源全连上
    connectSelected?: boolean
  } | null>(null)

  // 选中节点的右键菜单（分组 / 整理 / 取消分组）：右键点在节点或框选区上触发。
  const [actionMenu, setActionMenu] = useState<{
    top: number
    left: number
    canGroup: boolean
    canArrange: boolean
    canUngroup: boolean
    /** 取消分组要释放的容器 id（选中的容器 + 右键点中的容器）。 */
    groupIds: string[]
  } | null>(null)

  // 在指定屏幕坐标浮出节点菜单；connectFrom 非空时选中项会与源节点连线
  const openMenuAt = useCallback(
    (
      clientX: number,
      clientY: number,
      connectFrom: ConnectFrom | null,
      connectSelected = false,
    ) => {
      const rect = wrapperRef.current?.getBoundingClientRect()
      if (!rect) return
      const flow = screenToFlowPosition({ x: clientX, y: clientY })
      // 基本防溢出：菜单约 180×230，靠近右/下边缘时回夹
      const left = Math.max(0, Math.min(clientX - rect.left, rect.width - 180))
      const top = Math.max(0, Math.min(clientY - rect.top, rect.height - 230))
      setActionMenu(null) // 与选中操作菜单互斥
      setMenu({ top, left, flow, connectFrom, connectSelected })
    },
    [screenToFlowPosition],
  )

  // 批量连线按钮拖到空白处：在落点弹建节点菜单，选中后建节点并把选中资源一并连上
  const openMenuForSelectedResources = useCallback(
    (clientX: number, clientY: number) => openMenuAt(clientX, clientY, null, true),
    [openMenuAt],
  )

  const openContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault()
      openMenuAt(event.clientX, event.clientY, null)
    },
    [openMenuAt],
  )

  const openSelectionMenu = useCallback((event: React.MouseEvent, node?: FlowNode) => {
    const state = useFlowStore.getState()
    const proj = state.projects.find((p) => p.id === state.activeProjectId)
    if (!proj) return
    const selected = proj.nodes.filter((n) => n.selected)
    // 可分组/整理的对象：选中的、非容器、且未属于任何组的节点
    const groupable = selected.filter((n) => n.type !== 'group' && !n.parentId)
    // 可取消分组的容器：选中的 group 节点 +（若右键点在某个 group 上）该 group
    const groupIds = new Set(selected.filter((n) => n.type === 'group').map((n) => n.id))
    if (node?.type === 'group') groupIds.add(node.id)
    const canGroup = groupable.length >= 2
    const canArrange = groupable.length >= 2
    const canUngroup = groupIds.size > 0
    if (!canGroup && !canArrange && !canUngroup) return
    event.preventDefault()
    const rect = wrapperRef.current?.getBoundingClientRect()
    if (!rect) return
    const left = Math.max(0, Math.min(event.clientX - rect.left, rect.width - 180))
    const top = Math.max(0, Math.min(event.clientY - rect.top, rect.height - 140))
    setMenu(null) // 与加节点菜单互斥
    setActionMenu({ top, left, canGroup, canArrange, canUngroup, groupIds: [...groupIds] })
  }, [])

  // ⚡ 必须是稳定引用：NodeRenderer 会把 onNodeContextMenu 原样传给每一个 memo 化的 NodeWrapper，
  // 传内联箭头 → 逐层击穿 GraphView / NodeRenderer / 全部 NodeWrapper 的 memo → 拖一个节点时
  // 画布上**所有**节点组件每帧重渲染（30+ 节点卡顿的主因）。onSelectionContextMenu 走同一条链。
  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => openSelectionMenu(event, node as FlowNode),
    [openSelectionMenu],
  )
  const handleSelectionContextMenu = useCallback(
    (event: React.MouseEvent) => openSelectionMenu(event),
    [openSelectionMenu],
  )

  const closeMenus = useCallback(() => {
    setMenu(null)
    setActionMenu(null)
  }, [])

  /*
   * 交互期（平移 / 缩放 / 拖节点 / 框选）给容器打 .canvas-interacting，让 CSS 关掉画布内的
   * hover 效果与 transition：画布内容在静止指针下滑动时，:hover 会在几十个节点/端点/连线之间
   * 反复切换，持续触发端点光环、端点标签淡入、连线变色变粗的动画与样式重算——低配机器上这是
   * 平移卡顿的大头。直接操作 classList 而非走 React state，免得为这事多两次渲染。
   * React Flow 自己只在 mousedown 平移时给 pane 加 .dragging（触控板双指平移、缩放、拖节点、
   * 框选都没有），所以四条路径统一由这里手动开关。
   * 用计数器而非布尔：拖节点碰到画布边缘会触发自动平移，onMoveStart/onMoveEnd 会与
   * onNodeDragStart/Stop 交叠，用布尔会被先结束的那条提前摘掉类。
   */
  const interactDepth = useRef(0)
  const beginInteract = useCallback(() => {
    if (interactDepth.current++ === 0) {
      wrapperRef.current?.classList.add('canvas-interacting')
    }
  }, [])
  const endInteract = useCallback(() => {
    if (--interactDepth.current <= 0) {
      interactDepth.current = 0
      wrapperRef.current?.classList.remove('canvas-interacting')
    }
  }, [])
  // 平移开始时顺带收起右键菜单（原 onMoveStart 的职责）
  const onInteractStart = useCallback(() => {
    closeMenus()
    beginInteract()
  }, [closeMenus, beginInteract])

  // 兜底：交互事件万一没成对触发（onMoveEnd 在 panOnScroll 下有延迟、指针移出窗口等），
  // 画布会永久卡在 interacting 态（hover 全失效）。指针抬起/窗口失焦时无条件复位。
  useEffect(() => {
    const reset = () => {
      interactDepth.current = 0
      wrapperRef.current?.classList.remove('canvas-interacting')
    }
    window.addEventListener('pointerup', reset)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('pointerup', reset)
      window.removeEventListener('blur', reset)
    }
  }, [])

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
      handleId: params.handleId ?? null,
      x: point?.clientX ?? 0,
      y: point?.clientY ?? 0,
    }
  }, [])

  // 连接校验：图像端点只接图像源、Prompt/System 端点只接文本源（视频等混合口不限）。
  // 防止把 Prompt 误连到图像端点（文本被吞）或把图像误连到文本端点（漏进多模态）。
  const isValidConnection = useCallback<IsValidConnection>((conn) => {
    const state = useFlowStore.getState()
    const proj = state.projects.find((p) => p.id === state.activeProjectId)
    if (!proj) return true
    const src = proj.nodes.find((n) => n.id === conn.source)
    const tgt = proj.nodes.find((n) => n.id === conn.target)
    return isValidTypedConnection(src, tgt, conn.targetHandle)
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
        handleId: start.handleId,
      })
    },
    [openMenuAt],
  )

  // 允许把桌面文件拖入画布建素材节点（默认浏览器会拦截 drop，需 preventDefault）。
  // 建「生成类」节点只有画布右键新建与端点拉线两条路，故这里不再接受节点类型的拖拽载荷。
  const onDragOver = (event: React.DragEvent) => {
    if (Array.from(event.dataTransfer.types).includes('Files')) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    }
  }

  // 建一个素材节点（先占位上传中），上传完成写回 URL；失败移除占位并提示
  const createAsset = async (
    kind: 'image' | 'audio' | 'video',
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
      const label = kind === 'image' ? '图像' : kind === 'video' ? '视频' : '音频'
      window.alert(`${label}素材上传失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const onDrop = (event: React.DragEvent) => {
    const files = Array.from(event.dataTransfer.files ?? [])
    if (files.length === 0) return
    event.preventDefault()

    // 桌面拖入的图像 / 音频 / 视频文件一律在落点建「素材」节点（纯源，连线到下游节点作输入）。
    // 这是把资源送进画布的唯一入口——不再支持「拖到已有节点上追加」。
    const assetJobs: { kind: 'image' | 'audio' | 'video'; file: File }[] = []
    files.forEach((file) => {
      if (file.type.startsWith('image/')) assetJobs.push({ kind: 'image', file })
      else if (file.type.startsWith('audio/')) assetJobs.push({ kind: 'audio', file })
      else if (file.type.startsWith('video/')) assetJobs.push({ kind: 'video', file })
    })
    if (assetJobs.length === 0) {
      window.alert('仅支持拖入图像 / 音频 / 视频文件')
      return
    }

    const dropPos = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    // 多个素材错开摆放，避免完全重叠
    assetJobs.forEach((job, i) => {
      void createAsset(job.kind, job.file, {
        x: dropPos.x + i * 32,
        y: dropPos.y + i * 32,
      })
    })
  }

  // 连线统一走贝塞尔曲线（default）：旧的 straight/smoothstep 一并归一成曲线。
  // 派生视图态（不入库）：与「已选中节点」相连的边高亮（edge-active，纯换色，无动画）。
  // 连线着色：**默认态一律画成安静的淡灰细线**（见 index.css），类型色只经 CSS 变量
  // --edge-color 下发（照 NodeHandle 的 --handle-color 写法），由 CSS 在 hover / edge-active /
  // selected 时才取用——连线一多也不抢注意力，需要看关系时再上色。
  // ⚡ useMemo 稳定引用：依赖只取 edges + 选中签名——拖动节点（仅改 nodes）时
  // project.edges 引用不变、selectedSig 不变 → 复用同一 edges 数组，避免每帧都吐给 React Flow
  // 全新的 edge/style 对象、触发全量边重算重绘（颜色只随源节点类型变，故不入依赖）。
  const selectedSig = project
    ? project.nodes
        .filter((n) => n.selected)
        .map((n) => n.id)
        .sort()
        .join('|')
    : ''
  const edges = useMemo(() => {
    if (!project) return []
    const selectedSet = new Set(selectedSig ? selectedSig.split('|') : [])
    const nodeById = new Map(project.nodes.map((n) => [n.id, n]))
    return project.edges.map((e) => {
      const active = selectedSet.has(e.source) || selectedSet.has(e.target)
      const color = edgeColorForSource(nodeById.get(e.source))
      // 清掉旧数据里可能存过的内联 stroke（会压过样式表的默认淡灰）；类型色改走 CSS 变量
      const style: CSSProperties = { ...e.style, stroke: undefined }
      if (color) (style as Record<string, string>)['--edge-color'] = color
      return {
        ...e,
        type: 'default',
        className: active ? 'edge-active' : undefined,
        style,
        // 隐形命中带（默认 20 流坐标，放大后更宽）收窄一点，少吞节点附近的点击
        interactionWidth: 12,
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.edges, selectedSig])

  if (!project) return null

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
        isValidConnection={isValidConnection}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onReconnectStart={onReconnectStart}
        onReconnect={handleReconnect}
        onReconnectEnd={onReconnectEnd}
        onPaneContextMenu={openContextMenu}
        onNodeContextMenu={handleNodeContextMenu}
        onSelectionContextMenu={handleSelectionContextMenu}
        onPaneClick={closeMenus}
        defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
        connectionLineType={ConnectionLineType.Bezier}
        colorMode={colorMode}
        snapToGrid={snapToGrid}
        snapGrid={SNAP_GRID}
        minZoom={0.1}
        maxZoom={4}
        // 松开连线时的吸附半径（默认 20）；调大让「落在附近」也能连上，配合放大的命中区更好连
        connectionRadius={28}
        fitView
        proOptions={PRO_OPTIONS}
        onMoveStart={onInteractStart}
        onMoveEnd={endInteract}
        onNodeDragStart={beginInteract}
        onNodeDragStop={endInteract}
        onSelectionStart={beginInteract}
        onSelectionEnd={endInteract}
        // 交互：左键拖拽默认框选；平移画布用中键拖拽或按住空格键拖拽
        selectionOnDrag
        panOnDrag={PAN_ON_DRAG}
        selectionMode={SelectionMode.Partial}
        panActivationKeyCode="Space"
        // 鼠标/触控板模式：鼠标=滚轮缩放；触控板=双指滑动平移（捏合缩放两模式都由 zoomOnPinch 处理，
        // 浏览器把触控板捏合上报为 ctrl+wheel）
        panOnScroll={trackpadMode}
        zoomOnScroll={!trackpadMode}
        zoomOnPinch
      >
        <Background />
        {/* 框选 ≥2 个资源节点时，选区中心浮出批量连线按钮（拖到目标节点即可一并连线） */}
        <MultiConnectHandle onDropOnPane={openMenuForSelectedResources} />
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
          trackpadEnabled={trackpadMode}
          onToggleTrackpad={toggleTrackpad}
        />
      </ReactFlow>
      {menu && (
        <CanvasContextMenu
          top={menu.top}
          left={menu.left}
          onClose={() => setMenu(null)}
          onPick={(item) => {
            if (menu.connectSelected) {
              // 由「批量连线按钮拖到空白处」触发：建节点并把选中的资源节点全连到它的 res 端点
              addNodeWithSelectedResources({
                type: item.type,
                model: item.model,
                position: menu.flow,
                videoVariant: item.videoVariant,
              })
            } else if (menu.connectFrom) {
              // 由「拉线松开在空白处」触发：建节点并按方向与源节点连线
              addConnectedNode({
                type: item.type,
                model: item.model,
                position: menu.flow,
                from: menu.connectFrom,
                videoVariant: item.videoVariant,
              })
            } else {
              addNode(item.type, item.model, menu.flow, item.videoVariant)
            }
            setMenu(null)
          }}
        />
      )}
      {actionMenu && (
        <SelectionContextMenu
          top={actionMenu.top}
          left={actionMenu.left}
          canGroup={actionMenu.canGroup}
          canArrange={actionMenu.canArrange}
          canUngroup={actionMenu.canUngroup}
          onGroup={() => {
            groupSelectedNodes()
            setActionMenu(null)
          }}
          onArrange={() => {
            arrangeSelectedNodes()
            setActionMenu(null)
          }}
          onUngroup={() => {
            actionMenu.groupIds.forEach((id) => ungroupNode(id))
            setActionMenu(null)
          }}
          onClose={() => setActionMenu(null)}
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
