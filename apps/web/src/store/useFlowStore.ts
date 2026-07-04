import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  reconnectEdge,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import { create } from 'zustand'
import {
  createProjectApi,
  deleteProjectApi,
  listProjects,
  updateProjectApi,
} from '@/lib/api'
import { newId } from '@/lib/id'
import {
  NANO_ASPECT_DEFAULT,
  NANO_IMAGE_SIZE_DEFAULT,
  NANO_VERSION_DEFAULT,
  IMAGE_SIZE_DEFAULT,
  SEEDANCE_DURATION_DEFAULT,
  SEEDANCE_RATIO_DEFAULT,
  SEEDANCE_RESOLUTION_DEFAULT,
  SEEDANCE_VERSION_DEFAULT,
  VIDEO_TASK_DEFAULT,
} from '@/lib/nodeCatalog'
import { type FlowNode, type FlowNodeType, type Project } from '@/lib/types'

type HomeView = 'grid' | 'list'

// 首页宫格/列表偏好是纯 UI 偏好，仍存 localStorage（不进后端）
const HOME_VIEW_KEY = 'openflow-home-view'
function loadHomeView(): HomeView {
  return localStorage.getItem(HOME_VIEW_KEY) === 'list' ? 'list' : 'grid'
}

type FlowState = {
  projects: Project[]
  activeProjectId: string | null
  homeView: HomeView
  loaded: boolean

  // 数据加载
  loadProjects: () => Promise<void>

  // 项目管理
  addProject: (name?: string) => Promise<string>
  renameProject: (id: string, name: string) => void
  deleteProject: (id: string) => void
  setActiveProject: (id: string) => void
  setHomeView: (view: HomeView) => void

  // 画布操作（作用于当前项目）
  onNodesChange: (changes: NodeChange<FlowNode>[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  /** 拖动连线端点重连到新的 handle（Delete Edge on Drop：拖到空白处则由 FlowCanvas 删除该边）。 */
  onReconnect: (oldEdge: Edge, newConnection: Connection) => void
  addNode: (type: FlowNodeType, model?: string, position?: { x: number; y: number }) => void
  /** 在指定画布坐标新建一个素材节点（上传中态），返回新节点 id。 */
  addAssetNode: (kind: 'image' | 'audio', position: { x: number; y: number }) => string
  /** 删除某个节点（如素材上传失败时移除占位节点）。 */
  removeNode: (nodeId: string) => void
  updateNodeData: (nodeId: string, data: Partial<FlowNode['data']>) => void
  /** 同 updateNodeData，但显式指定项目：供异步回调（如 Agent 建任务后写 taskId）使用，不受「当前激活项目」切换影响。 */
  updateNodeDataInProject: (
    projectId: string,
    nodeId: string,
    data: Partial<FlowNode['data']>,
  ) => void
  /** Agent：在现有内容下方新建一组「Prompt → 图像」节点并连线，返回两节点 id（无激活项目返回 null）。 */
  addAgentGeneration: (input: {
    prompt: string
    model: string
    title?: string
  }) => { promptNodeId: string; imageNodeId: string } | null
  /**
   * 从某个节点的 handle 拉线松开在空白处后新建一个节点并与源节点连线。
   * from.handleType='source'（从输出端拉出）→ 新节点作下游 target（源→新）；
   * from.handleType='target'（从输入端拉出）→ 新节点作上游 source（新→源）。
   * 若新节点在该方向上没有对应 handle（如从输出端拉出却选了无输入口的 Prompt），只建节点不连线。
   */
  addConnectedNode: (input: {
    type: FlowNodeType
    model?: string
    position: { x: number; y: number }
    from: { nodeId: string; handleType: 'source' | 'target' }
  }) => void
}

function createNode(
  type: FlowNodeType,
  count: number,
  model = '',
  positionOverride?: { x: number; y: number },
): FlowNode {
  // 拖入时用指针落点；点按时让新节点错落排布，避免完全重叠
  const position = positionOverride ?? { x: 80 + (count % 4) * 60, y: 80 + count * 50 }
  if (type === 'prompt') {
    return {
      id: newId('n_'),
      type: 'prompt',
      position,
      data: { label: 'Prompt', text: '' },
    }
  }
  if (type === 'image') {
    // 图像生成节点：带具名模型 + 可调选项默认值；运行状态/结果初始为空。
    // 统一带上 Image 2 与 Nano Banana 两套字段默认值，后端按 model 取舍。
    return {
      id: newId('n_'),
      type: 'image',
      position,
      data: {
        label: '图像',
        model,
        imagesText: '',
        size: IMAGE_SIZE_DEFAULT,
        n: 1,
        quality: 'auto',
        version: NANO_VERSION_DEFAULT,
        aspectRatio: NANO_ASPECT_DEFAULT,
        imageSize: NANO_IMAGE_SIZE_DEFAULT,
        running: false,
        result: [],
      },
    }
  }
  // 视频生成节点（seedance）：带具名模型 + 可调选项默认值；运行状态/结果初始为空
  return {
    id: newId('n_'),
    type: 'video',
    position,
    data: {
      label: '视频',
      model,
      imagesText: '',
      version: SEEDANCE_VERSION_DEFAULT,
      videoTask: VIDEO_TASK_DEFAULT,
      resolution: SEEDANCE_RESOLUTION_DEFAULT,
      ratio: SEEDANCE_RATIO_DEFAULT,
      duration: SEEDANCE_DURATION_DEFAULT,
      running: false,
      result: [],
    },
  }
}

// Agent 摆放新节点时估算已有节点的高度（React Flow 尚未测量到时的兜底），用于找画布底部空位
const AGENT_PLACE_FALLBACK_HEIGHT: Record<string, number> = {
  prompt: 190,
  image: 380,
  video: 400,
  asset: 220,
}

// 画布高频编辑 → 防抖把激活项目整体 PUT 回后端
const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {}
function scheduleSave(project: Project) {
  clearTimeout(saveTimers[project.id])
  saveTimers[project.id] = setTimeout(() => {
    updateProjectApi(project.id, {
      name: project.name,
      nodes: project.nodes,
      edges: project.edges,
    }).catch((e) => console.error('[openflow] 保存项目失败', e))
  }, 500)
}

export const useFlowStore = create<FlowState>()((set, get) => {
  // 更新当前项目并安排防抖保存
  const patchActive = (updater: (project: Project) => Project) =>
    set((state) => {
      if (!state.activeProjectId) return state
      const projects = state.projects.map((p) =>
        p.id === state.activeProjectId ? updater(p) : p,
      )
      const active = projects.find((p) => p.id === state.activeProjectId)
      if (active) scheduleSave(active)
      return { projects }
    })

  return {
    projects: [],
    activeProjectId: null,
    homeView: loadHomeView(),
    loaded: false,

    loadProjects: async () => {
      const dtos = await listProjects()
      const projects: Project[] = dtos.map((d) => ({
        id: d.id,
        name: d.name,
        // image/video 节点的 running/error 是瞬时态：载入时复位为非运行态，避免卡在「生成中…」。
        // 但保留 taskId（与 result）：若任务仍在飞，节点 mount 时凭 taskId 重连轮询（关页面不丢结果）。
        nodes: (d.nodes as FlowNode[]).map((rawNode) => {
          // 清洗坏尺寸：React Flow 可能把 width/height 持久化成 0（测量竞态）。0 会被当作
          // 显式尺寸套到节点外层容器 → 节点塌成 0 宽、整体不可见（如 Prompt 节点重开看不到）。
          // 剔除 ≤0 的 width/height/measured，让 RF 重新测量自适应（渲染出来后尺寸自愈为正值）。
          let node = rawNode
          const badW = typeof rawNode.width === 'number' && rawNode.width <= 0
          const badH = typeof rawNode.height === 'number' && rawNode.height <= 0
          if (badW || badH) {
            node = { ...rawNode }
            delete node.width
            delete node.height
            delete node.measured
          }
          if (node.type === 'image') {
            return { ...node, data: { ...node.data, running: false, error: undefined } }
          }
          if (node.type === 'video') {
            return { ...node, data: { ...node.data, running: false, error: undefined } }
          }
          // 素材节点：uploading 是瞬时态，载入时复位，避免刷新后卡在「上传中…」
          if (node.type === 'asset') {
            return { ...node, data: { ...node.data, uploading: false } }
          }
          return node
        }),
        edges: d.edges as Edge[],
      }))
      set({ projects, loaded: true })
    },

    addProject: async (name) => {
      const dto = await createProjectApi(name?.trim() || '未命名项目')
      const project: Project = {
        id: dto.id,
        name: dto.name,
        nodes: dto.nodes as FlowNode[],
        edges: dto.edges as Edge[],
      }
      set((state) => ({
        projects: [project, ...state.projects],
        activeProjectId: project.id,
      }))
      return project.id
    },

    renameProject: (id, name) => {
      const trimmed = name.trim()
      if (!trimmed) return
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? { ...p, name: trimmed } : p)),
      }))
      updateProjectApi(id, { name: trimmed }).catch((e) =>
        console.error('[openflow] 重命名失败', e),
      )
    },

    deleteProject: (id) => {
      set((state) => {
        const projects = state.projects.filter((p) => p.id !== id)
        const activeProjectId =
          state.activeProjectId === id
            ? (projects[0]?.id ?? null)
            : state.activeProjectId
        return { projects, activeProjectId }
      })
      deleteProjectApi(id).catch((e) => console.error('[openflow] 删除失败', e))
    },

    setActiveProject: (id) => set({ activeProjectId: id }),

    setHomeView: (view) => {
      localStorage.setItem(HOME_VIEW_KEY, view)
      set({ homeView: view })
    },

    onNodesChange: (changes) =>
      patchActive((p) => ({ ...p, nodes: applyNodeChanges(changes, p.nodes) })),

    onEdgesChange: (changes) =>
      patchActive((p) => ({ ...p, edges: applyEdgeChanges(changes, p.edges) })),

    onConnect: (connection) =>
      patchActive((p) => ({ ...p, edges: addEdge(connection, p.edges) })),

    onReconnect: (oldEdge, newConnection) =>
      patchActive((p) => ({ ...p, edges: reconnectEdge(oldEdge, newConnection, p.edges) })),

    addNode: (type, model, position) =>
      patchActive((p) => ({
        ...p,
        nodes: [...p.nodes, createNode(type, p.nodes.length, model, position)],
      })),

    addAssetNode: (kind, position) => {
      const id = newId('n_')
      const node: FlowNode = {
        id,
        type: 'asset',
        position,
        data: {
          label: kind === 'image' ? '图像素材' : '音频素材',
          kind,
          url: '',
          uploading: true,
        },
      }
      patchActive((p) => ({ ...p, nodes: [...p.nodes, node] }))
      return id
    },

    removeNode: (nodeId) =>
      patchActive((p) => ({
        ...p,
        nodes: p.nodes.filter((n) => n.id !== nodeId),
        // 一并清掉与该节点相关的连线
        edges: p.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      })),

    updateNodeData: (nodeId, data) =>
      patchActive((p) => ({
        ...p,
        nodes: p.nodes.map((n) =>
          n.id === nodeId ? ({ ...n, data: { ...n.data, ...data } } as FlowNode) : n,
        ),
      })),

    updateNodeDataInProject: (projectId, nodeId, data) =>
      set((state) => {
        const projects = state.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                nodes: p.nodes.map((n) =>
                  n.id === nodeId ? ({ ...n, data: { ...n.data, ...data } } as FlowNode) : n,
                ),
              }
            : p,
        )
        const target = projects.find((p) => p.id === projectId)
        if (target) scheduleSave(target)
        return { projects }
      }),

    addAgentGeneration: ({ prompt, model, title }) => {
      const { activeProjectId, projects } = get()
      const project = projects.find((p) => p.id === activeProjectId)
      if (!project) return null
      // 摆到现有内容下方，成对横排：Prompt 在左、图像节点在右（连续多组自然向下堆叠）
      const bottom = project.nodes.reduce((max, n) => {
        const height =
          n.measured?.height ?? AGENT_PLACE_FALLBACK_HEIGHT[n.type ?? 'prompt'] ?? 220
        return Math.max(max, n.position.y + height)
      }, 0)
      const y = project.nodes.length > 0 ? bottom + 60 : 80
      const cleanTitle = title?.trim()
      const promptNode: FlowNode = {
        id: newId('n_'),
        type: 'prompt',
        position: { x: 80, y },
        data: { label: cleanTitle || 'Prompt', text: prompt },
      }
      const imageNode = createNode('image', project.nodes.length, model, { x: 420, y })
      if (cleanTitle) imageNode.data.label = cleanTitle
      const edge: Edge = {
        id: newId('e_'),
        source: promptNode.id,
        target: imageNode.id,
        type: 'default',
      }
      patchActive((p) => ({
        ...p,
        nodes: [...p.nodes, promptNode, imageNode],
        edges: [...p.edges, edge],
      }))
      return { promptNodeId: promptNode.id, imageNodeId: imageNode.id }
    },

    addConnectedNode: ({ type, model, position, from }) =>
      patchActive((p) => {
        const node = createNode(type, p.nodes.length, model, position)
        // 只有 image/video 有输入(target) handle；从输出端拉出却选了无输入口的节点（Prompt）时，
        // 无处可连 → 只建节点不连线，避免生成一条挂空的坏边。
        const canBeTarget = type === 'image' || type === 'video'
        const edge: Edge | null =
          from.handleType === 'source'
            ? canBeTarget
              ? { id: newId('e_'), source: from.nodeId, target: node.id, type: 'default' }
              : null
            : { id: newId('e_'), source: node.id, target: from.nodeId, type: 'default' }
        return {
          ...p,
          nodes: [...p.nodes, node],
          edges: edge ? [...p.edges, edge] : p.edges,
        }
      }),
  }
})

/** 选择当前激活的项目（没有则为 undefined）。 */
export function useActiveProject(): Project | undefined {
  return useFlowStore((s) => s.projects.find((p) => p.id === s.activeProjectId))
}
